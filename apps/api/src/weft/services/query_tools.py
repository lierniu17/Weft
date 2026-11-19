"""Fixed Q&A query tools (spec 「问答」, ADR-0001, AC-36, AC-39).

The only way 问答 reads the graph. Each tool:

* runs in the session's tenant (``require_tenant``) through the tenant-scoped repositories
  or ``ScopedGraphiti`` — none accepts a tenant argument (a ``group_id=`` keyword is a
  ``TypeError``), and none executes model-written queries;
* returns domain records carrying their sources (Entry ids), so every claim built on them
  can cite the Entries behind it (AC-37).

Tools: ``find_person``, ``read_profile``, ``read_relationship``, ``find_path``,
``filter_persons``, ``count_persons``, ``time_query``, ``semantic_search``.
"""

from __future__ import annotations

import itertools
from collections import deque
from dataclasses import dataclass, field
from typing import Literal

from weft.domain.confidence import Confidence
from weft.domain.dates import PartialDate
from weft.domain.draft import FEELING_DIMENSION_LABELS, FEELING_LEVEL_LABELS
from weft.domain.feelings import by_direction
from weft.domain.graph_view import closeness_rank
from weft.domain.graph_write import fact_label
from weft.domain.taxonomy import Category
from weft.domain.tenancy import ScopedGraphiti, require_tenant
from weft.infra import Infra
from weft.repositories.graph_query import GraphQueryRepository
from weft.repositories.records import (
    FactRecord,
    FeelingRecord,
    PairRecord,
    PersonRecord,
    ProfileRecord,
    RelationshipRecord,
)
from weft.services._uow import graph

MAX_PATH_HOPS = 4
SELF_WORDS = frozenset({"我", "本人", "自己"})
STATUS_LABELS = {"active": "活跃", "distant": "疏远", "tense": "紧张", "estranged": "断联"}


def _queries(infra: Infra) -> GraphQueryRepository:
    return GraphQueryRepository(infra.neo4j, require_tenant())


def overlaps(value: PartialDate | None, start: PartialDate | None, end: PartialDate | None) -> bool:
    """Does the (imprecise) date fall in [start, end]? Unknown dates never do."""
    if value is None:
        return False
    if start is not None and value.last_day() < start.first_day():
        return False
    return not (end is not None and value.first_day() > end.last_day())


def _by_name(p: PersonRecord) -> tuple[bool, str, str]:
    return (not p.is_self, p.name, p.id)


def fact_order(f: FactRecord) -> tuple[str, str, str, str]:
    when = f.valid_at.isoformat() if f.valid_at else ""
    return (when, f.predicate, f.object, f.id)


# --- find person / profile / pair -----------------------------------------------------


async def find_person(infra: Infra, name: str) -> list[PersonRecord]:
    """Persons named or aliased ``name`` (exact first, else containing it); "" lists all."""
    people = await graph(infra).list_persons()
    query = name.strip()
    if not query:
        return sorted(people, key=_by_name)
    if query in SELF_WORDS:
        return [p for p in people if p.is_self]
    exact = [p for p in people if p.name == query or query in p.aliases]
    if exact:
        return sorted(exact, key=_by_name)
    return sorted(
        (p for p in people if query in p.name or any(query in a for a in p.aliases)),
        key=_by_name,
    )


async def read_profile(infra: Infra, person_id: str) -> ProfileRecord | None:
    """Identity, every fact (current, history, 待核实), 我的评价, summary, and their sources."""
    profile = await graph(infra).get_profile(person_id)
    if profile is None:
        return None
    return ProfileRecord(
        person=profile.person,
        identity=profile.identity,
        facts=sorted(profile.facts, key=fact_order),
        summary=profile.summary,
        summary_generated_at=profile.summary_generated_at,
        episodes=profile.episodes,
    )


async def read_relationship(infra: Infra, a_id: str, b_id: str) -> PairRecord | None:
    """The pair's Relationship, the timeline of facts between them and both feelings."""
    return await graph(infra).get_pair(a_id, b_id)


async def all_relationships(infra: Infra) -> list[RelationshipRecord]:
    return await _queries(infra).relationships()


async def all_facts(infra: Infra) -> list[FactRecord]:
    """Every unexpired fact and opinion, current or not (for 按描述找人)."""
    return await _queries(infra).facts()


# --- path -------------------------------------------------------------------------------


