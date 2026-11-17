"""Postgres: custom Relationship Type subtypes and daily usage counters (tenant-scoped)."""

from __future__ import annotations

from datetime import date

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from weft.domain.quota import QuotaKind
from weft.domain.taxonomy import Category, CustomSubtype
from weft.domain.tenancy import TenantContext, tenant_scoped
from weft.models.tables import CustomSubtype as CustomSubtypeRow
from weft.models.tables import UsageCounter


class CustomSubtypeRepository:
    def __init__(self, session: AsyncSession, tenant: TenantContext) -> None:
        self._s = session
        self.tenant = tenant

    @tenant_scoped
    async def list_all(self) -> list[CustomSubtype]:
        rows = await self._s.scalars(
            select(CustomSubtypeRow)
            .where(CustomSubtypeRow.user_id == self.tenant.user_id)
            .order_by(CustomSubtypeRow.created_at, CustomSubtypeRow.name)
        )
        return [CustomSubtype(Category(r.category), r.name) for r in rows.all()]

    @tenant_scoped
    async def add(self, subtype: CustomSubtype) -> bool:
        """False if this user already has a subtype of that name."""
        added = await self._s.scalar(
            insert(CustomSubtypeRow)
            .values(user_id=self.tenant.user_id, category=subtype.category.value, name=subtype.name)
            .on_conflict_do_nothing(constraint="custom_subtype_unique_per_user")
            .returning(CustomSubtypeRow.id)
        )
        return added is not None


class UsageRepository:
    def __init__(self, session: AsyncSession, tenant: TenantContext) -> None:
        self._s = session
        self.tenant = tenant

    @tenant_scoped
    async def count(self, kind: QuotaKind, day: date) -> int:
        value = await self._s.scalar(
            select(UsageCounter.count).where(
                UsageCounter.user_id == self.tenant.user_id,
                UsageCounter.kind == kind.value,
                UsageCounter.day == day,
            )
        )
        return value or 0

    @tenant_scoped
    async def increment_if_below(self, kind: QuotaKind, day: date, *, limit: int) -> bool:
        """Count one more use unless ``limit`` is reached, in a single statement (AC-40)."""
        if limit <= 0:
            return False
        stmt = insert(UsageCounter).values(
            user_id=self.tenant.user_id, kind=kind.value, day=day, count=1
        )
        stmt = stmt.on_conflict_do_update(
            index_elements=[UsageCounter.user_id, UsageCounter.kind, UsageCounter.day],
            set_={"count": UsageCounter.count + 1},
            where=UsageCounter.count < limit,
        )
        result = await self._s.scalar(stmt.returning(UsageCounter.count))
        return result is not None


__all__ = ["CustomSubtypeRepository", "UsageRepository"]
