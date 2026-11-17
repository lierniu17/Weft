"""Generated summaries: 综合描述 of a person (AC-24) and of a Relationship (AC-28).

A graph write marks what it touched ``summary_stale`` (``GraphRepository._mark_stale``);
``refresh_stale`` regenerates those with DeepSeek and records when. It runs as a background
job after every confirmation and manual edit (routes), and from the command line
(``python -m weft.cli summaries refresh``). A failed generation stays stale for next time.

The prompt only hands over what the profile / relationship holds and forbids anything
else (「不得超出画像里已有的信息」); 转述 and 评价 must be worded as such. An empty profile
gets no summary at all rather than an invented one.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass
from typing import Any

from pydantic import BaseModel, ConfigDict, Field

from weft.domain.draft import FEELING_DIMENSION_LABELS, FEELING_LEVEL_LABELS
from weft.domain.graph_write import PREDICATE_LABELS
from weft.infra import Infra
from weft.llm import ChatMessage, ChatRequest
from weft.repositories.records import PairRecord, ProfileRecord
from weft.services._uow import graph
from weft.services.query_tools import STATUS_LABELS, fact_order

logger = logging.getLogger(__name__)

MAX_SUMMARY_LENGTH = 300
IDENTITY_LABELS = {"gender": "性别", "birthday": "生日", "hometown": "籍贯"}

PERSON_SYSTEM = """你为 Weft 的人物画像写一段综合描述（80 字以内的中文）。
只能使用输入里给出的信息，不得补充、推测或编造任何内容；没有提到的方面不要写。
可信度为“转述”的信息写成“据说……”，“推测”的写成“可能……”；
opinions 是用户（“你”）自己的评价，写成“你觉得……”，不要当成事实；
status 为 history 的是过去的情况（如以前的工作），unverified 的是待核实的说法。
只输出 JSON 对象：{"summary": "……"}"""

RELATIONSHIP_SYSTEM = """你为 Weft 里两个人物之间的关系写一段总结（80 字以内的中文）。
只能使用输入里给出的信息（关系类型、认识时间与途径、介绍人、现状、事实时间线、感受），
不得补充、推测或编造；可信度为“转述”的信息写成“据说……”。
只输出 JSON 对象：{"summary": "……"}"""


class _Summary(BaseModel):
    model_config = ConfigDict(extra="ignore")
    summary: str = Field(min_length=1)


@dataclass(frozen=True)
class Refreshed:
    persons: int
    relationships: int
    failed: int


def _person_payload(p: ProfileRecord) -> dict[str, Any] | None:
    facts = [
        {
            "label": PREDICATE_LABELS.get(f.predicate, f.predicate),
            "object": f.object,
            "text": f.fact,
            "status": "unverified" if f.unverified else ("history" if f.invalid_at else "current"),
            "confidence": f.confidence.label,
            **({"from": f.valid_at.isoformat()} if f.valid_at else {}),
            **({"until": f.invalid_at.isoformat()} if f.invalid_at else {}),
        }
        for f in sorted(p.facts, key=fact_order)
        if f.kind == "fact"
    ]
    opinions = [f.object for f in sorted(p.facts, key=fact_order) if f.kind == "opinion"]
    identity = [
        {"field": IDENTITY_LABELS.get(k, k), "value": v.value, "confidence": v.confidence.label}
        for k, v in sorted(p.identity.items())
    ]
    if not (facts or opinions or identity):
        return None
    return {
        "task": "summarize_person",
        "person": {"name": p.person.name, "aliases": list(p.person.aliases)},
        "identity": identity,
        "facts": facts,
        "opinions": opinions,
    }


def _relationship_payload(pair: PairRecord) -> dict[str, Any] | None:
    r = pair.relationship
    if r is None:
        return None
    names = {pair.a.id: pair.a.name, pair.b.id: pair.b.name}
    return {
        "task": "summarize_relationship",
        "pair": [names[r.person_a], names[r.person_b]],
        "types": [{"subtype": t.subtype, "original": t.original} for t in r.types],
        "met_at": r.met_at.isoformat() if r.met_at else None,
        "origin": r.origin,
        "introduced_by": r.introduced_by.name if r.introduced_by else None,
        "status": STATUS_LABELS.get(r.status or "", r.status),
        "confidence": r.confidence.label,
        "timeline": [
            {
                "date": f.valid_at.isoformat() if f.valid_at else None,
                "text": f.fact,
                "confidence": f.confidence.label,
            }
            for f in sorted(pair.facts, key=fact_order)
        ],
        "feelings": [
            {
                "from": names[fe.from_id],
                "to": names[fe.to_id],
                "dimension": FEELING_DIMENSION_LABELS[fe.dimension],
                "level": FEELING_LEVEL_LABELS[fe.dimension].get(fe.level, fe.level),
                "date": fe.occurred_at.isoformat(),
            }
            for fe in pair.feelings
        ],
    }


async def _generate(infra: Infra, system: str, payload: dict[str, Any]) -> str:
    result = await infra.llm.chat.chat_json(
        ChatRequest(
            model=infra.llm.model,
            temperature=0.0,
            messages=[
                ChatMessage(role="system", content=system),
                ChatMessage(role="user", content=json.dumps(payload, ensure_ascii=False)),
            ],
        ),
        _Summary,
    )
    return result.summary.strip()[:MAX_SUMMARY_LENGTH]


async def regenerate_person(infra: Infra, person_id: str) -> str | None:
    """Regenerate one person's 综合描述: the new text ("" for an empty profile, which gets
    no description), or None if the person does not exist."""
    g = graph(infra)
    profile = await g.get_profile(person_id)
    if profile is None:
        return None
    payload = _person_payload(profile)
    summary = "" if payload is None else await _generate(infra, PERSON_SYSTEM, payload)
    return summary if await g.set_person_summary(person_id, summary, infra.clock()) else None


async def regenerate_relationship(infra: Infra, a_id: str, b_id: str) -> bool:
    g = graph(infra)
    pair = await g.get_pair(a_id, b_id)
    if pair is None or pair.relationship is None:
        return False
    payload = _relationship_payload(pair)
    assert payload is not None
    summary = await _generate(infra, RELATIONSHIP_SYSTEM, payload)
    return await g.set_relationship_summary(pair.relationship.id, summary, infra.clock())


async def refresh_stale(infra: Infra, *, limit: int = 20) -> Refreshed:
    """Regenerate every stale summary of the session's tenant (at most ``limit`` of each)."""
    stale_persons, stale_pairs = await graph(infra).stale_summaries(limit)
    persons = relationships = failed = 0
    for person_id in stale_persons:
        try:
            persons += int(bool(await regenerate_person(infra, person_id)))
        except Exception as exc:  # one failure must not stop the others; stays stale
            logger.warning("summary of person %s failed: %r", person_id, exc)
            failed += 1
    for a_id, b_id in stale_pairs:
        try:
            relationships += int(await regenerate_relationship(infra, a_id, b_id))
        except Exception as exc:
            logger.warning("summary of relationship %s-%s failed: %r", a_id, b_id, exc)
            failed += 1
    return Refreshed(persons=persons, relationships=relationships, failed=failed)


__all__ = [
    "PERSON_SYSTEM",
    "RELATIONSHIP_SYSTEM",
    "Refreshed",
    "refresh_stale",
    "regenerate_person",
    "regenerate_relationship",
]
