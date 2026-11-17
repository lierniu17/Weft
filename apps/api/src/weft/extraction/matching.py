"""Person matching (人物匹配, AC-12 / AC-13): alias exact match, then an LLM judgement.

Graphiti's fuzzy dedup only handles Latin letters and digits, so Chinese names are matched
here (spec 「中文检索」):

1. 我 is Self.
2. Exactly one person whose name or alias equals the mention -> matched (AC-12, AC-13).
3. Several such persons -> they are the candidates, and the LLM decides from the Entry's
   context (「这客户」 picks the client among two 王芳); without a clue it answers 需选择.
4. Otherwise persons sharing a character with the mention (ignoring 老 / 小 / 阿 ... ) are
   candidates; none -> new person, without asking the LLM.
5. Candidates exist -> the LLM decides matched / ambiguous / new.
"""

from __future__ import annotations

import json
from dataclasses import dataclass
from enum import StrEnum

from pydantic import BaseModel, ConfigDict, Field

from weft.extraction.llm import ExtractionLLM
from weft.extraction.pipeline import MATCH_SYSTEM, SELF_MENTION
from weft.llm import ChatMessage, ChatRequest
from weft.repositories.records import PersonRecord

HONORIFICS = frozenset("老小阿大哥姐总叔姨弟妹哥嫂伯")
MAX_CANDIDATES = 8


class MatchDecision(StrEnum):
    MATCHED = "matched"
    AMBIGUOUS = "ambiguous"
    NEW = "new"


class _Judgement(BaseModel):
    model_config = ConfigDict(extra="ignore")
    decision: MatchDecision
    candidate_indices: list[int] = Field(default_factory=list)


@dataclass(frozen=True)
class MatchResult:
    decision: MatchDecision
    person: PersonRecord | None = None  # when matched
    candidates: tuple[PersonRecord, ...] = ()  # when ambiguous


def _core(mention: str) -> str:
    core = "".join(ch for ch in mention if ch not in HONORIFICS)
    return core or mention


def _shares_a_character(mention: str, person: PersonRecord) -> bool:
    names = person.name + "".join(person.aliases)
    return any(ch in names for ch in _core(mention))


async def match_person(
    llm: ExtractionLLM, *, mention: str, text: str, persons: list[PersonRecord]
) -> MatchResult:
    if mention == SELF_MENTION:
        me = next((p for p in persons if p.is_self), None)
        return MatchResult(MatchDecision.MATCHED, person=me)
    others = [p for p in persons if not p.is_self]
    exact = [p for p in others if p.name == mention or mention in p.aliases]
    if len(exact) == 1:
        return MatchResult(MatchDecision.MATCHED, person=exact[0])
    if len(exact) > 1:
        candidates = exact[:MAX_CANDIDATES]
    else:
        candidates = [p for p in others if _shares_a_character(mention, p)][:MAX_CANDIDATES]
    if not candidates:
        return MatchResult(MatchDecision.NEW)

    payload = {
        "task": "match_person",
        "entry": text,
        "mention": mention,
        "candidates": [
            {"index": i + 1, "name": p.name, "aliases": list(p.aliases), "note": p.note}
            for i, p in enumerate(candidates)
        ],
    }
    judgement = await llm.chat.chat_json(
        ChatRequest(
            model=llm.model,
            temperature=0.0,
            messages=[
                ChatMessage(role="system", content=MATCH_SYSTEM),
                ChatMessage(role="user", content=json.dumps(payload, ensure_ascii=False)),
            ],
        ),
        _Judgement,
    )
    picked = [candidates[i - 1] for i in judgement.candidate_indices if 1 <= i <= len(candidates)]
    if judgement.decision is MatchDecision.MATCHED and len(picked) == 1:
        return MatchResult(MatchDecision.MATCHED, person=picked[0])
    if judgement.decision is MatchDecision.NEW:
        return MatchResult(MatchDecision.NEW)
    return MatchResult(MatchDecision.AMBIGUOUS, candidates=tuple(picked or candidates))


__all__ = ["MatchDecision", "MatchResult", "match_person"]
