"""Graph views (AC-33, AC-34, graph-viz AC-1..AC-4, AC-14): a person's 1–2 hop
neighbourhood and the panorama around Self, now or at a point in time.

Pure functions over persons, Relationships, Feelings and facts; the service feeds them from
the tenant-scoped repository.

* Closeness (亲密度) of a pair = the closer of the two directions' levels; every edge also
  carries both directions (``source_closeness`` = the source's feeling about the target).
* Local graph: everyone within ``hops`` Relationships of the centre. Above ``limit`` nodes
  only the centre and the closest others stay — closeness to the centre, else Self's
  closeness to them, then fewer hops, then name — and the rest are counted as omitted.
* Panorama: everyone, centred on Self, optionally filtered by Relationship category /
  subtype and by Self's closeness; only matching persons and Relationships remain.
* Met date (认识时间) of a person = their Relationship with Self's ``met_at``, else the
  发生日期 of the first Entry mentioning them.
* At a time point ``at`` (a partial date; its last day counts): only persons met by then
  (Self always; persons with no known date too), closeness = the latest Feeling at or
  before then, and each Relationship as its history says it was then
  (``relationship_at``).
* Anchor (锚点): a person with no Relationship to Self hangs off the neighbour nearest to
  Self (fewest hops, then Self's closeness to that neighbour, then name).
* Groups (群体): persons sharing a current workplace (WORKS_AT) or school (STUDIED_AT), and
  families (connected by kin Relationships); two or more members besides Self.
"""

from __future__ import annotations

from collections import deque
from collections.abc import Iterable, Mapping, Sequence
from dataclasses import dataclass, field, replace
from datetime import date

from weft.domain.dates import PartialDate
from weft.domain.feelings import by_direction
from weft.repositories.records import (
    FactRecord,
    FeelingRecord,
    PersonRecord,
    RelationshipRecord,
    RelationshipTypeRecord,
)

LOCAL_GRAPH_LIMIT = 50
CLOSENESS_ORDER = ("distant", "casual", "familiar", "close", "intimate")  # low -> high
GROUP_PREDICATES = {"WORKS_AT": "organization", "STUDIED_AT": "school"}
KIN = "kin"
MY_FAMILY = "我的家人"


def closeness_rank(level: str | None) -> int:
    return CLOSENESS_ORDER.index(level) if level in CLOSENESS_ORDER else -1


@dataclass(frozen=True)
class GraphNode:
    id: str
    name: str
    is_self: bool
    met_at: PartialDate | None = None
    anchor_id: str | None = None  # persons with no Relationship to Self (第 6 环)


@dataclass(frozen=True)
class GraphEdge:
    id: str
    source: str
    target: str
    types: list[RelationshipTypeRecord]
    status: str | None
    closeness: str | None  # the closer direction's level
    confidence: str = "witnessed"
    source_closeness: str | None = None  # source's feeling about target
    target_closeness: str | None = None  # target's feeling about source


@dataclass(frozen=True)
class GraphGroup:
    id: str
    name: str
    kind: str  # family | organization | school
    member_ids: list[str]


@dataclass(frozen=True)
class Timeline:
    start: PartialDate | None  # the earliest met date; None when nobody has one
    end: date  # today


@dataclass(frozen=True)
class GraphView:
    center_id: str
    nodes: list[GraphNode]
    edges: list[GraphEdge]
    omitted: int = 0  # persons left out by the node limit (AC-33)
    groups: list[GraphGroup] = field(default_factory=list)
    timeline: Timeline | None = None
    at: PartialDate | None = None


@dataclass(frozen=True)
class PanoramaFilter:
    categories: frozenset[str] = field(default_factory=frozenset)
    subtypes: frozenset[str] = field(default_factory=frozenset)
    min_closeness: str | None = None

    def filters_types(self) -> bool:
        return bool(self.categories or self.subtypes)


