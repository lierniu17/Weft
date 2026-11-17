"""Graph views (AC-33, AC-34): a person's 1–2 hop neighbourhood and the panorama around Self.

Pure functions over persons, Relationships and Feelings; the service feeds them from the
tenant-scoped repository.

* Closeness (亲密度) of a pair = the closer of the two directions' current levels.
* Local graph: everyone within ``hops`` Relationships of the centre. Above ``limit`` nodes
  only the centre and the closest others stay — closeness to the centre, else Self's
  closeness to them, then fewer hops, then name — and the rest are counted as omitted.
* Panorama: everyone, centred on Self, optionally filtered by Relationship category /
  subtype and by Self's closeness; only matching persons and Relationships remain.
"""

from __future__ import annotations

from collections import deque
from collections.abc import Iterable
from dataclasses import dataclass, field

from weft.domain.feelings import by_direction
from weft.repositories.records import (
    FeelingRecord,
    PersonRecord,
    RelationshipRecord,
    RelationshipTypeRecord,
)

LOCAL_GRAPH_LIMIT = 50
CLOSENESS_ORDER = ("distant", "casual", "familiar", "close", "intimate")  # low -> high


def closeness_rank(level: str | None) -> int:
    return CLOSENESS_ORDER.index(level) if level in CLOSENESS_ORDER else -1


@dataclass(frozen=True)
class GraphNode:
    id: str
    name: str
    is_self: bool


@dataclass(frozen=True)
class GraphEdge:
    id: str
    source: str
    target: str
    types: list[RelationshipTypeRecord]
    status: str | None
    closeness: str | None  # the closer direction's current level


@dataclass(frozen=True)
class GraphView:
    center_id: str
    nodes: list[GraphNode]
    edges: list[GraphEdge]
    omitted: int = 0  # persons left out by the node limit (AC-33)


@dataclass(frozen=True)
class PanoramaFilter:
    categories: frozenset[str] = field(default_factory=frozenset)
    subtypes: frozenset[str] = field(default_factory=frozenset)
    min_closeness: str | None = None

    def filters_types(self) -> bool:
        return bool(self.categories or self.subtypes)


class Closeness:
    """Current closeness levels between persons, from the Feelings' history."""

    def __init__(self, feelings: list[FeelingRecord]) -> None:
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


def _node(p: PersonRecord) -> GraphNode:
    return GraphNode(id=p.id, name=p.name, is_self=p.is_self)


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
            )
            for r in relationships
            if r.person_a in keep and r.person_b in keep
        ),
        key=lambda e: (e.source, e.target, e.id),
    )


def _ordered(nodes: Iterable[PersonRecord]) -> list[GraphNode]:
    return [_node(p) for p in sorted(nodes, key=lambda p: (not p.is_self, p.name, p.id))]


def local_view(
    center: str,
    persons: list[PersonRecord],
    relationships: list[RelationshipRecord],
    feelings: list[FeelingRecord],
    *,
    hops: int,
    limit: int = LOCAL_GRAPH_LIMIT,
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
    return GraphView(
        center_id=center,
        nodes=_ordered(people[pid] for pid in kept),
        edges=_edges(relationships, keep, closeness),
        omitted=len(distance) - len(kept),
    )


def _type_matches(types: list[RelationshipTypeRecord], f: PanoramaFilter) -> bool:
    return any(
        (not f.categories or t.category in f.categories)
        and (not f.subtypes or t.subtype in f.subtypes)
        for t in types
    )


def panorama_view(
    persons: list[PersonRecord],
    relationships: list[RelationshipRecord],
    feelings: list[FeelingRecord],
    f: PanoramaFilter,
) -> GraphView:
    me = next(p for p in persons if p.is_self)
    closeness = Closeness(feelings)
    keep = {
        p.id
        for p in persons
        if p.is_self
        or f.min_closeness is None
        or closeness_rank(closeness.of(me.id, p.id)) >= closeness_rank(f.min_closeness)
    }
    rels = [r for r in relationships if not f.filters_types() or _type_matches(r.types, f)]
    edges = _edges(rels, keep, closeness)
    if f.filters_types():
        linked = {e.source for e in edges} | {e.target for e in edges}
        keep = {pid for pid in keep if pid == me.id or pid in linked}
    return GraphView(
        center_id=me.id,
        nodes=_ordered(p for p in persons if p.id in keep),
        edges=edges,
    )


__all__ = [
    "CLOSENESS_ORDER",
    "LOCAL_GRAPH_LIMIT",
    "Closeness",
    "GraphEdge",
    "GraphNode",
    "GraphView",
    "PanoramaFilter",
    "closeness_rank",
    "local_view",
    "panorama_view",
]
