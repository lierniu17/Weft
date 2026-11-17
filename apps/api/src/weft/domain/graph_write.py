"""Graph writes (图谱写入) as plain data: what one confirmed Draft or one manual edit changes.

A ``GraphWrite`` is computed by the service layer from the Draft and the current graph
(person resolution, conflict rule, relationship merge) and executed by
``GraphRepository.apply`` in a single Neo4j transaction. The Entry id doubles as the
Graphiti episode id and as the idempotency key: a write whose episode already exists is
skipped (AC-19).
"""

from __future__ import annotations

from dataclasses import dataclass, field
from datetime import datetime

from weft.domain.confidence import Confidence
from weft.domain.dates import PartialDate
from weft.domain.taxonomy import RelationshipType

# Fact predicates (spec 「图谱数据模型」). Facts point from a Person to an entity of the
# given label; OPINION points from Self to the person and is kept apart from facts.
PREDICATE_TARGETS: dict[str, str] = {
    "WORKS_AT": "Organization",
    "STUDIED_AT": "School",
    "LIVES_IN": "City",
    "HAS_TRAIT": "Trait",
    "LIKES": "Interest",
    "DISLIKES": "Interest",
    "EXPERIENCED": "LifeEvent",
    "HAS_ETIQUETTE": "Etiquette",
}
OPINION = "OPINION"

# Single-valued predicates: a new value conflicts with the current one (spec step 5).
SINGLE_VALUED: frozenset[str] = frozenset({"WORKS_AT", "LIVES_IN"})

PREDICATE_LABELS: dict[str, str] = {
    "WORKS_AT": "在…工作",
    "STUDIED_AT": "在…上学",
    "LIVES_IN": "住在",
    "HAS_TRAIT": "性格",
    "LIKES": "喜欢",
    "DISLIKES": "不喜欢",
    "EXPERIENCED": "经历",
    "HAS_ETIQUETTE": "相处之道",
    "OPINION": "评价",
}


def fact_sentence(subject: str, predicate: str, obj: str) -> str:
    """A readable fact text for Graphiti's ``fact`` field, e.g. 「老张 喜欢 钓鱼」."""
    templates = {
        "WORKS_AT": "{s}在{o}工作",
        "STUDIED_AT": "{s}在{o}上学",
        "LIVES_IN": "{s}住在{o}",
        "HAS_TRAIT": "{s}的性格：{o}",
        "LIKES": "{s}喜欢{o}",
        "DISLIKES": "{s}不喜欢{o}",
        "EXPERIENCED": "{s}经历了{o}",
        "HAS_ETIQUETTE": "和{s}相处：{o}",
        "OPINION": "我对{s}的评价：{o}",
    }
    template = templates.get(predicate, "{s} " + predicate + " {o}")
    return template.format(s=subject, o=obj)


@dataclass(frozen=True)
class EpisodeWrite:
    entry_id: str
    content: str
    occurred: PartialDate
    kind: str  # "user" | "manual_edit"
    created_at: datetime


@dataclass(frozen=True)
class NewPerson:
    id: str
    name: str


@dataclass(frozen=True)
class AliasAdd:
    person_id: str
    alias: str


@dataclass(frozen=True)
class IdentitySet:
    person_id: str
    field: str
    value: str
    confidence: Confidence


@dataclass(frozen=True)
class NewFact:
    id: str
    subject_id: str
    predicate: str
    object: str
    fact: str
    confidence: Confidence
    object_label: str | None = None  # entity label to merge the object into
    object_person_id: str | None = None  # the object is a person
    valid_at: PartialDate | None = None
    invalid_at: PartialDate | None = None
    unverified: bool = False
    kind: str = "fact"  # "fact" | "opinion"


@dataclass(frozen=True)
class FactRestated:
    """An existing fact said again by this Entry: it gains this Entry as a source."""

    fact_id: str
    confidence: Confidence


@dataclass(frozen=True)
class FactInvalidated:
    """An existing fact superseded by a new value; kept as history (AC-14)."""

    fact_id: str
    invalid_at: PartialDate


@dataclass(frozen=True)
class FactDeleted:
    fact_id: str


@dataclass(frozen=True)
class RelationshipUpsert:
    """The merged state of one pair's Relationship node after this write."""

    id: str
    person_a: str
    person_b: str
    types: tuple[RelationshipType, ...]
    confidence: Confidence
    met_at: PartialDate | None = None
    origin: str | None = None
    introduced_by_id: str | None = None
    status: str | None = None
    summary: str | None = None
    exists: bool = False


@dataclass(frozen=True)
class NewFeeling:
    id: str
    from_id: str
    to_id: str
    dimension: str
    level: str
    confidence: Confidence
    occurred_at: PartialDate


@dataclass(frozen=True)
class GraphWrite:
    episode: EpisodeWrite
    persons: list[NewPerson] = field(default_factory=list)
    aliases: list[AliasAdd] = field(default_factory=list)
    identity: list[IdentitySet] = field(default_factory=list)
    invalidations: list[FactInvalidated] = field(default_factory=list)
    facts: list[NewFact] = field(default_factory=list)
    restated: list[FactRestated] = field(default_factory=list)
    deletions: list[FactDeleted] = field(default_factory=list)
    relationships: list[RelationshipUpsert] = field(default_factory=list)
    feelings: list[NewFeeling] = field(default_factory=list)
    mentions: list[str] = field(default_factory=list)  # person ids the Entry mentions


__all__ = [
    "OPINION",
    "PREDICATE_LABELS",
    "PREDICATE_TARGETS",
    "SINGLE_VALUED",
    "AliasAdd",
    "EpisodeWrite",
    "FactDeleted",
    "FactInvalidated",
    "FactRestated",
    "GraphWrite",
    "IdentitySet",
    "NewFact",
    "NewFeeling",
    "NewPerson",
    "RelationshipUpsert",
    "fact_sentence",
]
