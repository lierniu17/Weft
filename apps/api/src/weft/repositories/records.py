"""Domain records returned by repositories."""

from __future__ import annotations

import uuid
from dataclasses import dataclass, field
from datetime import datetime

from weft.domain.confidence import Confidence
from weft.domain.dates import PartialDate
from weft.domain.draft import Draft, DraftStatus


@dataclass(frozen=True)
class UserRecord:
    id: uuid.UUID
    username: str
    display_name: str
    created_at: datetime


@dataclass(frozen=True)
class InviteRecord:
    code: str
    created_at: datetime
    used_at: datetime | None
    revoked_at: datetime | None
    used_by_username: str | None

    @property
    def status(self) -> str:
        if self.used_at is not None:
            return "used"
        if self.revoked_at is not None:
            return "revoked"
        return "unused"


@dataclass(frozen=True)
class EntryRecord:
    id: uuid.UUID
    text: str
    occurred: PartialDate
    kind: str  # "user" | "manual_edit"
    created_at: datetime


@dataclass(frozen=True)
class DraftRecord:
    id: uuid.UUID
    entry_id: uuid.UUID
    status: DraftStatus
    content: Draft | None
    error: str | None
    updated_at: datetime


@dataclass(frozen=True)
class PersonRecord:
    id: str
    name: str
    aliases: tuple[str, ...]
    is_self: bool
    note: str | None = None  # short hint, e.g. 同事 (the Self relationship's subtype)


@dataclass(frozen=True)
class IdentityValue:
    value: str
    confidence: Confidence
    sources: tuple[str, ...]


@dataclass(frozen=True)
class FactRecord:
    id: str
    subject_id: str
    predicate: str
    object: str
    object_id: str
    fact: str
    valid_at: PartialDate | None
    invalid_at: PartialDate | None
    confidence: Confidence
    unverified: bool
    sources: tuple[str, ...]
    kind: str = "fact"  # "fact" | "opinion"

    @property
    def current(self) -> bool:
        return self.invalid_at is None and not self.unverified


@dataclass(frozen=True)
class EpisodeRecord:
    """An Entry as the graph keeps it (the Graphiti episode): the source of a Citation."""

    entry_id: str
    content: str
    occurred: PartialDate
    kind: str  # "user" | "manual_edit"


@dataclass(frozen=True)
class ProfileRecord:
    person: PersonRecord
    identity: dict[str, IdentityValue]
    facts: list[FactRecord]
    summary: str | None = None  # 综合描述 (AC-24)
    summary_generated_at: datetime | None = None
    episodes: dict[str, EpisodeRecord] = field(default_factory=dict)  # every source above


@dataclass(frozen=True)
class RelationshipTypeRecord:
    category: str
    subtype: str
    original: str


@dataclass(frozen=True)
class RelationshipChange:
    """What one Entry said about a pair's Relationship: a slice of its history (graph-viz).

    ``types`` are the types that Entry stated, ``status`` the status it stated (``None`` if
    it said nothing about it), ``occurred`` the Entry's 发生日期.
    """

    occurred: PartialDate
    types: tuple[RelationshipTypeRecord, ...]
    status: str | None
    confidence: Confidence
    entry_id: str


@dataclass(frozen=True)
class RelationshipRecord:
    id: str
    person_a: str
    person_b: str
    types: list[RelationshipTypeRecord]
    met_at: PartialDate | None
    origin: str | None
    introduced_by: PersonRecord | None
    status: str | None
    summary: str | None
    confidence: Confidence
    sources: tuple[str, ...]
    summary_generated_at: datetime | None = None
    history: tuple[RelationshipChange, ...] = ()  # in write order


@dataclass(frozen=True)
class FeelingRecord:
    id: str
    from_id: str
    to_id: str
    dimension: str
    level: str
    confidence: Confidence
    occurred_at: PartialDate
    source: str
    created_at: datetime


@dataclass(frozen=True)
class PairRecord:
    a: PersonRecord
    b: PersonRecord
    relationship: RelationshipRecord | None
    feelings: list[FeelingRecord] = field(default_factory=list)
    facts: list[FactRecord] = field(default_factory=list)
    episodes: dict[str, EpisodeRecord] = field(default_factory=dict)  # every source above


__all__ = [
    "DraftRecord",
    "EntryRecord",
    "EpisodeRecord",
    "FactRecord",
    "FeelingRecord",
    "IdentityValue",
    "InviteRecord",
    "PairRecord",
    "PersonRecord",
    "ProfileRecord",
    "RelationshipChange",
    "RelationshipRecord",
    "RelationshipTypeRecord",
    "UserRecord",
]
