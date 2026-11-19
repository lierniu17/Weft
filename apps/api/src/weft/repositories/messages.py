"""Postgres: messages (消息) the user sent in the chat, tenant-scoped (ADR 0005)."""

from __future__ import annotations

import uuid
from datetime import datetime
from typing import Any

from sqlalchemy import and_, func, or_, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from weft.domain.answer import Answer
from weft.domain.dates import PartialDate
from weft.domain.intent import Clarification, Intent
from weft.domain.message import Problem
from weft.domain.tenancy import TenantContext, tenant_scoped
from weft.models.tables import DraftRow, Entry, MessageRow
from weft.repositories.entries import draft_record, entry_record
from weft.repositories.records import DraftRecord, EntryRecord, MessageRecord

# Columns a re-route, a clicked 反问 option (or the second half of handling) may change.
HANDLING_FIELDS = frozenset(
    {
        "intent",
        "entry_id",
        "answer",
        "reply",
        "problems",
        "uncertain",
        "record_text",
        "question",
        "clarification_resolved_at",
        "clarify",
        "history_used_of",
    }
)


def _message(row: MessageRow) -> MessageRecord:
    return MessageRecord(
        id=row.id,
        text=row.text,
        intent=Intent(row.intent),
        recognized_intent=Intent(row.recognized_intent) if row.recognized_intent else None,
        confidence=row.confidence,
        uncertain=row.uncertain,
        occurred=PartialDate.parse(row.occurred_on) if row.occurred_on else None,
        record_text=row.record_text,
        question=row.question,
        entry_id=row.entry_id,
        answer=None if row.answer is None else Answer.model_validate(row.answer),
        reply=row.reply,
        problems=tuple(Problem.from_json(p) for p in row.problems or []),
        created_at=row.created_at,
        clarify=None if row.clarify_json is None else Clarification.from_json(row.clarify_json),
        clarification_of=row.clarification_of,
        clarification_resolved_at=row.clarification_resolved_at,
        history_used_of=tuple(uuid.UUID(i) for i in row.history_used_of or []),
    )


def _column_values(values: dict[str, Any]) -> dict[str, Any]:
    out = dict(values)
    if "intent" in out:
        out["intent"] = Intent(out["intent"]).value
    if "answer" in out and out["answer"] is not None:
        out["answer"] = out["answer"].model_dump(mode="json")
    if "problems" in out:
        out["problems"] = [p.to_json() for p in out["problems"]]
    if "clarify" in out:
        clarify = out.pop("clarify")
        out["clarify_json"] = None if clarify is None else clarify.to_json()
    if "history_used_of" in out:
        used = [str(i) for i in out["history_used_of"] or ()]
        out["history_used_of"] = used or None
    return out


MessageWithEntry = tuple[MessageRecord, EntryRecord | None, DraftRecord | None]