@dataclass(frozen=True)
class PathResult:
    persons: list[PersonRecord]  # from the first person to the last
    relationships: list[RelationshipRecord]  # between consecutive persons
    introduced_by: PersonRecord | None = None  # the chain is how the two were introduced
    direct: RelationshipRecord | None = None  # their own relationship, if any


def _pair_key(a: str, b: str) -> frozenset[str]:
    return frozenset((a, b))


async def find_path(
    infra: Infra, from_id: str, to_id: str, *, max_hops: int = MAX_PATH_HOPS
) -> PathResult | None:
    """人脉路径: how ``from`` knows ``to``.

    If the two have a Relationship with an introducer (介绍人), the chain is
    from → introducer → to (「我是怎么认识小王的」). Otherwise the shortest chain of
    Relationships, at most ``max_hops`` long (「通过谁能认识某人」).
    """
    if from_id == to_id:
        return None
    people = {p.id: p for p in await graph(infra).list_persons()}
    if from_id not in people or to_id not in people:
        return None
    rels = await _queries(infra).relationships()
    by_pair = {_pair_key(r.person_a, r.person_b): r for r in rels}
    direct = by_pair.get(_pair_key(from_id, to_id))
    if direct is not None and direct.introduced_by is not None:
        via = direct.introduced_by.id
        first, second = by_pair.get(_pair_key(from_id, via)), by_pair.get(_pair_key(via, to_id))
        if first is not None and second is not None:
            return PathResult(
                persons=[people[from_id], people[via], people[to_id]],
                relationships=[first, second],
                introduced_by=people[via],
                direct=direct,
            )
    if direct is not None:
        return PathResult([people[from_id], people[to_id]], [direct], direct=direct)

    neighbours: dict[str, list[str]] = {}
    for r in rels:
        neighbours.setdefault(r.person_a, []).append(r.person_b)
        neighbours.setdefault(r.person_b, []).append(r.person_a)
    order = {pid: _by_name(p) for pid, p in people.items()}
    previous: dict[str, str] = {from_id: from_id}
    queue: deque[tuple[str, int]] = deque([(from_id, 0)])
    while queue:
        current, depth = queue.popleft()
        if current == to_id:
            break
        if depth == max_hops:
            continue
        for nxt in sorted(neighbours.get(current, []), key=lambda i: order.get(i, (True, "", i))):
            if nxt not in previous and nxt in people:
                previous[nxt] = current
                queue.append((nxt, depth + 1))
    if to_id not in previous:
        return None
    chain = [to_id]
    while chain[-1] != from_id:
        chain.append(previous[chain[-1]])
    chain.reverse()
    return PathResult(
        persons=[people[i] for i in chain],
        relationships=[by_pair[_pair_key(x, y)] for x, y in itertools.pairwise(chain)],
    )


# --- filter / count -----------------------------------------------------------------------


@dataclass(frozen=True)
class PersonFilter:
    """条件筛选. Every given condition must hold; Self and ``relative_to`` are never listed."""

    relationship_category: Category | None = None
    relationship_subtype: str | None = None  # the subtype, or words of the original wording
    relative_to: str | None = None  # whose relationships / closeness; default Self
    min_closeness: str | None = None  # relative_to's current closeness to the person
    predicate: str | None = None  # WORKS_AT / STUDIED_AT / LIVES_IN / LIKES / ...
    object_keywords: tuple[str, ...] = ()  # any of them in the fact's object
    include_history: bool = False  # also facts no longer current (e.g. former employers)
    met_from: PartialDate | None = None  # relative_to met the person in this period
    met_to: PartialDate | None = None

    def is_empty(self) -> bool:
        conditions = (
            self.relationship_category,
            self.relationship_subtype,
            self.min_closeness,
            self.predicate,
            self.object_keywords,
            self.met_from,
            self.met_to,
        )
        return not any(conditions)


@dataclass(frozen=True)
class PersonMatch:
    person: PersonRecord
    facts: list[FactRecord] = field(default_factory=list)  # the facts that matched
    relationship: RelationshipRecord | None = None  # with relative_to
    closeness: FeelingRecord | None = None  # relative_to's current closeness to the person


@dataclass(frozen=True)
class CountResult:
    count: int
    matches: list[PersonMatch]


