"""Neo4j: the tenant-scoped graph repository (ADR-0001, ADR-0003, ADR-0004).

The only code that reads or writes the graph besides ``ScopedGraphiti``. Every query goes
through ``_run`` which refuses Cypher that does not mention ``$group_id`` and always binds
``group_id`` to the repository's tenant — callers cannot pass one.

Node and edge shapes follow Graphiti's schema so Graphiti's search (batch 2) can read them:

* ``(:Entity:Person {uuid, group_id, name, aliases, aliases_text, is_self, summary, ...})``
  plus identity fields ``identity_<field>``, ``identity_<field>_confidence`` and
  ``identity_<field>_sources`` (Entry ids).
* ``(:Entity:<Organization|School|City|Trait|Interest|LifeEvent|Etiquette|Entity>)``.
* Facts: ``(Person)-[:RELATES_TO {uuid, group_id, name: predicate, fact, episodes,
  valid_at, invalid_at, expired_at, confidence, unverified, kind, object}]->(Entity)``;
  OPINION facts go from Self to the person.
* ``(:Episodic {uuid: entry id, ...})-[:MENTIONS]->(:Person)``.
* ``(:Relationship)`` nodes linked by ``IN_RELATIONSHIP`` (and ``INTRODUCED_BY``).
* Feelings: ``(Person)-[:FEELS {dimension, level, confidence, occurred_at, ...}]->(Person)``.
* Embeddings for Graphiti's hybrid search: ``name_embedding`` on persons and entities,
  ``fact_embedding`` on facts.
* Generated summaries: ``summary`` / ``summary_generated_at`` / ``summary_stale`` on persons
  (综合描述, AC-24) and on Relationship nodes (AC-28). A write marks what it touched stale;
  ``weft.services.summaries`` regenerates.
"""

from __future__ import annotations

import json
from collections.abc import Callable
from datetime import UTC, datetime
from typing import Any, LiteralString

from neo4j import AsyncDriver, AsyncManagedTransaction, AsyncTransaction

from weft.domain.confidence import Confidence
from weft.domain.dates import PartialDate
from weft.domain.graph_write import GraphWrite, NewFact
from weft.domain.taxonomy import OTHER
from weft.domain.tenancy import TenantContext, tenant_scoped
from weft.repositories.records import (
    EpisodeRecord,
    FactRecord,
    FeelingRecord,
    IdentityValue,
    PairRecord,
    PersonRecord,
    ProfileRecord,
    RelationshipRecord,
    RelationshipTypeRecord,
)

FaultHook = Callable[[str], None]
IDENTITY_FIELDS = ("gender", "birthday", "hometown")


class UnscopedQueryError(RuntimeError):
    """A Cypher query without a ``$group_id`` filter reached the repository."""


def _dt(value: PartialDate | None) -> datetime | None:
    if value is None:
        return None
    day = value.first_day()
    return datetime(day.year, day.month, day.day, tzinfo=UTC)


def _pd(value: Any) -> PartialDate | None:
    return None if value in (None, "") else PartialDate.parse(str(value))


def _native(value: Any) -> datetime:
    if hasattr(value, "to_native"):
        native = value.to_native()
        assert isinstance(native, datetime)
        return native
    assert isinstance(value, datetime)
    return value


def _person(props: dict[str, Any], types_json: str | None = None) -> PersonRecord:
    note: str | None = None
    if types_json:
        types = json.loads(types_json)
        if types:
            first = types[0]
            note = first["original"] if first["subtype"] == OTHER else first["subtype"]
    return PersonRecord(
        id=props["uuid"],
        name=props["name"],
        aliases=tuple(props.get("aliases") or ()),
        is_self=bool(props.get("is_self", False)),
        note=note,
    )


def _fact(rel: dict[str, Any], subject_id: str, object_id: str) -> FactRecord:
    return FactRecord(
        id=rel["uuid"],
        subject_id=subject_id,
        predicate=rel["name"],
        object=rel.get("object") or "",
        object_id=object_id,
        fact=rel.get("fact") or "",
        valid_at=_pd(rel.get("valid_at_partial")),
        invalid_at=_pd(rel.get("invalid_at_partial")),
        confidence=Confidence(rel.get("confidence") or Confidence.WITNESSED.value),
        unverified=bool(rel.get("unverified", False)),
        sources=tuple(rel.get("episodes") or ()),
        kind=rel.get("kind") or "fact",
    )


def _maybe_native(value: Any) -> datetime | None:
    return None if value is None else _native(value)


def _episode(props: dict[str, Any]) -> EpisodeRecord:
    return EpisodeRecord(
        entry_id=props["uuid"],
        content=props.get("content") or "",
        occurred=PartialDate.parse(props["occurred"]),
        kind=props.get("kind") or "user",
    )


