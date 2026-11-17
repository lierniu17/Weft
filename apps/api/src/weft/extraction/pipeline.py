"""Extraction pipeline: Entry text -> raw extraction (spec 「录入与草稿流程」 step 2).

1. Graphiti ``extract_nodes`` — entities, classified into Weft's entity types.
2. Graphiti ``extract_edges`` — candidate facts between them, with the Entry's occurred
   date as the reference time.
3. Weft's own enrichment call (DeepSeek, JSON) — turns the candidates into Draft facts
   with predicate, Confidence and dates with precision, and adds Relationships, Feelings and
   identity (profile) fields, classifying Relationship Types into the user's vocabulary.

Never calls Graphiti's ``add_episode`` and never touches the database: person matching,
conflict detection and every write happen in the service layer through the tenant-scoped
repository (ADR-0001). Graphiti's own entity / fact resolution is not used: its fuzzy name
dedup does not work for Chinese names (spec 「中文检索」), so persons are matched by alias
plus an LLM judgement (``weft.extraction.matching``) and facts by the confidence rule.
"""

from __future__ import annotations

import json
import logging
from dataclasses import dataclass, field
from datetime import UTC, datetime
from typing import Annotated, Any

from graphiti_core.nodes import EpisodeType, EpisodicNode
from graphiti_core.utils.maintenance.edge_operations import extract_edges
from graphiti_core.utils.maintenance.node_operations import extract_nodes
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from weft.domain.confidence import Confidence
from weft.domain.dates import PartialDate, clamp_to_entry_precision
from weft.domain.draft import (
    FEELING_DIMENSION_LABELS,
    FEELING_LEVEL_LABELS,
    ProfileField,
    RelationshipStatus,
)
from weft.domain.graph_write import PREDICATE_LABELS, PREDICATE_TARGETS
from weft.domain.taxonomy import Category, RelationshipType, Taxonomy
from weft.extraction.llm import ExtractionLLM
from weft.llm import ChatMessage, ChatRequest

logger = logging.getLogger(__name__)

SELF_MENTION = "我"

# --- Graphiti entity / edge types (docstrings are what Graphiti shows the LLM) -------


class Person(BaseModel):
    """人物：记录里提到的一个具体的人，用记录中的叫法作为名字（如“老张”“小李”“张伟”）。不包括写记录的“我”。"""


class Organization(BaseModel):
    """组织：公司、单位或机构（如“字节跳动”“阿里巴巴”“市一院”）。"""


class School(BaseModel):
    """学校：大学、中学等（如“清华大学”“北京四中”）。"""


class City(BaseModel):
    """城市或地区（如“杭州”“上海浦东”）。"""


class Trait(BaseModel):
    """性格特点（如“急性子”“爱开玩笑”“靠谱”）。"""


class Interest(BaseModel):
    """喜好或厌恶的对象：活动、食物、事物（如“钓鱼”“喝酒”“露营”“辣”）。"""


class LifeEvent(BaseModel):
    """生活事件（如“升职”“结婚”“女儿高考”“跳槽”）。"""


class Etiquette(BaseModel):
    """相处之道：和这个人相处时要注意的事（如“不要提他前妻”“不吃辣”）。"""


ENTITY_TYPES: dict[str, type[BaseModel]] = {
    "Person": Person,
    "Organization": Organization,
    "School": School,
    "City": City,
    "Trait": Trait,
    "Interest": Interest,
    "LifeEvent": LifeEvent,
    "Etiquette": Etiquette,
}
ENTITY_TYPE_NAMES = tuple(ENTITY_TYPES)


class WorksAt(BaseModel):
    """人物在某个组织工作。"""


class StudiedAt(BaseModel):
    """人物在某所学校上学或毕业于某所学校。"""


class LivesIn(BaseModel):
    """人物住在某个城市或地区。"""


class HasTrait(BaseModel):
    """人物具有某种性格特点。"""


class Likes(BaseModel):
    """人物喜欢某个活动、食物或事物。"""


class Dislikes(BaseModel):
    """人物不喜欢、不吃或不做某事。"""


class Experienced(BaseModel):
    """人物经历了某个生活事件。"""


