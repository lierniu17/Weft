"""Neo4j reads behind the Q&A query tools and the graph views (spec 「问答」, AC-33/34).

Same guard as ``GraphRepository`` (``ScopedCypher``): every query filters by the tenant's
``$group_id``, bound by the repository; no method takes a tenant or raw Cypher argument.
Traversals (paths, neighborhoods) run in Python over the tenant's relationships so ties
break deterministically by name.
"""

from __future__ import annotations

from typing import Any

from weft.domain.dates import PartialDate
from weft.domain.tenancy import tenant_scoped
from weft.repositories.graph import (
    ScopedCypher,
    _fact,
    _feeling,
    _person,
    _relationship,
)
from weft.repositories.records import FactRecord, FeelingRecord, PersonRecord, RelationshipRecord


def _subject_first(row: dict[str, Any]) -> FactRecord:
    rel = row["r"]
    if rel.get("kind") == "opinion":  # stored Self -> person; the subject is the person
        return _fact(rel, row["o"], row["s"])
    return _fact(rel, row["s"], row["o"])


class GraphQueryRepository(ScopedCypher):
    @tenant_scoped
    async def relationships(self) -> list[RelationshipRecord]:
        rows = await self._read(
            """
            MATCH (r:Relationship {group_id: $group_id})
            OPTIONAL MATCH (r)-[:INTRODUCED_BY]->(i:Person {group_id: $group_id})
            RETURN r {.*} AS r, i {.*, name_embedding: null} AS i
            ORDER BY r.uuid
            """
        )
        return [_relationship(r["r"], r["i"]) for r in rows]

    @tenant_scoped
    async def feelings(self) -> list[FeelingRecord]:
        rows = await self._read(
            """
            MATCH (x:Person {group_id: $group_id})-[f:FEELS {group_id: $group_id}]
                  ->(y:Person {group_id: $group_id})
            RETURN f {.*} AS f, x.uuid AS x, y.uuid AS y
            ORDER BY f.occurred_sort, f.created_at, f.uuid
            """
        )
        return [_feeling(r["f"], r["x"], r["y"]) for r in rows]

    @tenant_scoped
    async def mention_dates(self) -> dict[str, list[PartialDate]]:
        """Per person, the 发生日期 of every Entry mentioning them (认识时间 fallback)."""
        rows = await self._read(
            """
            MATCH (e:Episodic {group_id: $group_id})-[:MENTIONS]->(p:Person {group_id: $group_id})
            RETURN p.uuid AS p, collect(DISTINCT e.occurred) AS occurred
            """
        )
        return {r["p"]: [PartialDate.parse(o) for o in r["occurred"] if o] for r in rows}

    @tenant_scoped
    async def facts(self) -> list[FactRecord]:
        """Every unexpired fact and opinion, current or not (history, 待核实)."""
        rows = await self._read(
            """
            MATCH (s:Person {group_id: $group_id})-[r:RELATES_TO {group_id: $group_id}]
                  ->(o:Entity {group_id: $group_id})
            WHERE r.expired_at IS NULL
            RETURN r {.*, fact_embedding: null} AS r, s.uuid AS s, o.uuid AS o
            ORDER BY r.uuid
            """
        )
        return [_subject_first(r) for r in rows]

    @tenant_scoped
    async def facts_by_ids(self, fact_ids: list[str]) -> list[FactRecord]:
        rows = await self._read(
            """
            MATCH (s:Person {group_id: $group_id})-[r:RELATES_TO {group_id: $group_id}]
                  ->(o:Entity {group_id: $group_id})
            WHERE r.uuid IN $ids AND r.expired_at IS NULL
            RETURN r {.*, fact_embedding: null} AS r, s.uuid AS s, o.uuid AS o
            """,
            ids=fact_ids,
        )
        return [_subject_first(r) for r in rows]

    @tenant_scoped
    async def facts_about_entities(self, entity_ids: list[str]) -> list[FactRecord]:
        """Facts pointing at these (non-person) entities, e.g. everyone who 喜欢 露营."""
        rows = await self._read(
            """
            MATCH (s:Person {group_id: $group_id})-[r:RELATES_TO {group_id: $group_id}]
                  ->(o:Entity {group_id: $group_id})
            WHERE o.uuid IN $ids AND NOT o:Person AND r.expired_at IS NULL
            RETURN r {.*, fact_embedding: null} AS r, s.uuid AS s, o.uuid AS o
            """,
            ids=entity_ids,
        )
        return [_subject_first(r) for r in rows]

    @tenant_scoped
    async def persons_by_ids(self, person_ids: list[str]) -> list[PersonRecord]:
        rows = await self._read(
            """
            MATCH (p:Person {group_id: $group_id})
            WHERE p.uuid IN $ids
            RETURN p {.*, name_embedding: null} AS p
            """,
            ids=person_ids,
        )
        return [_person(r["p"]) for r in rows]


__all__ = ["GraphQueryRepository"]