def _relationship(node: dict[str, Any], introducer: dict[str, Any] | None) -> RelationshipRecord:
    return RelationshipRecord(
        id=node["uuid"],
        person_a=node["person_a"],
        person_b=node["person_b"],
        types=[RelationshipTypeRecord(**t) for t in json.loads(node.get("types_json") or "[]")],
        met_at=_pd(node.get("met_at")),
        origin=node.get("origin"),
        introduced_by=None if introducer is None else _person(introducer),
        status=node.get("status"),
        summary=node.get("summary"),
        confidence=Confidence(node.get("confidence") or Confidence.WITNESSED.value),
        sources=tuple(node.get("entry_ids") or ()),
        summary_generated_at=_maybe_native(node.get("summary_generated_at")),
    )


def _feeling(rel: dict[str, Any], from_id: str, to_id: str) -> FeelingRecord:
    return FeelingRecord(
        id=rel["uuid"],
        from_id=from_id,
        to_id=to_id,
        dimension=rel["dimension"],
        level=rel["level"],
        confidence=Confidence(rel["confidence"]),
        occurred_at=PartialDate.parse(rel["occurred_at"]),
        source=rel["entry_id"],
        created_at=_native(rel["created_at"]),
    )


Runner = AsyncTransaction | AsyncManagedTransaction


class ScopedCypher:
    """Plumbing shared by every Neo4j repository: Cypher always filtered by the tenant."""

    def __init__(self, driver: AsyncDriver, tenant: TenantContext) -> None:
        self._driver = driver
        self.tenant = tenant

    def _params(self, query: LiteralString, params: dict[str, Any]) -> dict[str, Any]:
        if "$group_id" not in query:
            raise UnscopedQueryError("every graph query must filter by $group_id")
        if "group_id" in params:
            raise UnscopedQueryError("group_id is bound by the repository, never by callers")
        return {**params, "group_id": self.tenant.group_id}

    async def _read(self, query: LiteralString, **params: Any) -> list[dict[str, Any]]:
        bound = self._params(query, params)
        async with self._driver.session() as session:
            result = await session.run(query, bound)
            return [record.data() async for record in result]

    async def _tx(self, tx: Runner, query: LiteralString, **params: Any) -> list[dict[str, Any]]:
        result = await tx.run(query, self._params(query, params))
        return [record.data() async for record in result]