class HasEtiquette(BaseModel):
    """和人物相处时要注意的事。"""


EDGE_TYPES: dict[str, type[BaseModel]] = {
    "WORKS_AT": WorksAt,
    "STUDIED_AT": StudiedAt,
    "LIVES_IN": LivesIn,
    "HAS_TRAIT": HasTrait,
    "LIKES": Likes,
    "DISLIKES": Dislikes,
    "EXPERIENCED": Experienced,
    "HAS_ETIQUETTE": HasEtiquette,
}
EDGE_TYPE_MAP: dict[tuple[str, str], list[str]] = {
    ("Person", "Organization"): ["WORKS_AT"],
    ("Person", "School"): ["STUDIED_AT"],
    ("Person", "City"): ["LIVES_IN"],
    ("Person", "Trait"): ["HAS_TRAIT"],
    ("Person", "Interest"): ["LIKES", "DISLIKES"],
    ("Person", "LifeEvent"): ["EXPERIENCED"],
    ("Person", "Etiquette"): ["HAS_ETIQUETTE"],
}

# --- enrichment output (validated LLM JSON) -------------------------------------


class _Out(BaseModel):
    model_config = ConfigDict(extra="ignore", populate_by_name=True)


class EnrichedFact(_Out):
    index: int | None = None
    subject: str
    predicate: str
    object: str
    confidence: Confidence
    valid_at: str | None = None
    valid_to: str | None = None


class EnrichedType(_Out):
    category: Category
    subtype: str
    original: str


class EnrichedRelationship(_Out):
    pair: Annotated[list[str], Field(min_length=2, max_length=2)]
    types: list[EnrichedType] = Field(default_factory=list)
    met_at: str | None = None
    origin: str | None = None
    introduced_by: str | None = None
    status: RelationshipStatus | None = None
    confidence: Confidence


class EnrichedFeeling(_Out):
    from_: str = Field(alias="from")
    to: str
    dimension: str
    level: str
    confidence: Confidence


class EnrichedProfile(_Out):
    person: str
    field: ProfileField
    value: str
    confidence: Confidence


class Enrichment(_Out):
    facts: list[EnrichedFact] = Field(default_factory=list)
    relationships: list[EnrichedRelationship] = Field(default_factory=list)
    feelings: list[EnrichedFeeling] = Field(default_factory=list)
    profile: list[EnrichedProfile] = Field(default_factory=list)


# --- result ------------------------------------------------------------------------


@dataclass(frozen=True)
class RawFact:
    subject: str
    predicate: str
    object: str
    confidence: Confidence
    valid_at: PartialDate | None = None
    valid_to: PartialDate | None = None


@dataclass(frozen=True)
class RawRelationship:
    pair: tuple[str, str]
    types: tuple[RelationshipType, ...]
    confidence: Confidence
    met_at: PartialDate | None = None
    origin: str | None = None
    introduced_by: str | None = None
    status: RelationshipStatus | None = None


@dataclass(frozen=True)
class RawFeeling:
    from_: str
    to: str
    dimension: str
    level: str
    confidence: Confidence


@dataclass(frozen=True)
class RawProfile:
    person: str
    field: ProfileField
    value: str
    confidence: Confidence


@dataclass(frozen=True)
class RawExtraction:
    persons: list[str] = field(default_factory=list)  # mentions, first appearance order
    facts: list[RawFact] = field(default_factory=list)
    relationships: list[RawRelationship] = field(default_factory=list)
    feelings: list[RawFeeling] = field(default_factory=list)
    profile: list[RawProfile] = field(default_factory=list)


@dataclass(frozen=True)
class ExtractionInput:
    text: str
    occurred: PartialDate
    group_id: str
    taxonomy: Taxonomy


# --- prompts -----------------------------------------------------------------------

