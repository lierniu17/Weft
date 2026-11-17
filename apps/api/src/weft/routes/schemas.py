"""HTTP contract: request and response bodies (JSON). Validation lives here, not in routes.

The Draft body is the published ``Draft`` contract itself (contracts/draft.schema.json);
the vocabulary is ``TaxonomyResponse`` (contracts/taxonomy.schema.json). Every route's
schema is in the OpenAPI document at ``/openapi.json``.
"""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints

from weft.domain.confidence import Confidence
from weft.domain.dates import PartialDate, Precision
from weft.domain.draft import Draft, DraftStatus, ProfileField, RelationshipStatus
from weft.domain.feelings import DIMENSIONS, by_direction
from weft.domain.quota import QuotaDecision
from weft.domain.taxonomy import Category
from weft.repositories.records import (
    DraftRecord,
    EntryRecord,
    FactRecord,
    FeelingRecord,
    IdentityValue,
    PairRecord,
    PersonRecord,
    ProfileRecord,
    RelationshipRecord,
    UserRecord,
)

Stripped = Annotated[str, StringConstraints(strip_whitespace=True)]


class _In(BaseModel):
    model_config = ConfigDict(extra="forbid")


class _Out(BaseModel):
    model_config = ConfigDict(extra="forbid")


class ErrorBody(_Out):
    """Every non-2xx response: a stable machine ``error`` code and a Chinese ``message``."""

    model_config = ConfigDict(extra="allow")
    error: str
    message: str


# --- auth -------------------------------------------------------------------------


class RegisterRequest(_In):
    invite_code: Annotated[Stripped, Field(min_length=1, max_length=32)]
    username: Annotated[str, Field(pattern=r"^[A-Za-z0-9_.-]{3,32}$")]
    password: Annotated[str, Field(min_length=8, max_length=128)]
    display_name: Annotated[Stripped, Field(min_length=1, max_length=32)]


class LoginRequest(_In):
    username: Annotated[str, Field(min_length=1, max_length=64)]
    password: Annotated[str, Field(min_length=1, max_length=128)]


class DeleteAccountRequest(_In):
    password: Annotated[str, Field(min_length=1, max_length=128)]


class MeResponse(_Out):
    id: uuid.UUID
    username: str
    display_name: str
    self_person_id: str

    @classmethod
    def of(cls, user: UserRecord, self_person_id: str) -> MeResponse:
        return cls(
            id=user.id,
            username=user.username,
            display_name=user.display_name,
            self_person_id=self_person_id,
        )


# --- persons / facts -------------------------------------------------------------------


class PersonOut(_Out):
    id: str
    name: str
    aliases: list[str]
    is_self: bool
    note: str | None = None

    @classmethod
    def of(cls, p: PersonRecord) -> PersonOut:
        return cls(id=p.id, name=p.name, aliases=list(p.aliases), is_self=p.is_self, note=p.note)


class FactOut(_Out):
    id: str
    subject_id: str
    predicate: str
    object: str
    fact: str
    kind: Literal["fact", "opinion"]
    valid_at: PartialDate | None
    invalid_at: PartialDate | None
    confidence: Confidence
    unverified: bool
    current: bool
    sources: list[str] = Field(description="Ids of the Entries backing this fact")

    @classmethod
    def of(cls, f: FactRecord) -> FactOut:
        return cls(
            id=f.id,
            subject_id=f.subject_id,
            predicate=f.predicate,
            object=f.object,
            fact=f.fact,
            kind="opinion" if f.kind == "opinion" else "fact",
            valid_at=f.valid_at,
            invalid_at=f.invalid_at,
            confidence=f.confidence,
            unverified=f.unverified,
            current=f.current,
            sources=list(f.sources),
        )


class IdentityOut(_Out):
    value: str
    confidence: Confidence
    sources: list[str]

    @classmethod
    def of(cls, v: IdentityValue) -> IdentityOut:
        return cls(value=v.value, confidence=v.confidence, sources=list(v.sources))


