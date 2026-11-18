"""HTTP contract: request and response bodies (JSON). Validation lives here, not in routes.

The Draft body is the published ``Draft`` contract itself (contracts/draft.schema.json);
the vocabulary is ``TaxonomyResponse`` (contracts/taxonomy.schema.json). Every route's
schema is in the OpenAPI document at ``/openapi.json``.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Annotated, Literal

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator

from weft.domain.answer import Answer
from weft.domain.confidence import Confidence
from weft.domain.dates import PartialDate, Precision
from weft.domain.draft import (
    ClosenessLevel,
    Draft,
    DraftStatus,
    ProfileField,
    RelationshipStatus,
)
from weft.domain.feelings import DIMENSIONS, by_direction
from weft.domain.graph_view import GraphView
from weft.domain.graph_write import humanize
from weft.domain.intent import Clarification, Intent
from weft.domain.message import Problem
from weft.domain.preferences import GraphTheme, Preferences
from weft.domain.quota import QuotaDecision
from weft.domain.taxonomy import Category
from weft.repositories.records import (
    DraftRecord,
    EntryRecord,
    EpisodeRecord,
    FactRecord,
    FeelingRecord,
    IdentityValue,
    PairRecord,
    PersonRecord,
    ProfileRecord,
    RelationshipRecord,
    UserRecord,
)
from weft.services.messages import MessageView

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

Episodes = dict[str, EpisodeRecord]


class CitationOut(_Out):
    """出处 (AC-25): one source Entry of an item, with the item's Confidence."""

    entry_id: str
    entry_excerpt: str = Field(description="记录原文")
    occurred_on: PartialDate = Field(description="The Entry's 发生日期, with precision")
    kind: Literal["user", "manual_edit"]
    confidence: Confidence

    @classmethod
    def all_of(
        cls, sources: tuple[str, ...], confidence: Confidence, episodes: Episodes
    ) -> list[CitationOut]:
        return [
            cls(
                entry_id=e.entry_id,
                entry_excerpt=e.content,
                occurred_on=e.occurred,
                kind="manual_edit" if e.kind == "manual_edit" else "user",
                confidence=confidence,
            )
            for s in dict.fromkeys(sources)
            if (e := episodes.get(s)) is not None
        ]


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
    citations: list[CitationOut] = Field(description="Every source Entry (AC-25)")

    @classmethod
    def of(cls, f: FactRecord, episodes: Episodes | None = None) -> FactOut:
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
            citations=CitationOut.all_of(f.sources, f.confidence, episodes or {}),
        )


class IdentityOut(_Out):
    value: str
    confidence: Confidence
    sources: list[str]
    citations: list[CitationOut]

    @classmethod
    def of(cls, v: IdentityValue, episodes: Episodes) -> IdentityOut:
        return cls(
            value=v.value,
            confidence=v.confidence,
            sources=list(v.sources),
            citations=CitationOut.all_of(v.sources, v.confidence, episodes),
        )


class SummaryOut(_Out):
    """综合描述 (AC-24): generated from the profile; regenerated after every change."""

    text: str
    generated_at: datetime


class ProfileOut(_Out):
    person: PersonOut
    identity: dict[str, IdentityOut]
    facts: list[FactOut]
    summary: SummaryOut | None

    @classmethod
    def of(cls, p: ProfileRecord) -> ProfileOut:
        summary = (
            SummaryOut(text=humanize(p.summary), generated_at=p.summary_generated_at)
            if p.summary and p.summary_generated_at
            else None
        )
        return cls(
            person=PersonOut.of(p.person),
            identity={k: IdentityOut.of(v, p.episodes) for k, v in p.identity.items()},
            facts=[FactOut.of(f, p.episodes) for f in p.facts],
            summary=summary,
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
    summary_generated_at: datetime | None = Field(description="None: written by the user")
    confidence: Confidence
    sources: list[str]
    citations: list[CitationOut]

    @classmethod
    def of(cls, r: RelationshipRecord, episodes: Episodes | None = None) -> RelationshipOut:
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
            # generated text written before labels were complete may hold an internal name
            summary=humanize(r.summary) if r.summary and r.summary_generated_at else r.summary,
            summary_generated_at=r.summary_generated_at,
            confidence=r.confidence,
            sources=list(r.sources),
            citations=CitationOut.all_of(r.sources, r.confidence, episodes or {}),
        )