class Closeness:
    """Closeness levels between persons from the Feelings' history, now or as of ``day``."""

    def __init__(self, feelings: list[FeelingRecord], day: date | None = None) -> None:
        if day is not None:
            feelings = [f for f in feelings if f.occurred_at.first_day() <= day]
        self._level: dict[tuple[str, str], str] = {}
        for src, dst in {(f.from_id, f.to_id) for f in feelings if f.dimension == "closeness"}:
            view = by_direction(feelings, src, dst).get("closeness")
            if view is not None:
                self._level[(src, dst)] = view.current.level

    def of(self, src: str, dst: str) -> str | None:
        return self._level.get((src, dst))

    def pair(self, a: str, b: str) -> str | None:
        levels = [lv for lv in (self.of(a, b), self.of(b, a)) if lv is not None]
        return max(levels, key=closeness_rank) if levels else None


def _type_key(t: RelationshipTypeRecord) -> tuple[str, str, str]:
    return (t.category, t.subtype, t.original)


def relationship_at(r: RelationshipRecord, day: date) -> RelationshipRecord:
    """The Relationship as its history says it was on ``day``.

    Status = the latest status stated by then (unknown before anything was said); types =
    those stated by then, in the current order (the earliest stated before the first
    record); confidence = the best stated by then (the earliest before the first record).
    Without history, or once every change has happened, it is the current Relationship.
    """
    if not r.history:
        return r
    ordered = sorted(enumerate(r.history), key=lambda ic: (ic[1].occurred.first_day(), ic[0]))
    changes = [c for _, c in ordered]
    said = [c for c in changes if c.occurred.first_day() <= day]
    if len(said) == len(changes):
        return r
    known = said or changes[:1]
    stated = {_type_key(t) for c in known for t in c.types}
    types = [t for t in r.types if _type_key(t) in stated] or list(known[0].types) or r.types
    confidence = known[0].confidence
    for c in known[1:]:
        if c.confidence.rank >= confidence.rank:
            confidence = c.confidence
    status = next((c.status for c in reversed(said) if c.status is not None), None)
    return replace(r, types=types, status=status, confidence=confidence)


def met_dates(
    persons: Iterable[PersonRecord],
    relationships: Iterable[RelationshipRecord],
    first_mentions: Mapping[str, Sequence[PartialDate]],
) -> dict[str, PartialDate | None]:
    """认识时间 per person: the Relationship with Self's ``met_at``, else the first mention."""
    people = list(persons)
    me = next((p.id for p in people if p.is_self), None)
    with_me: dict[str, PartialDate] = {}
    for r in relationships:
        if me in (r.person_a, r.person_b) and r.met_at is not None:
            other = r.person_b if r.person_a == me else r.person_a
            with_me[other] = r.met_at
    out: dict[str, PartialDate | None] = {}
    for p in people:
        if p.is_self:
            out[p.id] = None
        elif p.id in with_me:
            out[p.id] = with_me[p.id]
        else:
            mentions = first_mentions.get(p.id) or ()
            out[p.id] = min(mentions, key=lambda d: d.first_day(), default=None)
    return out


def _edges(
    relationships: Iterable[RelationshipRecord], keep: set[str], closeness: Closeness
) -> list[GraphEdge]:
    return sorted(
        (
            GraphEdge(
                id=r.id,
                source=r.person_a,
                target=r.person_b,
                types=list(r.types),
                status=r.status,
                closeness=closeness.pair(r.person_a, r.person_b),
                confidence=r.confidence.value,
                source_closeness=closeness.of(r.person_a, r.person_b),
                target_closeness=closeness.of(r.person_b, r.person_a),
            )
            for r in relationships
            if r.person_a in keep and r.person_b in keep
        ),
        key=lambda e: (e.source, e.target, e.id),
    )


def _ordered(
    nodes: Iterable[PersonRecord],
    met: Mapping[str, PartialDate | None] | None = None,
    anchors: Mapping[str, str] | None = None,
) -> list[GraphNode]:
    return [
        GraphNode(
            id=p.id,
            name=p.name,
            is_self=p.is_self,
            met_at=(met or {}).get(p.id),
            anchor_id=(anchors or {}).get(p.id),
        )
        for p in sorted(nodes, key=lambda p: (not p.is_self, p.name, p.id))
    ]


