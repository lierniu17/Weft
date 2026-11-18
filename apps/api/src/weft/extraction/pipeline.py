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
from datetime import UTC, date, datetime
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
from weft.llm import ChatMessage, ChatRequest, LLMResponseError

logger = logging.getLogger(__name__)

SELF_MENTION = "我"

# --- Graphiti entity / edge types (docstrings are what Graphiti shows the LLM) -------


class Person(BaseModel):
    """人物：记录里提到的一个具体的人，用记录中的叫法作为名字（如“老张”“小李”“张伟”）。没有名字但指某个具体的人时（如某人的女儿、上司、伴侣），名字写成“<被参照人物>的<称谓>”（如“老陈的儿子”）。不包括写记录的“我”，也不包括泛指的一群人。"""


class Organization(BaseModel):
    """组织：公司、单位或机构（如“字节跳动”“阿里巴巴”“市一院”）。"""


class School(BaseModel):
    """学校：大学、中学等（如“清华大学”“北京四中”）。"""


class City(BaseModel):
    """城市或地区（如“杭州”“上海浦东”）。"""


class Trait(BaseModel):
    """性格特点（如“急性子”“爱开玩笑”“靠谱”）。"""


class Interest(BaseModel):
    """喜好或厌恶的对象：这个人自己喜欢、讨厌、爱做或不做的活动、食物、事物和习惯（如“钓鱼”“喝酒”“露营”“辣”“甜食”“被人打断”）。"""


class LifeEvent(BaseModel):
    """生活事件（如“升职”“结婚”“高考”“跳槽”）。"""


class Etiquette(BaseModel):
    """相处之道：给别人的建议——和这个人打交道时该怎么做、要避开什么（如“别在他面前提前妻”“找他办事要提前约”“他喝多了别劝”）。他本人的喜好、厌恶和习惯不是相处之道，是喜好或厌恶的对象。"""


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
    """人物自己不喜欢、讨厌、不吃或不做某事（他本人的习惯或口味）。"""


class Experienced(BaseModel):
    """人物经历了某个生活事件。"""


class HasEtiquette(BaseModel):
    """别人和这个人打交道时该怎么做或要避开什么（给别人的建议，不是他本人的喜好）。"""


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
    persons: list[str] = Field(default_factory=list)
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
    # The day the text was written, if its occurred date was read from the text (a message):
    # then 「上周末」「去年」 are relative to this day, not to the occurred date.
    written_on: date | None = None


# --- prompts -----------------------------------------------------------------------

