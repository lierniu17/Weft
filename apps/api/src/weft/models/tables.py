"""Postgres table definitions (ADR-0003: users, invites, Entries, Drafts, messages, custom
subtypes, usage, preferences).

Definitions only; migrations come with the Docker-backed part of batch 1. Every business
table carries ``user_id`` and repositories inject it from the session (tenant isolation).
Graph data (Person, Fact, Relationship, Feeling, episodes) lives only in Neo4j.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Any

from sqlalchemy import (
    Boolean,
    CheckConstraint,
    Date,
    DateTime,
    Float,
    ForeignKey,
    Index,
    Integer,
    String,
    Text,
    UniqueConstraint,
    false,
    func,
)
from sqlalchemy import (
    text as sql_text,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from weft.domain.dates import ISO_PATTERN
from weft.domain.intent import Intent

INTENTS_SQL = "(" + ", ".join(f"'{i.value}'" for i in Intent) + ")"


class Base(DeclarativeBase):
    pass


def _now() -> Any:
    return mapped_column(DateTime(timezone=True), server_default=func.now(), nullable=False)


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    username: Mapped[str] = mapped_column(String(64), unique=True)
    password_hash: Mapped[str] = mapped_column(String(255))
    display_name: Mapped[str] = mapped_column(String(64))  # 本人's name (AC-3)
    created_at: Mapped[datetime] = _now()


class InviteCode(Base):
    """Admin-managed (AC-41). Single use; stays used after the account is deleted (AC-5)."""

    __tablename__ = "invite_codes"

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    code: Mapped[str] = mapped_column(String(32), unique=True)
    created_at: Mapped[datetime] = _now()
    revoked_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    used_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    used_by_user_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL")
    )


class Session(Base):
    __tablename__ = "sessions"

    id: Mapped[str] = mapped_column(String(128), primary_key=True)  # hash of the cookie token
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    created_at: Mapped[datetime] = _now()
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class Entry(Base):
    """An Entry (记录). Its id is also the Graphiti episode id (ADR-0003)."""

    __tablename__ = "entries"
    __table_args__ = (
        CheckConstraint(f"occurred_on ~ '{ISO_PATTERN}'", name="occurred_on_iso"),
        CheckConstraint(
            "occurred_precision IN ('year', 'month', 'day')", name="occurred_precision_enum"
        ),
        CheckConstraint("kind IN ('user', 'manual_edit')", name="entry_kind_enum"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    text: Mapped[str] = mapped_column(Text)
    occurred_on: Mapped[str] = mapped_column(String(10))  # PartialDate ISO: YYYY[-MM[-DD]]
    occurred_precision: Mapped[str] = mapped_column(String(5))
    kind: Mapped[str] = mapped_column(String(16), default="user")
    # The Beijing day the text was written, when its occurred date was read from the text
    # itself (a message, intent-routing spec AC-8): relative times such as 「上周末」 are
    # relative to this day, not to the occurred date. NULL for Entries dated by hand.
    written_on: Mapped[date | None] = mapped_column(Date)
    created_at: Mapped[datetime] = _now()


class DraftRow(Base):
    """A Draft (草稿); ``content`` holds the Draft JSON (contracts/draft.schema.json)."""

    __tablename__ = "drafts"
    __table_args__ = (
        CheckConstraint(
            "status IN ('extracting', 'pending', 'failed', 'confirmed', 'discarded')",
            name="draft_status_enum",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    entry_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("entries.id", ondelete="CASCADE"), unique=True
    )
    status: Mapped[str] = mapped_column(String(16), default="extracting")
    content: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    error: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = _now()
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )
    confirmed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class MessageRow(Base):
    """A message (消息) the user sent in the chat, and how it was handled (ADR 0005).

    ``intent`` is the current handling (after any 改为记录 / 改为提问);
    ``recognized_intent`` and ``confidence`` are what recognition said (NULL for messages
    migrated from Entries, which were never recognized). ``answer`` is the ``Answer`` JSON
    (contracts/answer.schema.json); ``problems`` lists parts that could not be done
    (quota, Q&A failure) as ``[{part, error, message, resets_at?}]``.
    """

    __tablename__ = "messages"
    __table_args__ = (
        CheckConstraint(f"intent IN {INTENTS_SQL}", name="message_intent_enum"),
        CheckConstraint(
            f"recognized_intent IS NULL OR recognized_intent IN {INTENTS_SQL}",
            name="message_recognized_intent_enum",
        ),
        CheckConstraint(
            f"occurred_on IS NULL OR occurred_on ~ '{ISO_PATTERN}'", name="message_occurred_iso"
        ),
        Index("ix_messages_user_created", "user_id", "created_at", "id"),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    text: Mapped[str] = mapped_column(Text)
    intent: Mapped[str] = mapped_column(String(16))
    recognized_intent: Mapped[str | None] = mapped_column(String(16))
    confidence: Mapped[float | None] = mapped_column(Float)
    uncertain: Mapped[bool] = mapped_column(Boolean, default=False, server_default=false())
    occurred_on: Mapped[str | None] = mapped_column(String(10))  # recognized, PartialDate ISO
    record_text: Mapped[str | None] = mapped_column(Text)
    question: Mapped[str | None] = mapped_column(Text)
    entry_id: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("entries.id", ondelete="SET NULL"), index=True
    )
    answer: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    reply: Mapped[str | None] = mapped_column(Text)
    problems: Mapped[list[dict[str, Any]]] = mapped_column(
        JSONB, default=list, server_default=sql_text("'[]'::jsonb")
    )
    # 反问 (intent-clarify): {question, options: [{label, intent, question?}]} on a 拿不准
    # message; an answer typed to it points at it (clarification_of); resolved once settled.
    clarify_json: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    clarification_of: Mapped[uuid.UUID | None] = mapped_column(
        ForeignKey("messages.id", ondelete="SET NULL")
    )
    clarification_resolved_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime] = _now()
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


class CustomSubtype(Base):
    """A user's own Relationship Type subtype under a built-in category (AC-32)."""

    __tablename__ = "custom_subtypes"
    __table_args__ = (
        UniqueConstraint("user_id", "name", name="custom_subtype_unique_per_user"),
        CheckConstraint(
            "category IN ('kin', 'romantic', 'social', 'interest', 'hostile')",
            name="custom_subtype_category_enum",
        ),
    )

    id: Mapped[uuid.UUID] = mapped_column(primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), index=True
    )
    category: Mapped[str] = mapped_column(String(16))
    name: Mapped[str] = mapped_column(String(20))
    created_at: Mapped[datetime] = _now()


class UsageCounter(Base):
    """Per user, per kind (entry / ask), per Beijing-time day (AC-40)."""

    __tablename__ = "usage_counters"
    __table_args__ = (CheckConstraint("kind IN ('entry', 'ask')", name="usage_kind_enum"),)

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    kind: Mapped[str] = mapped_column(String(8), primary_key=True)
    day: Mapped[date] = mapped_column(Date, primary_key=True)
    count: Mapped[int] = mapped_column(Integer, default=0)


class UserPreferences(Base):
    """Account-level settings (graph-viz AC-18); no row = the defaults."""

    __tablename__ = "user_preferences"
    __table_args__ = (
        CheckConstraint("graph_theme IN ('light', 'starfield')", name="graph_theme_enum"),
    )

    user_id: Mapped[uuid.UUID] = mapped_column(
        ForeignKey("users.id", ondelete="CASCADE"), primary_key=True
    )
    graph_theme: Mapped[str] = mapped_column(Text, server_default="light", default="light")
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now(), onupdate=func.now()
    )


__all__ = [
    "Base",
    "CustomSubtype",
    "DraftRow",
    "Entry",
    "InviteCode",
    "MessageRow",
    "Session",
    "UsageCounter",
    "User",
    "UserPreferences",
]