def _type_matches(r: RelationshipRecord, f: PersonFilter) -> bool:
    for t in r.types:
        if f.relationship_category is not None and t.category != f.relationship_category.value:
            continue
        wanted = (f.relationship_subtype or "").strip()
        if wanted and wanted != t.subtype and wanted not in t.original:
            continue
        return True
    return False


def _fact_matches(fact: FactRecord, f: PersonFilter) -> bool:
    if fact.kind != "fact":
        return False
    if f.predicate and fact.predicate != f.predicate.strip().upper():
        return False
    if f.object_keywords and not any(k and k in fact.object for k in f.object_keywords):
        return False
    return f.include_history or fact.invalid_at is None


async def filter_persons(infra: Infra, f: PersonFilter) -> list[PersonMatch]:
    if f.is_empty():
        raise ValueError("条件筛选至少需要一个条件")
    g, q = graph(infra), _queries(infra)
    people = await g.list_persons()
    me = next(p for p in people if p.is_self)
    anchor = f.relative_to or me.id
    rels = {
        (r.person_b if r.person_a == anchor else r.person_a): r
        for r in await q.relationships()
        if anchor in (r.person_a, r.person_b)
    }
    needs_facts = bool(f.predicate or f.object_keywords)
    facts = await q.facts() if needs_facts else []
    closeness: dict[str, FeelingRecord] = {}
    if f.min_closeness:
        feelings = await q.feelings()
        for person in people:
            views = by_direction(feelings, anchor, person.id)
            if "closeness" in views:
                closeness[person.id] = views["closeness"].current

    matches: list[PersonMatch] = []
    for person in sorted(people, key=_by_name):
        if person.is_self or person.id == anchor:
            continue
        rel = rels.get(person.id)
        wants_type = f.relationship_category is not None or bool(f.relationship_subtype)
        if wants_type and (rel is None or not _type_matches(rel, f)):
            continue
        if (f.met_from or f.met_to) and not (
            rel is not None and overlaps(rel.met_at, f.met_from, f.met_to)
        ):
            continue
        feeling = closeness.get(person.id)
        if f.min_closeness and (
            feeling is None or closeness_rank(feeling.level) < closeness_rank(f.min_closeness)
        ):
            continue
        matched = sorted(
            (x for x in facts if x.subject_id == person.id and _fact_matches(x, f)),
            key=fact_order,
        )
        if needs_facts and not matched:
            continue
        matches.append(PersonMatch(person, matched, rel, feeling))
    return matches


async def count_persons(infra: Infra, f: PersonFilter) -> CountResult:
    """聚合统计: how many persons match, and who they are."""
    matches = await filter_persons(infra, f)
    return CountResult(count=len(matches), matches=matches)


# --- time ---------------------------------------------------------------------------------


@dataclass(frozen=True)
class TimelineEvent:
    date: PartialDate | None
    kind: Literal["fact", "fact_ended", "feeling", "met", "status"]
    text: str
    confidence: Confidence
    sources: tuple[str, ...]


@dataclass(frozen=True)
class TimeQuery:
    """时间查询.

    * ``met``: persons ``person_a`` (default Self) met in [start, end];
    * ``pair_events``: what happened between ``person_a`` and ``person_b`` (in the period);
    * ``facts``: facts that began or ended in [start, end] (of ``person_a`` if given).
    """

    kind: Literal["met", "pair_events", "facts"]
    start: PartialDate | None = None
    end: PartialDate | None = None
    person_a: str | None = None
    person_b: str | None = None


@dataclass(frozen=True)
class TimeResult:
    met: list[PersonMatch] = field(default_factory=list)
    events: list[TimelineEvent] = field(default_factory=list)
    facts: list[tuple[PersonRecord, FactRecord]] = field(default_factory=list)
    pair: PairRecord | None = None


def _event_order(e: TimelineEvent) -> tuple[str, str, str]:
    return (e.date.isoformat() if e.date else "9999", e.kind, e.text)