ENRICH_SYSTEM = """你是 Weft 的信息整理助手。用户（“我”）写了一条和人有关的记录，
系统已经从中初步抽取出人物（persons）和候选事实（candidate_facts）。
请把它们整理成结构化的 JSON，只输出 JSON 对象，字段如下：

- persons：记录里提到的全部人物的叫法（不含“我”），按下方“人物叫法”的规则命名，
  和其他条目里用的叫法完全一致；包括只作为转述来源、没有其他条目的人物。

- facts：关于某个人物的事实。
  subject 是人物叫法（写记录的人用“我”）；predicate 取自 predicates 的键；
  object 是对象（组织、学校、城市、性格、爱好、事件、注意事项，或另一个人物的叫法）；
  confidence 是可信度（见下方“可信度”）；
  valid_at / valid_to 是事实发生或开始、结束的时间，格式 YYYY、YYYY-MM 或 YYYY-MM-DD。
  相对时间（“上周末”“去年”“上个月”）必须以 entry.occurred 为参照换算成具体日期；
  换算结果的精度不得超过 entry.precision（发生日期只到年时，只写年份）。
  index 是对应的候选事实编号，候选事实里没有的事实 index 为 null；
  不成立或与人无关的候选事实直接丢弃。
- relationships：两个人物之间的关系。pair 是两个人物的叫法；
  types 中每一项的 category 和 subtype 必须取自 relationship_types
  （放不下时用该大类的“其他”），original 保留记录中的原话；
  met_at 认识时间，origin 认识途径，introduced_by 介绍人叫法，
  status 取 active / distant / tense / estranged，confidence 见下方“可信度”。
- feelings：一个人物对另一个人物的感受，有方向（from 对 to）。
  dimension 取 closeness / affinity / trust，level 取 feeling_levels 中对应维度的键。
  每一项都必须带 confidence。
- profile：人物的身份信息，每一项都必须带 person（人物叫法）、field、value、confidence；
  field 取 name / gender / birthday / hometown。

事实的类别（predicate），容易混的是 喜好与厌恶 和 相处之道：
- LIKES / DISLIKES（画像里的“喜好与厌恶”）：这个人自己的喜好、厌恶、口味和习惯，
  说的是他本人怎样。例：“他爱吃甜食” → LIKES 甜食；“她从不碰咖啡” → DISLIKES 咖啡；
  “他最讨厌开会时被人打断” → DISLIKES 被人打断。不做、不吃的事也是 DISLIKES。
- HAS_ETIQUETTE（画像里的“相处之道”）：给别人的建议——和他打交道时该怎么做、要避开什么，
  说的是别人应该怎样。例：“别在他面前提他前妻”“找他办事要提前约”“他喝多了别劝”。
- 记录只说了他本人的喜好或习惯、没有说别人该怎么做时，用 LIKES / DISLIKES，
  不要改写成相处之道。

人物叫法：
- 输入里的 persons 是初步结果，可能漏人或叫法不合规则；输出时以下面的规则为准，
  同一个人在所有条目里只用一个叫法。
- 有名字或固定称呼的人，用记录里的名字或称呼，不要把前面修饰的关系词拼进去
  （“堂弟小军”叫“小军”，“我同事阿芳”叫“阿芳”）。
- 没有名字、但指的是某个具体的人（某人的家人、伴侣、上司、合伙人、朋友等）也是人物，
  称为“称谓人物”，叫法写成“<被参照人物的叫法>的<称谓>”，如“老陈的儿子”“阿芳的上司”；
  被参照人物是我时直接用称谓（“外公”“我爸”）。每个称谓人物都要在 relationships 里
  给出他和被参照人物的关系。
- 转述的来源（“X 说”“听 X 说”“X 告诉我”）如果是具体的人，也是人物。
- 不是人物：泛指或一群人（大家、同事们、几个朋友）、不具体的来源（“听人说”“听同事说”）、
  只出现一次的服务或职能角色（医生、店员、司机）。

关系：
- 亲属类有方向的类型（父母、子女、祖孙）读作“pair[0] 是 pair[1] 的 X”：
  “老陈的儿子”写成 pair ["老陈", "老陈的儿子"]、类型 父母（老陈是他儿子的父母）；
  我和我爸写成 pair ["我爸", "我"]、类型 父母。
- 记录里交代了某人和我的关系（称呼前的“我同事”“我表哥”“邻居”“前领导”，或认识经过），
  就输出我和此人的关系，即使这句话主要在讲别人之间的事。一句话里有多个人时，
  逐对检查：我和每个人、以及他们彼此之间。
- 一段关系可以同时有多个类型，记录里每一层关系都要写上
  （例如两人合伙开店后翻脸：合伙人 + 矛盾；同学后来成了夫妻：同学 + 配偶）。
- 在同一所学校读书期间认识的人（同班、同级、同社团、同宿舍）属于 同学（同宿舍再加 室友）。
- 吵架、闹翻、闹掰、有过节属于 矛盾；只有明确不再来往时才用 绝交。

可信度（confidence）——按“我是怎么知道的”判断，先看有没有转述来源：
- witnessed：我亲眼所见、亲身经历、直接观察到的。记录直接陈述、没有交代消息来源的事，
  按我亲身所知处理，也是 witnessed；我和别人之间的关系、我自己的感受一律是 witnessed；
  我亲眼看到的两人之间的关系（如看到他们在一起）也是 witnessed。
- self_told：当事人亲口告诉我他自己的事。说话人讲的是他自己和别人的关系或他自己的家人时
  （例：表弟说他女朋友在读研 → 表弟和他女朋友的关系是 self_told），也是 self_told。
- hearsay：别人转述的第三方的事（“听说”“听 X 说”“X 说 Y 怎样”，Y 不是说话人自己），
  或者来源不明的传闻。
- inferred：我的猜测或推断，或者从迹象推断出来的结论；内容本身带“估计”“好像”“可能”
  “感觉”“看样子”等不确定语气的也是 inferred。只是我对转述的真假表示怀疑
  （“不知道是不是真的”）时，仍按来源判断（hearsay）。

没有的内容输出空数组。不要编造记录中没有的信息。"""

MATCH_SYSTEM = """你负责判断一条记录里提到的人是不是图谱里已有的某个人物。
输入给出记录原文、提到的叫法（mention）和若干候选人物（名字、别名、和我的关系备注）。
只输出 JSON 对象：
{"decision": "matched" | "ambiguous" | "new", "candidate_indices": [候选编号]}
- matched：记录里的身份、场合或关系描述能明确对应到某一个候选人，candidate_indices 只放这一个编号；
- ambiguous：可能是其中几个，记录里没有足够线索区分，candidate_indices 列出所有可能的编号；
- new：记录表明这是另一个人（例如说明是新认识的、只是同名），candidate_indices 为空。"""


def _episode(inp: ExtractionInput) -> EpisodicNode:
    # Graphiti resolves 「上个月」「上周末」 against the episode's reference time, so when the
    # occurred date was read from the text that is the day of writing, not the occurred date
    # (else 「上个月跳槽」 written 11-18, occurred 2026-10, would land in 2026-09).
    day = inp.written_on if inp.written_on is not None else inp.occurred.first_day()
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