class FeelingOut(_Out):
    id: str
    level: str
    confidence: Confidence
    occurred_at: PartialDate
    source: str
    citations: list[CitationOut]

    @classmethod
    def of(cls, f: FeelingRecord, episodes: Episodes) -> FeelingOut:
        return cls(
            id=f.id,
            level=f.level,
            confidence=f.confidence,
            occurred_at=f.occurred_at,
            source=f.source,
            citations=CitationOut.all_of((f.source,), f.confidence, episodes),
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
                        current=FeelingOut.of(v.current, p.episodes),
                        history=[FeelingOut.of(f, p.episodes) for f in v.history],
                    )
                    for d, v in views.items()
                },
            )

        return cls(
            a=PersonOut.of(p.a),
            b=PersonOut.of(p.b),
            relationship=None
            if p.relationship is None
            else RelationshipOut.of(p.relationship, p.episodes),
            a_to_b=direction(p.a.id, p.b.id),
            b_to_a=direction(p.b.id, p.a.id),
            facts=[FactOut.of(f, p.episodes) for f in p.facts],
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


class LearnedAliasOut(_Out):
    alias: str
    person_id: str
    name: str = Field(description="The person's current name")


class EntryDetailOut(_Out):
    entry: EntryOut
    draft: DraftOut | None
    persons: list[PersonOut] = Field(description="Persons the confirmed Entry mentions")
    facts: list[FactOut] = Field(description="Facts the Entry backs")
    learned_aliases: list[LearnedAliasOut] = Field(
        description="Aliases this Entry's confirmation added (AC-13); empty if none were new"
    )


class UpdateDraftRequest(_In):
    content: Draft
    occurred_on: PartialDate | None = Field(
        default=None,
        description=(
            "Move the Entry's 发生日期 (not in the future; YYYY, YYYY-MM or YYYY-MM-DD). "
            "The Draft's dates anchored on the old date are re-timed; nothing is re-extracted."
        ),
    )


# --- messages (intent routing) ------------------------------------------------------------


class SendMessageRequest(_In):
    text: Annotated[str, Field(max_length=5000)]


class RerouteRequest(_In):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)
    as_: Literal["record", "ask"] = Field(
        alias="as", description="改为记录 (record) / 改为提问 (ask)"
    )


class ClarifyRequest(_In):
    option: int = Field(ge=0, description="Index of the clicked option in clarify.options")


class MessageEntryOut(_Out):
    """The Entry a message became (记录), with its Draft."""

    id: uuid.UUID
    text: str = Field(description="The Entry text (for record_ask: only the new information)")
    occurred_on: PartialDate = Field(description="The Entry's 发生日期, with precision")
    precision: Precision
    draft: DraftOut | None


class ProblemOut(_Out):
    """A part of the message that could not be done; the other part still was (AC-7)."""

    part: Literal["record", "ask"]
    error: str = Field(description="quota_exceeded | ask_failed | question_too_long | ...")
    message: str
    resets_at: datetime | None = Field(
        default=None, description="quota_exceeded: the next 00:00 Beijing time"
    )

    @classmethod
    def of(cls, p: Problem) -> ProblemOut:
        return cls(part=p.part, error=p.error, message=p.message, resets_at=p.resets_at)


class ClarifyOptionOut(_Out):
    label: str = Field(
        description="What clicking does: 「记下：…」「查：…」; 指代确认: 「老周（周涛，同学）」"
    )
    intent: Literal["record", "ask", "record_ask"] = Field(
        description="record: the original text becomes a 记录; ask: question is answered"
    )
    question: str | None = Field(description="ask / record_ask: the question that is answered")
    person_id: str | None = Field(
        description="指代确认 (source ask): the person this candidate means; null otherwise"
    )


class ClarifyOut(_Out):
    """反问 (intent clarify): a concrete question about a 拿不准 message, with 1–3 options; or
    指代确认 (source ask, conversation context): which person / event a question meant, 2–4
    options. Clicking either goes through ``POST /api/messages/{id}/clarify``."""

    source: Literal["intent", "ask"] = Field(
        description="intent: 反问 of intent recognition; ask: 问答's 指代确认 (clicking is free)"
    )
    question: str
    options: list[ClarifyOptionOut]
    resolved: bool = Field(description="Settled (clicked, answered, re-routed): hide options")

    @classmethod
    def of(cls, c: Clarification, *, resolved: bool) -> ClarifyOut:
        return cls(
            source=c.source.value,
            question=c.question,
            options=[
                ClarifyOptionOut(
                    label=o.label,
                    intent=o.intent.value,
                    question=o.question,
                    person_id=o.person_id,
                )
                for o in c.options
            ],
            resolved=resolved,
        )