def _neighbours(edges: Iterable[GraphEdge]) -> dict[str, set[str]]:
    out: dict[str, set[str]] = {}
    for e in edges:
        out.setdefault(e.source, set()).add(e.target)
        out.setdefault(e.target, set()).add(e.source)
    return out


def _hops_from(start: str, neighbours: Mapping[str, set[str]]) -> dict[str, int]:
    distance = {start: 0}
    queue = deque([start])
    while queue:
        current = queue.popleft()
        for nxt in neighbours.get(current, ()):
            if nxt not in distance:
                distance[nxt] = distance[current] + 1
                queue.append(nxt)
    return distance


def local_view(
    center: str,
    persons: list[PersonRecord],
    relationships: list[RelationshipRecord],
    feelings: list[FeelingRecord],
    *,
    hops: int,
    limit: int = LOCAL_GRAPH_LIMIT,
    first_mentions: Mapping[str, Sequence[PartialDate]] | None = None,
) -> GraphView:
    people = {p.id: p for p in persons}
    neighbours: dict[str, set[str]] = {}
    for r in relationships:
        neighbours.setdefault(r.person_a, set()).add(r.person_b)
        neighbours.setdefault(r.person_b, set()).add(r.person_a)
    distance = {center: 0}
    queue = deque([center])
    while queue:
        current = queue.popleft()
        if distance[current] == hops:
            continue
        for nxt in neighbours.get(current, ()):
            if nxt not in distance and nxt in people:
                distance[nxt] = distance[current] + 1
                queue.append(nxt)

    closeness = Closeness(feelings)
    me = next((p.id for p in persons if p.is_self), None)

    def priority(pid: str) -> tuple[int, int, int, str, str]:
        to_center = closeness_rank(closeness.pair(center, pid))
        to_me = closeness_rank(closeness.of(me, pid)) if me and me != center else -1
        return (-to_center, -to_me, distance[pid], people[pid].name, pid)

    others = sorted((pid for pid in distance if pid != center), key=priority)
    kept = [center, *others[: max(limit - 1, 0)]]
    keep = set(kept)
    met = met_dates(persons, relationships, first_mentions or {})
    return GraphView(
        center_id=center,
        nodes=_ordered((people[pid] for pid in kept), met),
        edges=_edges(relationships, keep, closeness),
        omitted=len(distance) - len(kept),
    )


def _type_matches(types: list[RelationshipTypeRecord], f: PanoramaFilter) -> bool:
    return any(
        (not f.categories or t.category in f.categories)
        and (not f.subtypes or t.subtype in f.subtypes)
        for t in types
    )


def _anchors(
    me: str,
    people: Mapping[str, PersonRecord],
    keep: set[str],
    edges: list[GraphEdge],
    closeness: Closeness,
) -> dict[str, str]:
    neighbours = _neighbours(edges)
    hops = _hops_from(me, neighbours)
    direct = neighbours.get(me, set())
    out: dict[str, str] = {}
    for pid in sorted(keep):
        if pid == me or pid in direct:
            continue
        reachable = [n for n in neighbours.get(pid, ()) if n in hops and n != me]
        if reachable:
            out[pid] = min(
                reachable,
                key=lambda n: (hops[n], -closeness_rank(closeness.of(me, n)), people[n].name, n),
            )
    return out


def _fact_current(fact: FactRecord, day: date | None) -> bool:
    if day is None:
        return fact.current
    if fact.unverified:
        return False
    started = fact.valid_at is None or fact.valid_at.first_day() <= day
    ended = fact.invalid_at is not None and fact.invalid_at.first_day() <= day
    return started and not ended