class ProfileOut(_Out):
    person: PersonOut
    identity: dict[str, IdentityOut]
    facts: list[FactOut]

    @classmethod
    def of(cls, p: ProfileRecord) -> ProfileOut:
        return cls(
            person=PersonOut.of(p.person),
            identity={k: IdentityOut.of(v) for k, v in p.identity.items()},
            facts=[FactOut.of(f) for f in p.facts],
        )


class SetIdentityOp(_In):
    op: Literal["set_identity"]
    field: ProfileField
    value: Annotated[Stripped, Field(min_length=1, max_length=100)]


class AddFactOp(_In):
    op: Literal["add_fact"]
    predicate: Annotated[str, Field(min_length=1, max_length=32)]
    object: Annotated[Stripped, Field(min_length=1, max_length=200)]
    valid_at: PartialDate | None = None


class UpdateFactOp(_In):
    op: Literal["update_fact"]
    fact_id: Annotated[str, Field(min_length=1)]
    object: Annotated[Stripped, Field(min_length=1, max_length=200)]


class DeleteFactOp(_In):
    op: Literal["delete_fact"]
    fact_id: Annotated[str, Field(min_length=1)]


ProfileEditRequest = Annotated[
    SetIdentityOp | AddFactOp | UpdateFactOp | DeleteFactOp, Field(discriminator="op")
]


class ProfileEdited(_Out):
    profile: ProfileOut
    entry_id: uuid.UUID = Field(description="The 手动编辑记录 now backing the change")


class DeletionImpactOut(_Out):
    entry_count: int
    can_delete: bool


# --- relationships / feelings -------------------------------------------------------------


class RelationshipTypeOut(_Out):
    category: Category
    subtype: str
    original: str


class RelationshipOut(_Out):
    id: str
    person_a: str
    person_b: str
    types: list[RelationshipTypeOut]
    met_at: PartialDate | None
    origin: str | None
    introduced_by: PersonOut | None
    status: RelationshipStatus | None
    summary: str | None
    confidence: Confidence
    sources: list[str]

    @classmethod
    def of(cls, r: RelationshipRecord) -> RelationshipOut:
        return cls(
            id=r.id,
            person_a=r.person_a,
            person_b=r.person_b,
            types=[
                RelationshipTypeOut(
                    category=Category(t.category), subtype=t.subtype, original=t.original
                )
                for t in r.types
            ],
            met_at=r.met_at,
            origin=r.origin,
            introduced_by=None if r.introduced_by is None else PersonOut.of(r.introduced_by),
            status=None if r.status is None else RelationshipStatus(r.status),
            summary=r.summary,
            confidence=r.confidence,
            sources=list(r.sources),
        )


class FeelingOut(_Out):
    id: str
    level: str
    confidence: Confidence
    occurred_at: PartialDate
    source: str

    @classmethod
    def of(cls, f: FeelingRecord) -> FeelingOut:
        return cls(
            id=f.id,
            level=f.level,
            confidence=f.confidence,
            occurred_at=f.occurred_at,
            source=f.source,
        )


class DimensionOut(_Out):
    current: FeelingOut
    history: list[FeelingOut] = Field(description="Oldest first")


class DirectionOut(_Out):
    """One direction's recorded dimensions; unrecorded dimensions are absent (AC-30)."""

    from_id: str
    to_id: str
    dimensions: dict[str, DimensionOut]


class PairOut(_Out):
    a: PersonOut
    b: PersonOut
    relationship: RelationshipOut | None
    a_to_b: DirectionOut
    b_to_a: DirectionOut
    facts: list[FactOut]

    @classmethod
    def of(cls, p: PairRecord) -> PairOut:
        def direction(src: str, dst: str) -> DirectionOut:
            views = by_direction(p.feelings, src, dst)
            return DirectionOut(
                from_id=src,
                to_id=dst,
                dimensions={
                    d: DimensionOut(
                        current=FeelingOut.of(v.current),
                        history=[FeelingOut.of(f) for f in v.history],
                    )
                    for d, v in views.items()
                },
            )

        return cls(
            a=PersonOut.of(p.a),
            b=PersonOut.of(p.b),
            relationship=None if p.relationship is None else RelationshipOut.of(p.relationship),
            a_to_b=direction(p.a.id, p.b.id),
            b_to_a=direction(p.b.id, p.a.id),
            facts=[FactOut.of(f) for f in p.facts],
        )