class FollowedOut(_Out):
    """An earlier question an answer was read with (上文, 「接着：…」)."""

    message_id: uuid.UUID
    question: str


class MessageOut(_Out):
    message_id: uuid.UUID
    text: str
    created_at: datetime
    intent: Intent = Field(description="How the message is handled now (after any re-route)")
    recognized_intent: Intent | None = Field(
        description="What recognition said; null for messages migrated from earlier Entries"
    )
    confidence: float | None = Field(description="Recognition confidence 0..1; null if none")
    uncertain: bool = Field(description="拿不准: recognition was below the threshold")
    entry: MessageEntryOut | None = Field(description="record / record_ask: the Entry + Draft")
    answer: Answer | None = Field(description="ask / record_ask: the answer, with citations")
    reply: str | None = Field(description="chitchat: the short reply")
    problems: list[ProblemOut]
    clarify: ClarifyOut | None = Field(
        description="拿不准 with a 反问: shown instead of the fixed reply; null otherwise"
    )
    clarification_of: uuid.UUID | None = Field(
        description="This message was typed as the answer to that message's 反问"
    )
    history_used_of: list[FollowedOut] = Field(
        description=(
            "上文: the earlier questions the answer was read with, oldest first; empty when "
            "it was answered on its own. Non-empty: show 「接着：<last question>」 and offer "
            "「不接上文」 (POST /api/messages/{id}/reanswer)"
        )
    )

    @classmethod
    def of(cls, v: MessageView) -> MessageOut:
        m = v.message
        entry = (
            None
            if v.entry is None
            else MessageEntryOut(
                id=v.entry.id,
                text=v.entry.text,
                occurred_on=v.entry.occurred,
                precision=v.entry.occurred.precision,
                draft=None if v.draft is None else DraftOut.of(v.draft),
            )
        )
        return cls(
            message_id=m.id,
            text=m.text,
            created_at=m.created_at,
            intent=m.intent,
            recognized_intent=m.recognized_intent,
            confidence=m.confidence,
            uncertain=m.uncertain,
            entry=entry,
            answer=m.answer,
            reply=m.reply,
            problems=[ProblemOut.of(p) for p in m.problems],
            clarify=None
            if m.clarify is None
            else ClarifyOut.of(m.clarify, resolved=m.clarification_resolved_at is not None),
            clarification_of=m.clarification_of,
            history_used_of=[FollowedOut(message_id=i, question=q) for i, q in v.follows],
        )


class MessagePage(_Out):
    messages: list[MessageOut] = Field(description="Oldest first; the newest message is last")
    has_more: bool = Field(description="Older messages exist: pass the first message_id as before")


# --- graph views / ask -------------------------------------------------------------------


class GraphNodeOut(_Out):
    model_config = ConfigDict(extra="forbid", json_schema_serialization_defaults_required=True)

    id: str
    name: str
    is_self: bool
    met_at: PartialDate | None = Field(
        default=None,
        description="认识时间: the Relationship with Self's met_at, else the 发生日期 of the "
        "first Entry mentioning the person; None for Self or when unknown",
    )
    anchor_person_id: str | None = Field(
        default=None,
        description="Persons with no Relationship to Self (间接认识): the connected person "
        "nearest to Self, whose angle they sit near",
    )


class GraphEdgeOut(_Out):
    model_config = ConfigDict(extra="forbid", json_schema_serialization_defaults_required=True)

    id: str
    source: str
    target: str
    types: list[RelationshipTypeOut] = Field(description="types[0] is the primary type")
    status: RelationshipStatus | None
    closeness: ClosenessLevel | None = Field(description="The closer direction's level")
    confidence: Confidence
    source_closeness: ClosenessLevel | None = Field(
        default=None, description="source's closeness to target (感受, this direction)"
    )
    target_closeness: ClosenessLevel | None = Field(
        default=None, description="target's closeness to source (感受, the other direction)"
    )


