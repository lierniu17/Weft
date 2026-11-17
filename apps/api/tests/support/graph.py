"""Arrange an existing graph for a test user ("图谱里已有张伟和张强") and read it back.

Seeding goes through the tenant-scoped ``GraphRepository`` (the same write path a confirmed
Draft takes) under a synthetic seed episode, so the arranged state is exactly what the app
itself would have written.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import UTC, datetime

from tests.conftest import TestUser
from weft.domain.confidence import Confidence
from weft.domain.dates import PartialDate
from weft.domain.graph_write import (
    PREDICATE_TARGETS,
    EpisodeWrite,
    GraphWrite,
    NewFact,
    NewFeeling,
    NewPerson,
    RelationshipUpsert,
    fact_sentence,
)
from weft.domain.taxonomy import Category, RelationshipType
from weft.domain.tenancy import tenant_scope
from weft.infra import Infra
from weft.repositories.graph import GraphRepository
from weft.repositories.records import FactRecord, PairRecord, PersonRecord, ProfileRecord

SELF = "我"


@dataclass
class Seed:
    persons: list[str] = field(default_factory=list)
    # (person, predicate, object, confidence, valid_at)
    facts: list[tuple[str, str, str, Confidence, str | None]] = field(default_factory=list)
    # (a, b, category, subtype)
    relationships: list[tuple[str, str, Category, str]] = field(default_factory=list)
    # (from, to, dimension, level, occurred, confidence)
    feelings: list[tuple[str, str, str, str, str, Confidence]] = field(default_factory=list)


async def seed(infra: Infra, user: TestUser, spec: Seed) -> dict[str, str]:
    """Write ``spec`` into the user's graph; returns name -> person id (我 -> Self)."""
    with tenant_scope(user.tenant):
        repo = GraphRepository(infra.neo4j, user.tenant)
        me = await repo.get_self()
        assert me is not None
        ids = {SELF: me.id}
        write = GraphWrite(
            episode=EpisodeWrite(
                entry_id=str(uuid.uuid4()),
                content="(seed)",
                occurred=PartialDate(2026, 1, 1),
                kind="manual_edit",
                created_at=datetime(2026, 1, 1, tzinfo=UTC),
            )
        )
        for name in spec.persons:
            ids[name] = str(uuid.uuid4())
            write.persons.append(NewPerson(id=ids[name], name=name))
        for person, predicate, obj, confidence, valid_at in spec.facts:
            write.facts.append(
                NewFact(
                    id=str(uuid.uuid4()),
                    subject_id=ids[person],
                    predicate=predicate,
                    object=obj,
                    fact=fact_sentence(person, predicate, obj),
                    confidence=confidence,
                    object_label=PREDICATE_TARGETS.get(predicate),
                    valid_at=None if valid_at is None else PartialDate.parse(valid_at),
                )
            )
        for a, b, category, subtype in spec.relationships:
            write.relationships.append(
                RelationshipUpsert(
                    id=str(uuid.uuid4()),
                    person_a=ids[a],
                    person_b=ids[b],
                    types=(RelationshipType(category, subtype, subtype),),
                    confidence=Confidence.WITNESSED,
                )
            )
        for src, dst, dimension, level, occurred, confidence in spec.feelings:
            write.feelings.append(
                NewFeeling(
                    id=str(uuid.uuid4()),
                    from_id=ids[src],
                    to_id=ids[dst],
                    dimension=dimension,
                    level=level,
                    confidence=confidence,
                    occurred_at=PartialDate.parse(occurred),
                )
            )
        assert await repo.apply(write)
    return ids


async def persons_of(infra: Infra, user: TestUser) -> list[PersonRecord]:
    with tenant_scope(user.tenant):
        return await GraphRepository(infra.neo4j, user.tenant).list_persons()


async def person_named(infra: Infra, user: TestUser, name: str) -> PersonRecord:
    matches = [p for p in await persons_of(infra, user) if p.name == name]
    assert len(matches) == 1, f"expected one person named {name}, got {matches}"
    return matches[0]


async def profile_of(infra: Infra, user: TestUser, name: str) -> ProfileRecord:
    person = await person_named(infra, user, name)
    with tenant_scope(user.tenant):
        profile = await GraphRepository(infra.neo4j, user.tenant).get_profile(person.id)
    assert profile is not None
    return profile


def facts_by_predicate(profile: ProfileRecord, predicate: str) -> list[FactRecord]:
    return [f for f in profile.facts if f.predicate == predicate]


async def pair_of(infra: Infra, user: TestUser, a: str, b: str) -> PairRecord:
    pa, pb = await person_named(infra, user, a), await person_named(infra, user, b)
    with tenant_scope(user.tenant):
        pair = await GraphRepository(infra.neo4j, user.tenant).get_pair(pa.id, pb.id)
    assert pair is not None
    return pair


async def count_group_nodes(infra: Infra, user: TestUser) -> int:
    async with infra.neo4j.session() as session:
        result = await session.run(
            "MATCH (n) WHERE n.group_id = $g RETURN count(n) AS n", g=user.tenant.group_id
        )
        record = await result.single()
    return int(record["n"]) if record else 0


__all__ = [
    "SELF",
    "Seed",
    "count_group_nodes",
    "facts_by_predicate",
    "pair_of",
    "person_named",
    "persons_of",
    "profile_of",
    "seed",
]