async def time_query(infra: Infra, t: TimeQuery) -> TimeResult:
    g, q = graph(infra), _queries(infra)
    people = {p.id: p for p in await g.list_persons()}
    me = next(p for p in people.values() if p.is_self)
    if t.kind == "met":
        anchor = t.person_a or me.id
        met = [
            PersonMatch(people[other], relationship=r)
            for r in await q.relationships()
            if anchor in (r.person_a, r.person_b)
            and (other := r.person_b if r.person_a == anchor else r.person_a) in people
            and overlaps(r.met_at, t.start, t.end)
        ]
        return TimeResult(met=sorted(met, key=lambda m: _by_name(m.person)))
    if t.kind == "pair_events":
        if not t.person_a or not t.person_b:
            raise ValueError("pair_events 需要两个人物")
        pair = await g.get_pair(t.person_a, t.person_b)
        if pair is None:
            return TimeResult()
        return TimeResult(events=_pair_events(pair, t), pair=pair)
    facts = [
        (people[f.subject_id], f)
        for f in await q.facts()
        if f.kind == "fact"
        and f.subject_id in people
        and (t.person_a is None or f.subject_id == t.person_a)
        and (overlaps(f.valid_at, t.start, t.end) or overlaps(f.invalid_at, t.start, t.end))
    ]
    return TimeResult(facts=sorted(facts, key=lambda pf: (*fact_order(pf[1]), pf[0].name)))


def _pair_events(pair: PairRecord, t: TimeQuery) -> list[TimelineEvent]:
    names = {pair.a.id: pair.a.name, pair.b.id: pair.b.name}
    events: list[TimelineEvent] = []
    r = pair.relationship
    if r is not None:
        if r.met_at is not None:
            events.append(
                TimelineEvent(
                    r.met_at, "met", f"{pair.a.name}和{pair.b.name}认识", r.confidence, r.sources
                )
            )
        if r.status:
            events.append(
                TimelineEvent(
                    None,
                    "status",
                    f"关系现状：{STATUS_LABELS.get(r.status, r.status)}",
                    r.confidence,
                    r.sources,
                )
            )
    for f in pair.facts:
        events.append(TimelineEvent(f.valid_at, "fact", f.fact, f.confidence, f.sources))
        if f.invalid_at is not None:
            events.append(
                TimelineEvent(
                    f.invalid_at, "fact_ended", f"不再成立：{f.fact}", f.confidence, f.sources
                )
            )
    for fe in pair.feelings:
        level = FEELING_LEVEL_LABELS.get(fe.dimension, {}).get(fe.level, fe.level)
        dimension = FEELING_DIMENSION_LABELS.get(fe.dimension, fe.dimension)
        events.append(
            TimelineEvent(
                fe.occurred_at,
                "feeling",
                f"{names[fe.from_id]}对{names[fe.to_id]}的{dimension}：{level}",
                fe.confidence,
                (fe.source,),
            )
        )
    if t.start or t.end:
        events = [e for e in events if e.date is None or overlaps(e.date, t.start, t.end)]
    return sorted(events, key=_event_order)


# --- semantic search ----------------------------------------------------------------------


@dataclass(frozen=True)
class SearchHits:
    facts: list[FactRecord]
    persons: list[PersonRecord]


async def semantic_search(infra: Infra, query: str, *, limit: int = 10) -> SearchHits:
    """语义检索: Graphiti hybrid search with the session's ``group_ids`` (never ``None``).

    Hits are re-read through the tenant-scoped repository, so even a misbehaving search
    could not surface another tenant's data.
    """
    tenant = require_tenant()
    results = await ScopedGraphiti(infra.graph_search, tenant).search(query, num_results=limit)
    q = _queries(infra)
    edge_ids = [e.uuid for e in results.edges]
    person_ids = [n.uuid for n in results.nodes if "Person" in n.labels]
    entity_ids = [n.uuid for n in results.nodes if "Person" not in n.labels]
    found = {f.id: f for f in await q.facts_by_ids(edge_ids)}
    facts = [found[i] for i in edge_ids if i in found]
    for f in sorted(await q.facts_about_entities(entity_ids), key=fact_order):
        if f.id not in found:
            found[f.id] = f
            facts.append(f)
    persons = {p.id: p for p in await q.persons_by_ids(person_ids)}
    return SearchHits(facts=facts, persons=[persons[i] for i in person_ids if i in persons])


def predicate_label(predicate: str) -> str:
    return fact_label(predicate)


__all__ = [
    "MAX_PATH_HOPS",
    "CountResult",
    "PathResult",
    "PersonFilter",
    "PersonMatch",
    "SearchHits",
    "TimeQuery",
    "TimeResult",
    "TimelineEvent",
    "all_relationships",
    "count_persons",
    "fact_order",
    "filter_persons",
    "find_path",
    "find_person",
    "overlaps",
    "read_profile",
    "read_relationship",
    "semantic_search",
    "time_query",
]