class GraphGroupOut(_Out):
    """群体: a workplace, school or family with two or more members (Self never counted)."""

    id: str
    name: str
    kind: Literal["family", "organization", "school"]
    member_ids: list[str]


class GraphTimelineOut(_Out):
    model_config = ConfigDict(extra="forbid", populate_by_name=True)

    from_: PartialDate | None = Field(
        alias="from", description="The earliest 认识时间; None when nobody has one"
    )
    to: date = Field(description="Today")


def _closeness(level: str | None) -> ClosenessLevel | None:
    return None if level is None else ClosenessLevel(level)


class GraphOut(_Out):
    model_config = ConfigDict(extra="forbid", json_schema_serialization_defaults_required=True)

    center_id: str
    nodes: list[GraphNodeOut]
    edges: list[GraphEdgeOut]
    omitted: int = Field(description="Persons left out by the 50-node cap (AC-33)")
    groups: list[GraphGroupOut] = Field(default_factory=list)
    timeline: GraphTimelineOut | None = Field(
        default=None, description="Panorama only: the time axis' range"
    )
    at: PartialDate | None = Field(default=None, description="The time point shown; None = now")

    @classmethod
    def of(cls, v: GraphView) -> GraphOut:
        return cls(
            center_id=v.center_id,
            nodes=[
                GraphNodeOut(
                    id=n.id,
                    name=n.name,
                    is_self=n.is_self,
                    met_at=n.met_at,
                    anchor_person_id=n.anchor_id,
                )
                for n in v.nodes
            ],
            edges=[
                GraphEdgeOut(
                    id=e.id,
                    source=e.source,
                    target=e.target,
                    types=[
                        RelationshipTypeOut(
                            category=Category(t.category), subtype=t.subtype, original=t.original
                        )
                        for t in e.types
                    ],
                    status=None if e.status is None else RelationshipStatus(e.status),
                    closeness=_closeness(e.closeness),
                    confidence=Confidence(e.confidence),
                    source_closeness=_closeness(e.source_closeness),
                    target_closeness=_closeness(e.target_closeness),
                )
                for e in v.edges
            ],
            omitted=v.omitted,
            groups=[
                GraphGroupOut(
                    id=g.id,
                    name=g.name,
                    kind=g.kind,
                    member_ids=g.member_ids,
                )
                for g in v.groups
            ],
            timeline=None
            if v.timeline is None
            else GraphTimelineOut(from_=v.timeline.start, to=v.timeline.end),
            at=v.at,
        )


# --- preferences (graph-viz AC-18) -----------------------------------------------------------


class PreferencesOut(_Out):
    graph_theme: GraphTheme = Field(
        description="图谱外观: light = 浅色 (default), starfield = 星空"
    )

    @classmethod
    def of(cls, p: Preferences) -> PreferencesOut:
        return cls(graph_theme=p.graph_theme)


class PreferencesPatch(_In):
    """Only the fields given change; ``null`` is not a value."""

    graph_theme: GraphTheme | None = Field(default=None, description="Omit to keep")

    @field_validator("graph_theme", mode="before")
    @classmethod
    def _not_null(cls, value: object) -> object:
        if value is None:
            raise ValueError("graph_theme cannot be null")
        return value


class AskRequest(_In):
    question: Annotated[str, Field(min_length=1, max_length=500)]


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
    "AskRequest",
    "CitationOut",
    "DeleteAccountRequest",
    "DeletionImpactOut",
    "DraftOut",
    "EntryDetailOut",
    "EntryOut",
    "EntrySubmitted",
    "ErrorBody",
    "FactOut",
    "GraphGroupOut",
    "GraphOut",
    "GraphTimelineOut",
    "LearnedAliasOut",
    "LoginRequest",
    "MeResponse",
    "MessageEntryOut",
    "MessageOut",
    "MessagePage",
    "PairEdited",
    "PairOut",
    "PersonOut",
    "PreferencesOut",
    "PreferencesPatch",
    "ProblemOut",
    "ProfileEditRequest",
    "ProfileEdited",
    "ProfileOut",
    "RegisterRequest",
    "RelationshipEditRequest",
    "RerouteRequest",
    "SendMessageRequest",
    "SubmitEntryRequest",
    "SummaryOut",
    "UpdateDraftRequest",
    "UsageOut",
]
