"""Postgres: Entries (记录) and their Drafts (草稿), tenant-scoped."""

from __future__ import annotations

import uuid
from collections.abc import Iterable
from datetime import datetime

from sqlalchemy import func, select, update
from sqlalchemy.ext.asyncio import AsyncSession

from weft.domain.dates import PartialDate
from weft.domain.draft import Draft, DraftStatus
from weft.domain.tenancy import TenantContext, tenant_scoped
from weft.models.tables import DraftRow, Entry
from weft.repositories.records import DraftRecord, EntryRecord


def _entry(row: Entry) -> EntryRecord:
    return EntryRecord(
        id=row.id,
        text=row.text,
        occurred=PartialDate.parse(row.occurred_on),
        kind=row.kind,
        created_at=row.created_at,
    )


def _draft(row: DraftRow) -> DraftRecord:
    return DraftRecord(
        id=row.id,
        entry_id=row.entry_id,
        status=DraftStatus(row.status),
        content=None if row.content is None else Draft.model_validate(row.content),
        error=row.error,
        updated_at=row.updated_at,
    )


class EntryRepository:
    def __init__(self, session: AsyncSession, tenant: TenantContext) -> None:
        self._s = session
        self.tenant = tenant

    @tenant_scoped
    async def create(self, *, text: str, occurred: PartialDate, kind: str) -> EntryRecord:
        row = Entry(
            user_id=self.tenant.user_id,
            text=text,
            occurred_on=occurred.isoformat(),
            occurred_precision=occurred.precision.value,
            kind=kind,
        )
        self._s.add(row)
        await self._s.flush()
        await self._s.refresh(row)
        return _entry(row)

    @tenant_scoped
    async def get(self, entry_id: uuid.UUID) -> EntryRecord | None:
        row = await self._s.scalar(
            select(Entry).where(Entry.id == entry_id, Entry.user_id == self.tenant.user_id)
        )
        return None if row is None else _entry(row)

    @tenant_scoped
    async def list_with_drafts(self) -> list[tuple[EntryRecord, DraftRecord | None]]:
        """Every Entry, latest occurred date first (AC-9), with its Draft if it has one."""
        rows = await self._s.execute(
            select(Entry, DraftRow)
            .outerjoin(DraftRow, DraftRow.entry_id == Entry.id)
            .where(Entry.user_id == self.tenant.user_id)
            .order_by(Entry.occurred_on.desc(), Entry.created_at.desc())
        )
        return [(_entry(e), None if d is None else _draft(d)) for e, d in rows.all()]

    @tenant_scoped
    async def count(self) -> int:
        value = await self._s.scalar(
            select(func.count()).select_from(Entry).where(Entry.user_id == self.tenant.user_id)
        )
        return int(value or 0)


class DraftRepository:
    def __init__(self, session: AsyncSession, tenant: TenantContext) -> None:
        self._s = session
        self.tenant = tenant

    @tenant_scoped
    async def create_extracting(self, entry_id: uuid.UUID) -> DraftRecord:
        row = DraftRow(
            user_id=self.tenant.user_id, entry_id=entry_id, status=DraftStatus.EXTRACTING.value
        )
        self._s.add(row)
        await self._s.flush()
        await self._s.refresh(row)
        return _draft(row)

    @tenant_scoped
    async def get(self, draft_id: uuid.UUID) -> DraftRecord | None:
        row = await self._s.scalar(
            select(DraftRow).where(DraftRow.id == draft_id, DraftRow.user_id == self.tenant.user_id)
        )
        return None if row is None else _draft(row)

    @tenant_scoped
    async def get_by_entry(self, entry_id: uuid.UUID) -> DraftRecord | None:
        row = await self._s.scalar(
            select(DraftRow).where(
                DraftRow.entry_id == entry_id, DraftRow.user_id == self.tenant.user_id
            )
        )
        return None if row is None else _draft(row)

    @tenant_scoped
    async def transition(
        self,
        draft_id: uuid.UUID,
        *,
        from_statuses: Iterable[DraftStatus],
        to: DraftStatus,
        content: Draft | None = None,
        error: str | None = None,
        now: datetime | None = None,
    ) -> DraftRecord | None:
        """Atomically move a draft between statuses; ``None`` if it is not in ``from_statuses``."""
        values: dict[str, object] = {"status": to.value, "error": error}
        if content is not None:
            values["content"] = content.model_dump(mode="json", by_alias=True)
        if to is DraftStatus.CONFIRMED:
            values["confirmed_at"] = now or func.now()
        values["updated_at"] = now or func.now()
        row = await self._s.scalar(
            update(DraftRow)
            .where(
                DraftRow.id == draft_id,
                DraftRow.user_id == self.tenant.user_id,
                DraftRow.status.in_([s.value for s in from_statuses]),
            )
            .values(**values)
            .returning(DraftRow)
        )
        return None if row is None else _draft(row)


__all__ = ["DraftRepository", "EntryRepository"]