WRITTEN_ON_NOTE = (
    "occurred 是写这条记录的日子；event_occurred 是从原话里读出来的事情发生时间（已经换算好）。"
    "原话里的相对时间（“昨天”“上周末”“去年”“上个月”“明年”）照常以 occurred 为参照换算，"
    "不要再以 event_occurred 为参照重复换算；没有说时间的事实用 event_occurred。"
    "换算结果的精度不得超过 event_precision。"
)


def _entry_payload(inp: ExtractionInput) -> dict[str, Any]:
    # When the occurred date was read from the text (「上个月跳槽」 → 2026-10), the system
    # prompt's reference (entry.occurred) must be the day of writing: the model follows that
    # rule over any note, and would otherwise shift 上个月 twice (2026-09).
    if inp.written_on is not None and inp.occurred != PartialDate.from_date(inp.written_on):
        return {
            "text": inp.text,
            "occurred": inp.written_on.isoformat(),
            "precision": "day",
            "event_occurred": inp.occurred.isoformat(),
            "event_precision": inp.occurred.precision.value,
            "time_note": WRITTEN_ON_NOTE,
        }
    return {
        "text": inp.text,
        "occurred": inp.occurred.isoformat(),
        "precision": inp.occurred.precision.value,
    }


def _enrich_payload(
    inp: ExtractionInput, persons: list[str], candidates: list[dict[str, Any]]
) -> dict[str, Any]:
    return {
        "task": "enrich",
        "entry": _entry_payload(inp),
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


ENRICH_RETRY = """上面的输出没有通过校验，问题如下：
{errors}
请改正这些问题，重新输出完整的 JSON 对象（所有条目都要带齐必填字段）。"""
MAX_REPORTED_ERRORS = 20

_SECTIONS: dict[str, type[BaseModel]] = {
    "facts": EnrichedFact,
    "relationships": EnrichedRelationship,
    "feelings": EnrichedFeeling,
    "profile": EnrichedProfile,
}


def _validation_errors(content: str) -> str | None:
    """Why ``content`` is not a valid ``Enrichment`` (``None`` if it is), for the model."""
    try:
        Enrichment.model_validate_json(content)
    except ValidationError as exc:
        lines = [
            f"- {'.'.join(str(part) for part in err['loc']) or '(根)'}: {err['msg']}"
            for err in exc.errors()[:MAX_REPORTED_ERRORS]
        ]
        return "\n".join(lines)
    return None


def _valid_items(content: str) -> Enrichment | None:
    """The valid items of a JSON object that failed validation as a whole; ``None`` if
    ``content`` is not a JSON object at all."""
    try:
        data = json.loads(content)
    except ValueError:
        return None
    if not isinstance(data, dict):
        return None
    sections: dict[str, list[Any]] = {}
    for name, model in _SECTIONS.items():
        items = data.get(name)
        kept: list[Any] = []
        for item in items if isinstance(items, list) else []:
            try:
                kept.append(model.model_validate(item))
            except ValidationError:
                continue
        sections[name] = kept
    names = data.get("persons")
    persons = [n for n in names if isinstance(n, str)] if isinstance(names, list) else []
    return Enrichment.model_validate({"persons": persons, **sections})


async def _enrich(llm: ExtractionLLM, payload: dict[str, Any]) -> Enrichment:
    """The enrichment call. Output that fails validation is sent back once with the
    validation errors; if the second answer still fails, only its invalid items are
    dropped (falling back to the first answer if the second is not JSON at all)."""
    messages = [
        ChatMessage(role="system", content=ENRICH_SYSTEM),
        ChatMessage(role="user", content=json.dumps(payload, ensure_ascii=False)),
    ]
    request = ChatRequest(model=llm.model, temperature=0.0, messages=messages, json_output=True)
    first = (await llm.chat.chat(request)).content or ""
    errors = _validation_errors(first)
    if errors is None:
        return Enrichment.model_validate_json(first)
    logger.info("enrichment output invalid, asking again: %s", errors)
    retry = request.model_copy(
        update={
            "messages": [
                *messages,
                ChatMessage(role="assistant", content=first),
                ChatMessage(role="user", content=ENRICH_RETRY.format(errors=errors)),
            ]
        }
    )
    second = (await llm.chat.chat(retry)).content or ""
    errors = _validation_errors(second)
    if errors is None:
        return Enrichment.model_validate_json(second)
    for answer in (second, first):
        kept = _valid_items(answer)
        if kept is not None:
            logger.warning("enrichment output still invalid, dropping invalid items: %s", errors)
            return kept
    raise LLMResponseError(f"enrichment output is not a JSON object: {errors}")


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
    enriched = await _enrich(llm, _enrich_payload(inp, person_names, candidates))
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

    for name in e.persons or person_names:
        if name.strip() != SELF_MENTION:
            mention(name)
    known_persons = set(mentions) | {SELF_MENTION}

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
