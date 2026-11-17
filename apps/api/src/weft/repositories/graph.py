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


class GraphRepository:
    def __init__(
        self, driver: AsyncDriver, tenant: TenantContext, *, fault_hook: FaultHook | None = None
    ) -> None:
        self._driver = driver
        self.tenant = tenant
        self._fault_hook = fault_hook

    # --- plumbing ---------------------------------------------------------

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

    def _step(self, name: str) -> None:
        if self._fault_hook is not None:
            self._fault_hook(name)

    # --- persons ------------------------------------------------------------

    @tenant_scoped
    async def create_self(self, *, person_id: str, name: str, now: datetime) -> PersonRecord:
        rows = await self._read(
            """
            MERGE (p:Entity:Person {group_id: $group_id, is_self: true})
            ON CREATE SET p.uuid = $id, p.name = $name, p.aliases = [], p.aliases_text = '',
                          p.summary = '', p.created_at = $now
            RETURN p {.*} AS p
            """,
            id=person_id,
            name=name,
            now=now,
        )
        return _person(rows[0]["p"])

    @tenant_scoped
    async def get_self(self) -> PersonRecord | None:
        rows = await self._read(
            "MATCH (p:Person {group_id: $group_id, is_self: true}) RETURN p {.*} AS p"
        )
        return _person(rows[0]["p"]) if rows else None

    @tenant_scoped
    async def get_person(self, person_id: str) -> PersonRecord | None:
        rows = await self._read(
            "MATCH (p:Person {group_id: $group_id, uuid: $id}) RETURN p {.*} AS p", id=person_id
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
            RETURN p {.*} AS p, head(collect(r.types_json)) AS types
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
            RETURN r {.*} AS r, p.uuid AS s, o.uuid AS o
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
            RETURN r {.*} AS r, p.uuid AS s, o.uuid AS o
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
            "MATCH (p:Person {group_id: $group_id, uuid: $id}) RETURN p {.*} AS p", id=person_id
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
            RETURN r {.*} AS r, s.uuid AS s
            ORDER BY r.created_at
            """,
            id=person_id,
        )
        facts += [_fact(r["r"], person_id, r["s"]) for r in opinion_rows]
        return ProfileRecord(person=_person(props), identity=identity, facts=facts)

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
            RETURN DISTINCT r {.*} AS r, i {.*} AS i
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
            RETURN a {.*} AS a, b {.*} AS b
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
            RETURN r {.*} AS r, x.uuid AS x, y.uuid AS y
            ORDER BY r.valid_at, r.created_at
            """,
            a=a_id,
            b=b_id,
        )
        return PairRecord(
            a=a,
            b=b,
            relationship=relationship,
            feelings=[_feeling(r["f"], r["x"], r["y"]) for r in feeling_rows],
            facts=[_fact(r["r"], r["x"], r["y"]) for r in fact_rows],
        )

    # --- entries ----------------------------------------------------------

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
            RETURN p {.*} AS p ORDER BY p.name
            """,
            id=entry_id,
        )
        facts = await self._read(
            """
            MATCH (s:Entity {group_id: $group_id})-[r:RELATES_TO {group_id: $group_id}]
                  ->(o:Entity {group_id: $group_id})
            WHERE $id IN r.episodes AND r.expired_at IS NULL
            RETURN r {.*} AS r, s.uuid AS s, o.uuid AS o ORDER BY r.created_at
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
        async with self._driver.session() as session:
            tx = await session.begin_transaction()
            try:
                applied = await self._apply(tx, write)
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
        for person in w.persons:
            await self._tx(
                tx,
                """
                CREATE (:Entity:Person {uuid: $id, group_id: $group_id, name: $name,
                        aliases: [], aliases_text: '', is_self: false, summary: '',
                        created_at: $now})
                """,
                id=person.id,
                name=person.name,
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
                    """,
                    id=item.person_id,
                    value=item.value,
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
        for fact in w.facts:
            await self._create_fact(tx, fact, ep.entry_id, now)

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
        for feeling in w.feelings:
            await self._tx(
                tx,
                """
                MATCH (a:Person {group_id: $group_id, uuid: $a}),
                      (b:Person {group_id: $group_id, uuid: $b})
                CREATE (a)-[:FEELS {uuid: $id, group_id: $group_id, dimension: $dimension,
                        level: $level, confidence: $confidence, occurred_at: $occurred,
                        occurred_sort: $sort, entry_id: $entry, created_at: $now}]->(b)
                """,
                id=feeling.id,
                a=feeling.from_id,
                b=feeling.to_id,
                dimension=feeling.dimension,
                level=feeling.level,
                confidence=feeling.confidence.value,
                occurred=feeling.occurred_at.isoformat(),
                sort=feeling.occurred_at.first_day(),
                entry=ep.entry_id,
                now=now,
            )

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

    async def _create_fact(
        self, tx: AsyncTransaction, fact: NewFact, entry_id: str, now: datetime
    ) -> None:
        props = {
            "uuid": fact.id,
            "name": fact.predicate,
            "fact": fact.fact,
            "object": fact.object,
            "episodes": [entry_id],
            "created_at": now,
            "valid_at": _dt(fact.valid_at),
            "valid_at_partial": None if fact.valid_at is None else fact.valid_at.isoformat(),
            "invalid_at": _dt(fact.invalid_at),
            "invalid_at_partial": None if fact.invalid_at is None else fact.invalid_at.isoformat(),
            "expired_at": None,
            "confidence": fact.confidence.value,
            "unverified": fact.unverified,
            "kind": fact.kind,
        }
        if fact.object_person_id is not None:
            # opinions are stored Self -> person; person-to-person facts subject -> object
            await self._tx(
                tx,
                """
                MATCH (s:Person {group_id: $group_id, uuid: $s}),
                      (o:Person {group_id: $group_id, uuid: $o})
                CREATE (s)-[r:RELATES_TO]->(o)
                SET r = $props, r.group_id = $group_id
                """,
                s=fact.subject_id,
                o=fact.object_person_id,
                props=props,
            )
            return
        label = fact.object_label or "Entity"
        await self._tx(
            tx,
            """
            MATCH (s:Person {group_id: $group_id, uuid: $s})
            MERGE (o:Entity {group_id: $group_id, name: $object, weft_label: $label})
            ON CREATE SET o.uuid = randomUUID(), o.summary = '', o.created_at = $now
            CREATE (s)-[r:RELATES_TO]->(o)
            SET r = $props, r.group_id = $group_id
            """,
            s=fact.subject_id,
            object=fact.object,
            label=label,
            now=now,
            props=props,
        )
        # Graphiti reads the entity type from the node label; labels cannot be parameters,
        # so they come from a fixed allow-list.
        if label in _ENTITY_LABEL_QUERIES:
            await self._tx(tx, _ENTITY_LABEL_QUERIES[label], object=fact.object, label=label)

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

    @tenant_scoped
    async def delete_tenant(self) -> None:
        """Delete the whole tenant graph (account deletion, AC-5)."""
        await self._read("MATCH (n) WHERE n.group_id = $group_id DETACH DELETE n")


_ENTITY_LABEL_QUERIES: dict[str, LiteralString] = {
    label: (
        "MATCH (o:Entity {group_id: $group_id, name: $object, weft_label: $label}) SET o:" + label
    )
    for label in (
        "Organization",
        "School",
        "City",
        "Trait",
        "Interest",
        "LifeEvent",
        "Etiquette",
    )
}


__all__ = ["IDENTITY_FIELDS", "GraphRepository", "UnscopedQueryError"]
