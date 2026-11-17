"""Postgres table definitions (ADR-0003: users, invites, Entries, Drafts, custom subtypes, usage).

Definitions only; migrations come with the Docker-backed part of batch 1. Every business
table carries ``user_id`` and repositories inject it from the session (tenant isolation).
Graph data (Person, Fact, Relationship, Feeling, episodes) lives only in Neo4j.
"""

from __future__ import annotations

import uuid
from datetime import date, datetime
from typing import Any

from sqlalchemy import (
    CheckConstraint,
    Date,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Text,
    UniqueConstraint,
    func,
)
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column

from weft.domain.dates import ISO_PATTERN


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


__all__ = [
    "Base",
    "CustomSubtype",
    "DraftRow",
    "Entry",
    "InviteCode",
    "Session",
    "UsageCounter",
    "User",
]