class FeelingEditIn(_In):
    direction: Literal["a_to_b", "b_to_a"]
    dimension: Literal["closeness", "affinity", "trust"]
    level: str


class RelationshipTypeIn(_In):
    category: Category
    subtype: Annotated[Stripped, Field(min_length=1, max_length=20)]
    original: Annotated[Stripped, Field(min_length=1, max_length=50)]


class RelationshipEditRequest(_In):
    types: list[RelationshipTypeIn] | None = None
    met_at: PartialDate | None = None
    origin: Annotated[str, Field(max_length=200)] | None = None
    status: RelationshipStatus | None = None
    summary: Annotated[str, Field(max_length=1000)] | None = None
    feelings: list[FeelingEditIn] = Field(default_factory=list)


class PairEdited(_Out):
    pair: PairOut
    entry_id: uuid.UUID


# --- entries / drafts -------------------------------------------------------------------


class SubmitEntryRequest(_In):
    text: Annotated[str, Field(max_length=5000)]
    occurred_on: PartialDate | None = Field(
        default=None, description="Defaults to today (Beijing); YYYY, YYYY-MM or YYYY-MM-DD"
    )


class DraftRef(_Out):
    id: uuid.UUID
    status: DraftStatus


class EntryOut(_Out):
    id: uuid.UUID
    text: str
    occurred_on: PartialDate
    precision: Precision
    kind: Literal["user", "manual_edit"]
    created_at: datetime
    draft: DraftRef | None

    @classmethod
    def of(cls, e: EntryRecord, d: DraftRecord | None) -> EntryOut:
        return cls(
            id=e.id,
            text=e.text,
            occurred_on=e.occurred,
            precision=e.occurred.precision,
            kind="manual_edit" if e.kind == "manual_edit" else "user",
            created_at=e.created_at,
            draft=None if d is None else DraftRef(id=d.id, status=d.status),
        )


class DraftOut(_Out):
    id: uuid.UUID
    entry_id: uuid.UUID
    status: DraftStatus
    content: Draft | None
    error: str | None

    @classmethod
    def of(cls, d: DraftRecord) -> DraftOut:
        return cls(id=d.id, entry_id=d.entry_id, status=d.status, content=d.content, error=d.error)


class EntrySubmitted(_Out):
    entry: EntryOut
    draft: DraftOut


class EntryDetailOut(_Out):
    entry: EntryOut
    draft: DraftOut | None
    persons: list[PersonOut] = Field(description="Persons the confirmed Entry mentions")
    facts: list[FactOut] = Field(description="Facts the Entry backs")


class UpdateDraftRequest(_In):
    content: Draft


# --- taxonomy / usage -----------------------------------------------------------------


class AddSubtypeRequest(_In):
    category: Category
    name: Annotated[str, Field(max_length=40)]


class QuotaOut(_Out):
    used: int
    limit: int
    remaining: int

    @classmethod
    def of(cls, d: QuotaDecision) -> QuotaOut:
        return cls(used=d.used, limit=d.limit, remaining=d.remaining)


class UsageOut(_Out):
    entry: QuotaOut
    ask: QuotaOut
    resets_at: datetime = Field(description="Next 00:00 Beijing time")


__all__ = [
    "DIMENSIONS",
    "AddSubtypeRequest",
    "DeleteAccountRequest",
    "DeletionImpactOut",
    "DraftOut",
    "EntryDetailOut",
    "EntryOut",
    "EntrySubmitted",
    "ErrorBody",
    "FactOut",
    "LoginRequest",
    "MeResponse",
    "PairEdited",
    "PairOut",
    "PersonOut",
    "ProfileEditRequest",
    "ProfileEdited",
    "ProfileOut",
    "RegisterRequest",
    "RelationshipEditRequest",
    "SubmitEntryRequest",
    "UpdateDraftRequest",
    "UsageOut",
]