ENRICH_SYSTEM = """你是 Weft 的信息整理助手。用户（“我”）写了一条和人有关的记录，
系统已经从中初步抽取出人物（persons）和候选事实（candidate_facts）。
请把它们整理成结构化的 JSON，只输出 JSON 对象，字段如下：

- facts：关于某个人物的事实。
  subject 是人物叫法（写记录的人用“我”）；predicate 取自 predicates 的键；
  object 是对象（组织、学校、城市、性格、爱好、事件、注意事项，或另一个人物的叫法）；
  confidence 是可信度：witnessed（我亲眼所见、亲身经历）、self_told（当事人亲口说的）、
  hearsay（别人转述的）、inferred（我的猜测或推断）；
  valid_at / valid_to 是事实发生或开始、结束的时间，格式 YYYY、YYYY-MM 或 YYYY-MM-DD。
  相对时间（“上周末”“去年”“上个月”）必须以 entry.occurred 为参照换算成具体日期；
  换算结果的精度不得超过 entry.precision（发生日期只到年时，只写年份）。
  index 是对应的候选事实编号，候选事实里没有的事实 index 为 null；
  不成立或与人无关的候选事实直接丢弃。
- relationships：两个人物之间的关系。pair 是两个人物的叫法；
  types 中每一项的 category 和 subtype 必须取自 relationship_types
  （放不下时用该大类的“其他”），original 保留记录中的原话；
  met_at 认识时间，origin 认识途径，introduced_by 介绍人叫法，
  status 取 active / distant / tense / estranged，confidence 同上。
- feelings：一个人物对另一个人物的感受，有方向（from 对 to）。
  dimension 取 closeness / affinity / trust，level 取 feeling_levels 中对应维度的键。
- profile：人物的身份信息，field 取 name / gender / birthday / hometown。

没有的内容输出空数组。不要编造记录中没有的信息。"""

MATCH_SYSTEM = """你负责判断一条记录里提到的人是不是图谱里已有的某个人物。
输入给出记录原文、提到的叫法（mention）和若干候选人物。只输出 JSON 对象：
{"decision": "matched" | "ambiguous" | "new", "candidate_indices": [候选编号]}
- matched：能确定是某一个候选人，candidate_indices 只放这一个编号；
- ambiguous：可能是其中几个，拿不准，candidate_indices 列出所有可能的编号；
- new：不是任何候选人，candidate_indices 为空。"""


def _episode(inp: ExtractionInput) -> EpisodicNode:
    day = inp.occurred.first_day()
    reference = datetime(day.year, day.month, day.day, tzinfo=UTC)
    return EpisodicNode(
        name="weft entry",
        group_id=inp.group_id,
        content=inp.text,
        source=EpisodeType.text,
        source_description="Weft entry",
        valid_at=reference,
        created_at=reference,
    )


def _date(value: str | None, *, entry: PartialDate) -> PartialDate | None:
    if not value:
        return None
    try:
        parsed = PartialDate.parse(value.strip())
    except ValueError:
        return None
    return clamp_to_entry_precision(parsed, entry=entry)


def _enrich_payload(
    inp: ExtractionInput, persons: list[str], candidates: list[dict[str, Any]]
) -> dict[str, Any]:
    return {
        "task": "enrich",
        "entry": {
            "text": inp.text,
            "occurred": inp.occurred.isoformat(),
            "precision": inp.occurred.precision.value,
        },
        "writer": SELF_MENTION,
        "persons": persons,
        "candidate_facts": candidates,
        "predicates": {**PREDICATE_LABELS},
        "relationship_types": {c.value: names for c, names in inp.taxonomy.options().items()},
        "feeling_levels": {
            dim: {"label": FEELING_DIMENSION_LABELS[dim], "levels": levels}
            for dim, levels in FEELING_LEVEL_LABELS.items()
        },
        "profile_fields": [f.value for f in ProfileField],
    }


async def _enrich(llm: ExtractionLLM, payload: dict[str, Any]) -> Enrichment:
    request = ChatRequest(
        model=llm.model,
        temperature=0.0,
        messages=[
            ChatMessage(role="system", content=ENRICH_SYSTEM),
            ChatMessage(role="user", content=json.dumps(payload, ensure_ascii=False)),
        ],
    )
    return await llm.chat.chat_json(request, Enrichment)


def _feeling_ok(dimension: str, level: str) -> bool:
    return level in FEELING_LEVEL_LABELS.get(dimension, {})