def _groups(
    me: str,
    people: Mapping[str, PersonRecord],
    keep: set[str],
    relationships: Iterable[RelationshipRecord],
    facts: Iterable[FactRecord],
    day: date | None,
    hops: Mapping[str, int],
) -> list[GraphGroup]:
    groups: list[GraphGroup] = []
    places: dict[tuple[str, str], set[str]] = {}
    for fact in facts:
        kind = GROUP_PREDICATES.get(fact.predicate)
        if kind is None or fact.subject_id not in keep or fact.subject_id == me:
            continue
        if _fact_current(fact, day):
            places.setdefault((kind, fact.object), set()).add(fact.subject_id)
    for (kind, name), members in sorted(places.items()):
        if len(members) >= 2:
            groups.append(GraphGroup(f"{kind}:{name}", name, kind, sorted(members)))

    kin: dict[str, set[str]] = {}
    for r in relationships:
        if r.person_a in keep and r.person_b in keep and any(t.category == KIN for t in r.types):
            kin.setdefault(r.person_a, set()).add(r.person_b)
            kin.setdefault(r.person_b, set()).add(r.person_a)
    seen: set[str] = set()
    families: list[GraphGroup] = []
    for start in sorted(kin):
        if start in seen:
            continue
        component = set(_hops_from(start, kin))
        seen |= component
        family = sorted(component - {me})
        if len(family) < 2:
            continue
        if me in component:
            name = MY_FAMILY
        else:
            hub = min(
                family,
                key=lambda m: (hops.get(m, len(people) + 1), -len(kin[m]), people[m].name, m),
            )
            name = f"{people[hub].name}家"
        families.append(GraphGroup(f"family:{family[0]}", name, "family", family))
    return families + groups


def panorama_view(
    persons: list[PersonRecord],
    relationships: list[RelationshipRecord],
    feelings: list[FeelingRecord],
    f: PanoramaFilter,
    *,
    at: PartialDate | None = None,
    first_mentions: Mapping[str, Sequence[PartialDate]] | None = None,
    facts: Sequence[FactRecord] = (),
    today: date | None = None,
) -> GraphView:
    me = next(p for p in persons if p.is_self)
    people = {p.id: p for p in persons}
    met = met_dates(persons, relationships, first_mentions or {})
    day = None if at is None else at.last_day()
    if day is not None:
        shown = {pid for pid, when in met.items() if when is None or when.first_day() <= day}
        relationships = [
            relationship_at(r, day)
            for r in relationships
            if r.person_a in shown
            and r.person_b in shown
            and (r.met_at is None or r.met_at.first_day() <= day)
        ]
    else:
        shown = set(people)
    closeness = Closeness(feelings, day)
    keep = {
        pid
        for pid in shown
        if pid == me.id
        or f.min_closeness is None
        or closeness_rank(closeness.of(me.id, pid)) >= closeness_rank(f.min_closeness)
    }
    rels = [r for r in relationships if not f.filters_types() or _type_matches(r.types, f)]
    edges = _edges(rels, keep, closeness)
    if f.filters_types():
        linked = {e.source for e in edges} | {e.target for e in edges}
        keep = {pid for pid in keep if pid == me.id or pid in linked}
    starts = [d for pid, d in met.items() if d is not None and pid != me.id]
    hops = _hops_from(me.id, _neighbours(edges))
    return GraphView(
        center_id=me.id,
        nodes=_ordered(
            (p for p in persons if p.id in keep),
            met,
            _anchors(me.id, people, keep, edges, closeness),
        ),
        edges=edges,
        groups=_groups(me.id, people, keep, relationships, facts, day, hops),
        timeline=None
        if today is None
        else Timeline(min(starts, key=lambda d: d.first_day(), default=None), today),
        at=at,
    )


__all__ = [
    "CLOSENESS_ORDER",
    "LOCAL_GRAPH_LIMIT",
    "Closeness",
    "GraphEdge",
    "GraphGroup",
    "GraphNode",
    "GraphView",
    "PanoramaFilter",
    "Timeline",
    "closeness_rank",
    "local_view",
    "met_dates",
    "panorama_view",
    "relationship_at",
]