class MessageRepository:
    def __init__(self, session: AsyncSession, tenant: TenantContext) -> None:
        self._s = session
        self.tenant = tenant

    @tenant_scoped
    async def create(
        self,
        *,
        text: str,
        intent: Intent,
        recognized_intent: Intent | None,
        confidence: float | None,
        uncertain: bool,
        occurred: PartialDate | None,
        record_text: str | None = None,
        question: str | None = None,
        entry_id: uuid.UUID | None = None,
        answer: Answer | None = None,
        reply: str | None = None,
        problems: tuple[Problem, ...] = (),
        clarify: Clarification | None = None,
        clarification_of: uuid.UUID | None = None,
        history_used_of: tuple[uuid.UUID, ...] = (),
    ) -> MessageRecord:
        row = MessageRow(
            user_id=self.tenant.user_id,
            text=text,
            recognized_intent=None if recognized_intent is None else recognized_intent.value,
            confidence=confidence,
            occurred_on=None if occurred is None else occurred.isoformat(),
            record_text=record_text,
            question=question,
            clarification_of=clarification_of,
            **_column_values(
                {
                    "clarify": clarify,
                    "history_used_of": history_used_of,
                    "intent": intent,
                    "uncertain": uncertain,
                    "entry_id": entry_id,
                    "answer": answer,
                    "reply": reply,
                    "problems": problems,
                }
            ),
        )
        self._s.add(row)
        await self._s.flush()
        await self._s.refresh(row)
        return _message(row)

    @tenant_scoped
    async def get(self, message_id: uuid.UUID) -> MessageRecord | None:
        row = await self._s.scalar(
            select(MessageRow).where(
                MessageRow.id == message_id, MessageRow.user_id == self.tenant.user_id
            )
        )
        return None if row is None else _message(row)

    @tenant_scoped
    async def latest(self) -> tuple[MessageRecord | None, datetime]:
        """The user's newest message (if any) and the database's current time, which is the
        clock ``created_at`` was stamped with."""
        row = await self._s.scalar(
            select(MessageRow)
            .where(MessageRow.user_id == self.tenant.user_id)
            .order_by(MessageRow.created_at.desc(), MessageRow.id.desc())
            .limit(1)
        )
        now = await self._s.scalar(select(func.now()))
        assert now is not None
        return (None if row is None else _message(row)), now

    @tenant_scoped
    async def answered(self, limit: int) -> tuple[list[MessageRecord], datetime]:
        """The user's ``limit`` newest messages that were answered as questions (newest
        first), and the database's current time (the clock ``created_at`` uses)."""
        rows = await self._s.scalars(
            select(MessageRow)
            .where(
                MessageRow.user_id == self.tenant.user_id,
                MessageRow.intent.in_([Intent.ASK.value, Intent.RECORD_ASK.value]),
                func.jsonb_typeof(MessageRow.answer) == "object",  # JSON null too
            )
            .order_by(MessageRow.created_at.desc(), MessageRow.id.desc())
            .limit(limit)
        )
        now = await self._s.scalar(select(func.now()))
        assert now is not None
        return [_message(r) for r in rows], now

    @tenant_scoped
    async def questions(self, ids: list[uuid.UUID]) -> dict[uuid.UUID, str]:
        """The question each of these messages (the user's own) asked: id -> question."""
        if not ids:
            return {}
        rows = await self._s.execute(
            select(MessageRow.id, MessageRow.question, MessageRow.text).where(
                MessageRow.user_id == self.tenant.user_id, MessageRow.id.in_(set(ids))
            )
        )
        return {i: question or text for i, question, text in rows}

    @tenant_scoped
    async def update_handling(self, message_id: uuid.UUID, **values: Any) -> MessageRecord | None:
        """Change how the message is handled (``HANDLING_FIELDS`` only)."""
        unknown = set(values) - HANDLING_FIELDS
        if unknown:
            raise ValueError(f"not a handling field: {sorted(unknown)}")
        row = await self._s.scalar(
            update(MessageRow)
            .where(MessageRow.id == message_id, MessageRow.user_id == self.tenant.user_id)
            .values(**_column_values(values))
            .returning(MessageRow)
        )
        return None if row is None else _message(row)

    @tenant_scoped
    async def with_entry(self, message: MessageRecord) -> MessageWithEntry:
        """The message with its Entry and that Entry's Draft (if any)."""
        if message.entry_id is None:
            return message, None, None
        row = (
            await self._s.execute(
                select(Entry, DraftRow)
                .outerjoin(DraftRow, DraftRow.entry_id == Entry.id)
                .where(Entry.id == message.entry_id, Entry.user_id == self.tenant.user_id)
            )
        ).first()
        if row is None:
            return message, None, None
        entry, draft = row
        return message, entry_record(entry), None if draft is None else draft_record(draft)

    @tenant_scoped
    async def page(
        self, *, before: uuid.UUID | None, limit: int
    ) -> tuple[list[MessageWithEntry], bool] | None:
        """The ``limit`` latest messages (older than ``before``), oldest first, and whether
        older ones exist. ``None`` if ``before`` is not one of this user's messages."""
        mine = MessageRow.user_id == self.tenant.user_id
        query = (
            select(MessageRow, Entry, DraftRow)
            .outerjoin(
                Entry, and_(Entry.id == MessageRow.entry_id, Entry.user_id == self.tenant.user_id)
            )
            .outerjoin(DraftRow, DraftRow.entry_id == Entry.id)
            .where(mine)
        )
        if before is not None:
            anchor = await self._s.scalar(select(MessageRow).where(MessageRow.id == before, mine))
            if anchor is None:
                return None
            query = query.where(
                or_(
                    MessageRow.created_at < anchor.created_at,
                    and_(MessageRow.created_at == anchor.created_at, MessageRow.id < anchor.id),
                )
            )
        rows = (
            await self._s.execute(
                query.order_by(MessageRow.created_at.desc(), MessageRow.id.desc()).limit(limit + 1)
            )
        ).all()
        has_more = len(rows) > limit
        out: list[MessageWithEntry] = [
            (
                _message(m),
                None if e is None else entry_record(e),
                None if d is None else draft_record(d),
            )
            for m, e, d in rows[:limit]
        ]
        out.reverse()
        return out, has_more


__all__ = ["MessageRepository", "MessageWithEntry"]