async def extract(llm: ExtractionLLM, inp: ExtractionInput) -> RawExtraction:
    """Run the pipeline. Raises on LLM failure (the caller marks the Draft 抽取失败)."""
    episode = _episode(inp)
    nodes, _ = await extract_nodes(llm.graphiti, episode, [], entity_types=ENTITY_TYPES)
    for node in nodes:
        # Graphiti builds labels from a set; fix their order so the next prompt (and so the
        # replay fixture key) does not depend on hash randomization.
        node.labels = sorted(node.labels)
    person_names = [n.name for n in nodes if "Person" in n.labels and n.name != SELF_MENTION]
    candidates: list[dict[str, Any]] = []
    if nodes:
        edges, _ = await extract_edges(
            llm.graphiti,
            episode,
            nodes,
            [],
            EDGE_TYPE_MAP,
            group_id=inp.group_id,
            edge_types=EDGE_TYPES,
        )
        by_uuid = {n.uuid: n.name for n in nodes}
        candidates = [
            {
                "index": i,
                "source": by_uuid.get(e.source_node_uuid, ""),
                "relation": e.name,
                "target": by_uuid.get(e.target_node_uuid, ""),
                "fact": e.fact,
            }
            for i, e in enumerate(edges)
        ]
    try:
        enriched = await _enrich(llm, _enrich_payload(inp, person_names, candidates))
    except ValidationError as exc:  # pragma: no cover - chat_json wraps this already
        raise ValueError(f"enrichment output invalid: {exc}") from exc
    return _assemble(inp, person_names, enriched)


def _assemble(inp: ExtractionInput, person_names: list[str], e: Enrichment) -> RawExtraction:
    mentions: list[str] = []

    def mention(name: str | None) -> str | None:
        if name is None:
            return None
        name = name.strip()
        if not name:
            return None
        if name not in mentions:
            mentions.append(name)
        return name

    for name in person_names:
        mention(name)
    known_persons = set(person_names) | {SELF_MENTION}

    facts: list[RawFact] = []
    for f in e.facts:
        subject = mention(f.subject)
        obj = f.object.strip()
        if subject is None or not obj or not f.predicate.strip():
            continue
        valid_at = _date(f.valid_at, entry=inp.occurred)
        valid_to = _date(f.valid_to, entry=inp.occurred)
        if valid_at and valid_to and valid_to.last_day() < valid_at.first_day():
            valid_to = None
        predicate = f.predicate.strip().upper()
        if predicate not in PREDICATE_TARGETS and obj in known_persons:
            mention(obj)
        facts.append(
            RawFact(subject, predicate, obj, f.confidence, valid_at=valid_at, valid_to=valid_to)
        )

    relationships: list[RawRelationship] = []
    for r in e.relationships:
        a, b = mention(r.pair[0]), mention(r.pair[1])
        if a is None or b is None or a == b:
            continue
        types = tuple(
            inp.taxonomy.normalize(t.category, t.subtype, original=t.original) for t in r.types
        )
        relationships.append(
            RawRelationship(
                pair=(a, b),
                types=types,
                confidence=r.confidence,
                met_at=_date(r.met_at, entry=inp.occurred),
                origin=(r.origin or "").strip() or None,
                introduced_by=mention(r.introduced_by),
                status=r.status,
            )
        )

    feelings: list[RawFeeling] = []
    for fe in e.feelings:
        src, dst = mention(fe.from_), mention(fe.to)
        if src is None or dst is None or src == dst or not _feeling_ok(fe.dimension, fe.level):
            continue
        feelings.append(RawFeeling(src, dst, fe.dimension, fe.level, fe.confidence))

    profile: list[RawProfile] = []
    for p in e.profile:
        who = mention(p.person)
        if who is None or not p.value.strip():
            continue
        profile.append(RawProfile(who, p.field, p.value.strip(), p.confidence))

    return RawExtraction(
        persons=mentions,
        facts=facts,
        relationships=relationships,
        feelings=feelings,
        profile=profile,
    )


__all__ = [
    "EDGE_TYPES",
    "EDGE_TYPE_MAP",
    "ENTITY_TYPES",
    "ENTITY_TYPE_NAMES",
    "SELF_MENTION",
    "ExtractionInput",
    "RawExtraction",
    "RawFact",
    "RawFeeling",
    "RawProfile",
    "RawRelationship",
    "extract",
]