class GraphRepository(ScopedCypher):
    def __init__(
        self, driver: AsyncDriver, tenant: TenantContext, *, fault_hook: FaultHook | None = None
    ) -> None:
        super().__init__(driver, tenant)
        self._fault_hook = fault_hook

    def _step(self, name: str) -> None:
        if self._fault_hook is not None:
            self._fault_hook(name)

    # --- persons ------------------------------------------------------------

    @tenant_scoped
    async def create_self(
        self,
        *,
        person_id: str,
        name: str,
        now: datetime,
        name_embedding: list[float] | None = None,
    ) -> PersonRecord:
        rows = await self._read(
            """
            MERGE (p:Entity:Person {group_id: $group_id, is_self: true})
            ON CREATE SET p.uuid = $id, p.name = $name, p.aliases = [], p.aliases_text = '',
                          p.summary = '', p.created_at = $now, p.name_embedding = $embedding
            RETURN p {.uuid, .name, .aliases, .is_self} AS p
            """,
            id=person_id,
            name=name,
            now=now,
            embedding=name_embedding,
        )
        return _person(rows[0]["p"])

    @tenant_scoped
    async def get_self(self) -> PersonRecord | None:
        rows = await self._read(
            "MATCH (p:Person {group_id: $group_id, is_self: true}) "
            "RETURN p {.*, name_embedding: null} AS p"
        )
        return _person(rows[0]["p"]) if rows else None

    @tenant_scoped
    async def get_person(self, person_id: str) -> PersonRecord | None:
        rows = await self._read(
            "MATCH (p:Person {group_id: $group_id, uuid: $id}) "
            "RETURN p {.*, name_embedding: null} AS p",
            id=person_id,
        )
        return _person(rows[0]["p"]) if rows else None

    @tenant_scoped
    async def list_persons(self) -> list[PersonRecord]:
        """Every person with a short note (the Self relationship's type), Self first."""
        rows = await self._read(
            """
            MATCH (p:Person {group_id: $group_id})
            OPTIONAL MATCH (s:Person {group_id: $group_id, is_self: true})
                  -[:IN_RELATIONSHIP]->(r:Relationship {group_id: $group_id})
                  <-[:IN_RELATIONSHIP]-(p)
            WHERE s <> p
            RETURN p {.*, name_embedding: null} AS p, head(collect(r.types_json)) AS types
            ORDER BY coalesce(p.is_self, false) DESC, p.name
            """
        )
        return [_person(r["p"], r["types"]) for r in rows]

    # --- facts / pairs read -------------------------------------------------

    @tenant_scoped
    async def facts_of(self, person_ids: list[str]) -> list[FactRecord]:
        """Unexpired outgoing facts (not opinions) of the given persons."""
        rows = await self._read(
            """
            MATCH (p:Person {group_id: $group_id})-[r:RELATES_TO {group_id: $group_id}]
                  ->(o:Entity {group_id: $group_id})
            WHERE p.uuid IN $ids AND r.expired_at IS NULL AND coalesce(r.kind, 'fact') = 'fact'
            RETURN r {.*, fact_embedding: null} AS r, p.uuid AS s, o.uuid AS o
            ORDER BY r.created_at
            """,
            ids=person_ids,
        )
        return [_fact(r["r"], r["s"], r["o"]) for r in rows]

    @tenant_scoped
    async def get_fact(self, fact_id: str) -> FactRecord | None:
        rows = await self._read(
            """
            MATCH (p:Entity {group_id: $group_id})-[r:RELATES_TO {group_id: $group_id, uuid: $id}]
                  ->(o:Entity {group_id: $group_id})
            WHERE r.expired_at IS NULL
            RETURN r {.*, fact_embedding: null} AS r, p.uuid AS s, o.uuid AS o
            """,
            id=fact_id,
        )
        if not rows:
            return None
        row = rows[0]
        rel = row["r"]
        if rel.get("kind") == "opinion":  # stored Self -> person; the subject is the person
            return _fact(rel, row["o"], row["s"])
        return _fact(rel, row["s"], row["o"])

    @tenant_scoped
    async def get_profile(self, person_id: str) -> ProfileRecord | None:
        rows = await self._read(
            "MATCH (p:Person {group_id: $group_id, uuid: $id}) "
            "RETURN p {.*, name_embedding: null} AS p",
            id=person_id,
        )
        if not rows:
            return None
        props = rows[0]["p"]
        identity: dict[str, IdentityValue] = {}
        for name in IDENTITY_FIELDS:
            value = props.get(f"identity_{name}")
            if value:
                identity[name] = IdentityValue(
                    value=value,
                    confidence=Confidence(props.get(f"identity_{name}_confidence") or "witnessed"),
                    sources=tuple(props.get(f"identity_{name}_sources") or ()),
                )
        facts = await self.facts_of([person_id])
        opinion_rows = await self._read(
            """
            MATCH (s:Person {group_id: $group_id, is_self: true})
                  -[r:RELATES_TO {group_id: $group_id, kind: 'opinion'}]
                  ->(p:Person {group_id: $group_id, uuid: $id})
            WHERE r.expired_at IS NULL
            RETURN r {.*, fact_embedding: null} AS r, s.uuid AS s
            ORDER BY r.created_at
            """,
            id=person_id,
        )
        facts += [_fact(r["r"], person_id, r["s"]) for r in opinion_rows]
        sources = [s for f in facts for s in f.sources]
        sources += [s for v in identity.values() for s in v.sources]
        return ProfileRecord(
            person=_person(props),
            identity=identity,
            facts=facts,
            summary=props.get("summary") or None,
            summary_generated_at=_maybe_native(props.get("summary_generated_at")),
            episodes=await self.episodes(sources),
        )

    @tenant_scoped
    async def relationships_between(
        self, pairs: list[tuple[str, str]]
    ) -> dict[frozenset[str], RelationshipRecord]:
        if not pairs:
            return {}
        rows = await self._read(
            """
            UNWIND $pairs AS pair
            MATCH (a:Person {group_id: $group_id, uuid: pair[0]})
                  -[:IN_RELATIONSHIP]->(r:Relationship {group_id: $group_id})
                  <-[:IN_RELATIONSHIP]-(b:Person {group_id: $group_id, uuid: pair[1]})
            OPTIONAL MATCH (r)-[:INTRODUCED_BY]->(i:Person {group_id: $group_id})
            RETURN DISTINCT r {.*} AS r, i {.*, name_embedding: null} AS i
            """,
            pairs=[list(p) for p in pairs],
        )
        out: dict[frozenset[str], RelationshipRecord] = {}
        for row in rows:
            record = _relationship(row["r"], row["i"])
            out[frozenset((record.person_a, record.person_b))] = record
        return out

    @tenant_scoped
    async def get_pair(self, a_id: str, b_id: str) -> PairRecord | None:
        rows = await self._read(
            """
            MATCH (a:Person {group_id: $group_id, uuid: $a}),
                  (b:Person {group_id: $group_id, uuid: $b})
            RETURN a {.*, name_embedding: null} AS a, b {.*, name_embedding: null} AS b
            """,
            a=a_id,
            b=b_id,
        )
        if not rows or a_id == b_id:
            return None
        a, b = _person(rows[0]["a"]), _person(rows[0]["b"])
        relationship = (await self.relationships_between([(a_id, b_id)])).get(
            frozenset((a_id, b_id))
        )
        feeling_rows = await self._read(
            """
            MATCH (x:Person {group_id: $group_id})-[f:FEELS {group_id: $group_id}]
                  ->(y:Person {group_id: $group_id})
            WHERE (x.uuid = $a AND y.uuid = $b) OR (x.uuid = $b AND y.uuid = $a)
            RETURN f {.*} AS f, x.uuid AS x, y.uuid AS y
            ORDER BY f.occurred_sort, f.created_at
            """,
            a=a_id,
            b=b_id,
        )
        fact_rows = await self._read(
            """
            MATCH (x:Person {group_id: $group_id})-[r:RELATES_TO {group_id: $group_id}]
                  ->(y:Person {group_id: $group_id})
            WHERE r.expired_at IS NULL AND coalesce(r.kind, 'fact') = 'fact'
              AND ((x.uuid = $a AND y.uuid = $b) OR (x.uuid = $b AND y.uuid = $a))
            RETURN r {.*, fact_embedding: null} AS r, x.uuid AS x, y.uuid AS y
            ORDER BY r.valid_at, r.created_at
            """,
            a=a_id,
            b=b_id,
        )
        feelings = [_feeling(r["f"], r["x"], r["y"]) for r in feeling_rows]
        facts = [_fact(r["r"], r["x"], r["y"]) for r in fact_rows]
        sources = [s for f in facts for s in f.sources] + [f.source for f in feelings]
        sources += list(relationship.sources) if relationship else []
        return PairRecord(
            a=a,
            b=b,
            relationship=relationship,
            feelings=feelings,
            facts=facts,
            episodes=await self.episodes(sources),
        )

    # --- entries ----------------------------------------------------------

    @tenant_scoped
    async def episodes(self, entry_ids: list[str]) -> dict[str, EpisodeRecord]:
        """The Entries (as episodes) with these ids, for Citations (AC-25)."""
        wanted = sorted(set(entry_ids))
        if not wanted:
            return {}
        rows = await self._read(
            """
            MATCH (e:Episodic {group_id: $group_id})
            WHERE e.uuid IN $ids
            RETURN e {.uuid, .content, .occurred, .kind} AS e
            """,
            ids=wanted,
        )
        return {r["e"]["uuid"]: _episode(r["e"]) for r in rows}

    @tenant_scoped
    async def episode_exists(self, entry_id: str) -> bool:
        rows = await self._read(
            "MATCH (e:Episodic {group_id: $group_id, uuid: $id}) RETURN e.uuid AS id", id=entry_id
        )
        return bool(rows)

    @tenant_scoped
    async def produced_by(self, entry_id: str) -> tuple[list[PersonRecord], list[FactRecord]]:
        """What one Entry put in the graph: the persons it mentions and the facts it backs."""
        persons = await self._read(
            """
            MATCH (e:Episodic {group_id: $group_id, uuid: $id})-[:MENTIONS]
                  ->(p:Person {group_id: $group_id})
            RETURN p {.*, name_embedding: null} AS p ORDER BY p.name
            """,
            id=entry_id,
        )
        facts = await self._read(
            """
            MATCH (s:Entity {group_id: $group_id})-[r:RELATES_TO {group_id: $group_id}]
                  ->(o:Entity {group_id: $group_id})
            WHERE $id IN r.episodes AND r.expired_at IS NULL
            RETURN r {.*, fact_embedding: null} AS r, s.uuid AS s, o.uuid AS o ORDER BY r.created_at
            """,
            id=entry_id,
        )
        return (
            [_person(r["p"]) for r in persons],
            [
                _fact(r["r"], r["o"], r["s"])
                if r["r"].get("kind") == "opinion"
                else _fact(r["r"], r["s"], r["o"])
                for r in facts
            ],
        )

    @tenant_scoped
    async def count_entries_mentioning(self, person_id: str) -> int:
        rows = await self._read(
            """
            MATCH (e:Episodic {group_id: $group_id})-[:MENTIONS]
                  ->(p:Person {group_id: $group_id, uuid: $id})
            RETURN count(DISTINCT e) AS n
            """,
            id=person_id,
        )
        return int(rows[0]["n"]) if rows else 0

    # --- writes -------------------------------------------------------------

    @tenant_scoped
    async def apply(self, write: GraphWrite) -> bool:
        """Execute ``write`` in one transaction; False if its episode was already written.

        Either everything is written or nothing is (a failure rolls the transaction back),
        so a retried confirmation never duplicates persons or facts (AC-19).
        """
        return await self.apply_all([write]) == 1

    @tenant_scoped
    async def apply_all(self, writes: list[GraphWrite]) -> int:
        """Execute several writes in one transaction (all or nothing); how many were new."""
        async with self._driver.session() as session:
            tx = await session.begin_transaction()
            try:
                applied = 0
                for write in writes:
                    applied += int(await self._apply(tx, write))
                if applied:
                    self._step("commit")
                    await tx.commit()
                else:
                    await tx.rollback()
                return applied
            except BaseException:
                if not tx.closed():
                    await tx.rollback()
                raise

    async def _apply(self, tx: AsyncTransaction, w: GraphWrite) -> bool:
        ep = w.episode
        exists = await self._tx(
            tx, "MATCH (e:Episodic {group_id: $group_id, uuid: $id}) RETURN e.uuid", id=ep.entry_id
        )
        if exists:
            return False
        self._step("episode")
        await self._tx(
            tx,
            """
            CREATE (e:Episodic {uuid: $id, group_id: $group_id, name: $name, content: $content,
                    source: 'text', source_description: $kind, kind: $kind,
                    valid_at: $valid_at, occurred: $occurred, created_at: $now,
                    entity_edges: $edges})
            """,
            id=ep.entry_id,
            name=f"entry {ep.entry_id}",
            content=ep.content,
            kind=ep.kind,
            valid_at=_dt(ep.occurred),
            occurred=ep.occurred.isoformat(),
            now=ep.created_at,
            edges=[f.id for f in w.facts],
        )
        now = ep.created_at

        self._step("persons")
        if w.persons:
            await self._tx(
                tx,
                """
                UNWIND $rows AS row
                CREATE (p:Entity:Person {uuid: row.id, group_id: $group_id, name: row.name,
                        aliases: [], aliases_text: '', is_self: false, summary: '',
                        created_at: $now})
                SET p.name_embedding = row.embedding
                """,
                rows=[
                    {"id": p.id, "name": p.name, "embedding": p.name_embedding} for p in w.persons
                ],
                now=now,
            )

        self._step("aliases")
        for alias in w.aliases:
            await self._tx(
                tx,
                """
                MATCH (p:Person {group_id: $group_id, uuid: $id})
                WHERE NOT $alias IN coalesce(p.aliases, []) AND p.name <> $alias
                SET p.aliases = coalesce(p.aliases, []) + $alias
                SET p.aliases_text = reduce(t = '', a IN p.aliases | t + ' ' + a)
                """,
                id=alias.person_id,
                alias=alias.alias,
            )

        self._step("identity")
        for item in w.identity:
            if item.field == "name":
                await self._tx(
                    tx,
                    """
                    MATCH (p:Person {group_id: $group_id, uuid: $id})
                    WITH p, p.name AS old
                    SET p.name = $value
                    SET p.aliases = CASE WHEN old = $value OR old IN coalesce(p.aliases, [])
                                         THEN coalesce(p.aliases, [])
                                         ELSE coalesce(p.aliases, []) + old END
                    SET p.aliases = [a IN p.aliases WHERE a <> $value]
                    SET p.aliases_text = reduce(t = '', a IN p.aliases | t + ' ' + a)
                    SET p.name_embedding = $embedding
                    """,
                    id=item.person_id,
                    value=item.value,
                    embedding=item.name_embedding,
                )
                continue
            if item.field not in IDENTITY_FIELDS:
                continue
            await self._tx(
                tx,
                """
                MATCH (p:Person {group_id: $group_id, uuid: $id})
                SET p['identity_' + $field] = $value,
                    p['identity_' + $field + '_confidence'] = $confidence,
                    p['identity_' + $field + '_sources'] = [$entry]
                """,
                id=item.person_id,
                field=item.field,
                value=item.value,
                confidence=item.confidence.value,
                entry=ep.entry_id,
            )

        self._step("invalidations")
        for inv in w.invalidations:
            await self._tx(
                tx,
                """
                MATCH (:Entity {group_id: $group_id})
                      -[r:RELATES_TO {group_id: $group_id, uuid: $id}]
                      ->(:Entity {group_id: $group_id})
                SET r.invalid_at = $invalid_at, r.invalid_at_partial = $partial,
                    r.invalidated_by = $entry
                """,
                id=inv.fact_id,
                invalid_at=_dt(inv.invalid_at),
                partial=inv.invalid_at.isoformat(),
                entry=ep.entry_id,
            )

        self._step("facts")
        await self._create_facts(tx, w.facts, ep.entry_id, now)

        self._step("restated")
        for restated in w.restated:
            await self._tx(
                tx,
                """
                MATCH (:Entity {group_id: $group_id})
                      -[r:RELATES_TO {group_id: $group_id, uuid: $id}]
                      ->(:Entity {group_id: $group_id})
                SET r.episodes = CASE WHEN $entry IN r.episodes THEN r.episodes
                                      ELSE r.episodes + $entry END
                """,
                id=restated.fact_id,
                entry=ep.entry_id,
            )

        self._step("deletions")
        for deletion in w.deletions:
            await self._tx(
                tx,
                """
                MATCH (:Entity {group_id: $group_id})
                      -[r:RELATES_TO {group_id: $group_id, uuid: $id}]
                      ->(o:Entity {group_id: $group_id})
                DELETE r
                WITH o
                WHERE NOT o:Person AND NOT (o)-[:RELATES_TO]-()
                DETACH DELETE o
                """,
                id=deletion.fact_id,
            )

        self._step("relationships")
        for rel in w.relationships:
            types_json = json.dumps(
                [
                    {"category": t.category.value, "subtype": t.subtype, "original": t.original}
                    for t in rel.types
                ],
                ensure_ascii=False,
            )
            await self._tx(
                tx,
                """
                MATCH (a:Person {group_id: $group_id, uuid: $a}),
                      (b:Person {group_id: $group_id, uuid: $b})
                MERGE (r:Relationship {group_id: $group_id, uuid: $id})
                ON CREATE SET r.created_at = $now, r.person_a = $a, r.person_b = $b,
                              r.entry_ids = []
                SET r.types_json = $types_json, r.type_keys = $type_keys, r.met_at = $met_at,
                    r.origin = $origin, r.status = $status, r.summary = $summary,
                    r.confidence = $confidence, r.updated_at = $now,
                    r.entry_ids = CASE WHEN $entry IN r.entry_ids THEN r.entry_ids
                                       ELSE r.entry_ids + $entry END
                MERGE (a)-[:IN_RELATIONSHIP {group_id: $group_id}]->(r)
                MERGE (b)-[:IN_RELATIONSHIP {group_id: $group_id}]->(r)
                WITH r
                OPTIONAL MATCH (r)-[old:INTRODUCED_BY]->(:Person {group_id: $group_id})
                DELETE old
                WITH DISTINCT r
                OPTIONAL MATCH (i:Person {group_id: $group_id, uuid: $introducer})
                FOREACH (_ IN CASE WHEN i IS NULL THEN [] ELSE [1] END |
                    MERGE (r)-[:INTRODUCED_BY {group_id: $group_id}]->(i))
                """,
                id=rel.id,
                a=rel.person_a,
                b=rel.person_b,
                types_json=types_json,
                type_keys=[f"{t.category.value}/{t.subtype}" for t in rel.types],
                met_at=None if rel.met_at is None else rel.met_at.isoformat(),
                origin=rel.origin,
                status=rel.status,
                summary=rel.summary,
                confidence=rel.confidence.value,
                introducer=rel.introduced_by_id,
                entry=ep.entry_id,
                now=now,
            )

        self._step("feelings")
        if w.feelings:
            await self._tx(
                tx,
                """
                UNWIND $rows AS row
                MATCH (a:Person {group_id: $group_id, uuid: row.a}),
                      (b:Person {group_id: $group_id, uuid: row.b})
                CREATE (a)-[:FEELS {uuid: row.id, group_id: $group_id, dimension: row.dimension,
                        level: row.level, confidence: row.confidence, occurred_at: row.occurred,
                        occurred_sort: row.sort, entry_id: $entry, created_at: $now}]->(b)
                """,
                rows=[
                    {
                        "id": f.id,
                        "a": f.from_id,
                        "b": f.to_id,
                        "dimension": f.dimension,
                        "level": f.level,
                        "confidence": f.confidence.value,
                        "occurred": f.occurred_at.isoformat(),
                        "sort": f.occurred_at.first_day(),
                    }
                    for f in w.feelings
                ],
                entry=ep.entry_id,
                now=now,
            )

        self._step("summaries")
        await self._mark_stale(tx, w)

        self._step("mentions")
        if w.mentions:
            await self._tx(
                tx,
                """
                MATCH (e:Episodic {group_id: $group_id, uuid: $entry})
                UNWIND $ids AS pid
                MATCH (p:Person {group_id: $group_id, uuid: pid})
                MERGE (e)-[m:MENTIONS {group_id: $group_id}]->(p)
                ON CREATE SET m.uuid = randomUUID(), m.created_at = $now
                """,
                entry=ep.entry_id,
                ids=w.mentions,
                now=now,
            )
        return True

    async def _mark_stale(self, tx: AsyncTransaction, w: GraphWrite) -> None:
        """What this write touched needs its generated summary regenerated (AC-24, AC-28)."""
        await self._tx(
            tx,
            """
            MATCH (p:Person {group_id: $group_id})
            WHERE p.uuid IN $ids
            SET p.summary_stale = true
            """,
            ids=w.touched_persons(),
        )
        pairs = [list(p) for p in w.touched_pairs()]
        if pairs:
            await self._tx(
                tx,
                """
            UNWIND $pairs AS pair
            MATCH (:Person {group_id: $group_id, uuid: pair[0]})
                  -[:IN_RELATIONSHIP]->(r:Relationship {group_id: $group_id})
                  <-[:IN_RELATIONSHIP]-(:Person {group_id: $group_id, uuid: pair[1]})
            SET r.summary_stale = true
            """,
                pairs=pairs,
            )
        written_by_user = [r.id for r in w.relationships if r.summary_from_user]
        if written_by_user:
            await self._tx(
                tx,
                """
                MATCH (r:Relationship {group_id: $group_id})
                WHERE r.uuid IN $ids
                SET r.summary_stale = false, r.summary_generated_at = null
                """,
                ids=written_by_user,
            )

    async def _create_facts(
        self, tx: AsyncTransaction, facts: list[NewFact], entry_id: str, now: datetime
    ) -> None:
        """Create the write's facts in two statements, keeping their order."""

        def props(fact: NewFact) -> dict[str, Any]:
            return {
                "uuid": fact.id,
                "name": fact.predicate,
                "fact": fact.fact,
                "object": fact.object,
                "episodes": [entry_id],
                "created_at": now,
                "valid_at": _dt(fact.valid_at),
                "valid_at_partial": None if fact.valid_at is None else fact.valid_at.isoformat(),
                "invalid_at": _dt(fact.invalid_at),
                "invalid_at_partial": (
                    None if fact.invalid_at is None else fact.invalid_at.isoformat()
                ),
                "expired_at": None,
                "confidence": fact.confidence.value,
                "unverified": fact.unverified,
                "kind": fact.kind,
                "fact_embedding": fact.fact_embedding,
            }

        between_persons = [f for f in facts if f.object_person_id is not None]
        if between_persons:
            # opinions are stored Self -> person; person-to-person facts subject -> object
            await self._tx(
                tx,
                """
                UNWIND $rows AS row
                MATCH (s:Person {group_id: $group_id, uuid: row.s}),
                      (o:Person {group_id: $group_id, uuid: row.o})
                CREATE (s)-[r:RELATES_TO]->(o)
                SET r = row.props, r.group_id = $group_id
                """,
                rows=[
                    {"s": f.subject_id, "o": f.object_person_id, "props": props(f)}
                    for f in between_persons
                ],
            )
        about_entities = [f for f in facts if f.object_person_id is None]
        if about_entities:
            # Graphiti reads the entity type from the node label; labels cannot be
            # parameters, so each allowed label has its own (static) SET.
            await self._tx(
                tx,
                """
                UNWIND $rows AS row
                MATCH (s:Person {group_id: $group_id, uuid: row.s})
                MERGE (o:Entity {group_id: $group_id, name: row.object, weft_label: row.label})
                ON CREATE SET o.uuid = randomUUID(), o.summary = '', o.created_at = $now
                SET o.name_embedding = coalesce(o.name_embedding, row.embedding)
                """
                + _SET_ENTITY_LABEL
                + """
                CREATE (s)-[r:RELATES_TO]->(o)
                SET r = row.props, r.group_id = $group_id
                """,
                now=now,
                rows=[
                    {
                        "s": f.subject_id,
                        "object": f.object,
                        "label": f.object_label or "Entity",
                        "embedding": f.object_embedding,
                        "props": props(f),
                    }
                    for f in about_entities
                ],
            )

    @tenant_scoped
    async def delete_person(self, person_id: str) -> bool:
        """Cascade-delete a (non-Self) person: facts, relationships, feelings, aliases, and
        entities only he was linked to. Entries (episodes) stay (AC-27)."""
        async with self._driver.session() as session:
            tx = await session.begin_transaction()
            try:
                found = await self._tx(
                    tx,
                    """
                    MATCH (p:Person {group_id: $group_id, uuid: $id})
                    WHERE coalesce(p.is_self, false) = false
                    RETURN p.uuid AS id
                    """,
                    id=person_id,
                )
                if not found:
                    await tx.rollback()
                    return False
                await self._tx(
                    tx,
                    """
                    MATCH (p:Person {group_id: $group_id, uuid: $id})
                          -[:IN_RELATIONSHIP]->(r:Relationship {group_id: $group_id})
                    DETACH DELETE r
                    """,
                    id=person_id,
                )
                orphans = await self._tx(
                    tx,
                    """
                    MATCH (p:Person {group_id: $group_id, uuid: $id})
                          -[:RELATES_TO]->(o:Entity {group_id: $group_id})
                    WHERE NOT o:Person
                    RETURN collect(DISTINCT o.uuid) AS ids
                    """,
                    id=person_id,
                )
                await self._tx(
                    tx,
                    "MATCH (p:Person {group_id: $group_id, uuid: $id}) DETACH DELETE p",
                    id=person_id,
                )
                await self._tx(
                    tx,
                    """
                    MATCH (o:Entity {group_id: $group_id})
                    WHERE o.uuid IN $ids AND NOT (o)-[:RELATES_TO]-()
                    DETACH DELETE o
                    """,
                    ids=orphans[0]["ids"] if orphans else [],
                )
                await tx.commit()
                return True
            except BaseException:
                if not tx.closed():
                    await tx.rollback()
                raise

    # --- embeddings backfill ----------------------------------------------------

    @tenant_scoped
    async def missing_embeddings(self, limit: int = 100) -> tuple[dict[str, str], dict[str, str]]:
        """(node uuid -> name, fact uuid -> fact text) still lacking an embedding."""
        nodes = await self._read(
            """
            MATCH (n:Entity {group_id: $group_id})
            WHERE n.name_embedding IS NULL
            RETURN n.uuid AS id, n.name AS text ORDER BY n.uuid LIMIT $limit
            """,
            limit=limit,
        )
        facts = await self._read(
            """
            MATCH (:Entity {group_id: $group_id})-[r:RELATES_TO {group_id: $group_id}]
                  ->(:Entity {group_id: $group_id})
            WHERE r.fact_embedding IS NULL
            RETURN r.uuid AS id, r.fact AS text ORDER BY r.uuid LIMIT $limit
            """,
            limit=limit,
        )
        return (
            {r["id"]: r["text"] or "" for r in nodes},
            {r["id"]: r["text"] or "" for r in facts},
        )

    @tenant_scoped
    async def store_embeddings(
        self, nodes: dict[str, list[float]], facts: dict[str, list[float]]
    ) -> None:
        await self._read(
            """
            UNWIND $rows AS row
            MATCH (n:Entity {group_id: $group_id, uuid: row.id})
            SET n.name_embedding = row.v
            """,
            rows=[{"id": k, "v": v} for k, v in nodes.items()],
        )
        await self._read(
            """
            UNWIND $rows AS row
            MATCH (:Entity {group_id: $group_id})
                  -[r:RELATES_TO {group_id: $group_id, uuid: row.id}]
                  ->(:Entity {group_id: $group_id})
            SET r.fact_embedding = row.v
            """,
            rows=[{"id": k, "v": v} for k, v in facts.items()],
        )

    # --- generated summaries ------------------------------------------------------

    @tenant_scoped
    async def stale_summaries(self, limit: int = 20) -> tuple[list[str], list[tuple[str, str]]]:
        """(person ids, relationship pairs) whose generated summary is out of date."""
        persons = await self._read(
            """
            MATCH (p:Person {group_id: $group_id})
            WHERE p.summary_stale = true AND coalesce(p.is_self, false) = false
            RETURN p.uuid AS id ORDER BY p.name, p.uuid LIMIT $limit
            """,
            limit=limit,
        )
        pairs = await self._read(
            """
            MATCH (r:Relationship {group_id: $group_id})
            WHERE r.summary_stale = true
            RETURN r.person_a AS a, r.person_b AS b ORDER BY r.uuid LIMIT $limit
            """,
            limit=limit,
        )
        return [r["id"] for r in persons], [(r["a"], r["b"]) for r in pairs]

    @tenant_scoped
    async def set_person_summary(self, person_id: str, summary: str, at: datetime) -> bool:
        rows = await self._read(
            """
            MATCH (p:Person {group_id: $group_id, uuid: $id})
            SET p.summary = $summary, p.summary_generated_at = $at, p.summary_stale = false
            RETURN p.uuid AS id
            """,
            id=person_id,
            summary=summary,
            at=at,
        )
        return bool(rows)

    @tenant_scoped
    async def set_relationship_summary(
        self, relationship_id: str, summary: str, at: datetime
    ) -> bool:
        rows = await self._read(
            """
            MATCH (r:Relationship {group_id: $group_id, uuid: $id})
            SET r.summary = $summary, r.summary_generated_at = $at, r.summary_stale = false
            RETURN r.uuid AS id
            """,
            id=relationship_id,
            summary=summary,
            at=at,
        )
        return bool(rows)

    @tenant_scoped
    async def delete_tenant(self) -> None:
        """Delete the whole tenant graph (account deletion, AC-5)."""
        await self._read("MATCH (n) WHERE n.group_id = $group_id DETACH DELETE n")


_SET_ENTITY_LABEL: LiteralString = """
    FOREACH (_ IN CASE WHEN row.label = 'Organization' THEN [1] ELSE [] END | SET o:Organization)
    FOREACH (_ IN CASE WHEN row.label = 'School' THEN [1] ELSE [] END | SET o:School)
    FOREACH (_ IN CASE WHEN row.label = 'City' THEN [1] ELSE [] END | SET o:City)
    FOREACH (_ IN CASE WHEN row.label = 'Trait' THEN [1] ELSE [] END | SET o:Trait)
    FOREACH (_ IN CASE WHEN row.label = 'Interest' THEN [1] ELSE [] END | SET o:Interest)
    FOREACH (_ IN CASE WHEN row.label = 'LifeEvent' THEN [1] ELSE [] END | SET o:LifeEvent)
    FOREACH (_ IN CASE WHEN row.label = 'Etiquette' THEN [1] ELSE [] END | SET o:Etiquette)
"""


__all__ = ["IDENTITY_FIELDS", "GraphRepository", "ScopedCypher", "UnscopedQueryError"]
