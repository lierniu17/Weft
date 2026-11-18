"""Postgres: the tenant's own preferences row (graph-viz AC-18)."""

from __future__ import annotations

from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.ext.asyncio import AsyncSession

from weft.domain.preferences import DEFAULT_PREFERENCES, GraphTheme, Preferences
from weft.domain.tenancy import TenantContext, tenant_scoped
from weft.models.tables import UserPreferences


class PreferencesRepository:
    def __init__(self, session: AsyncSession, tenant: TenantContext) -> None:
        self._s = session
        self.tenant = tenant

    @tenant_scoped
    async def get(self) -> Preferences:
        theme = await self._s.scalar(
            select(UserPreferences.graph_theme).where(
                UserPreferences.user_id == self.tenant.user_id
            )
        )
        return DEFAULT_PREFERENCES if theme is None else Preferences(GraphTheme(theme))

    @tenant_scoped
    async def set_graph_theme(self, theme: GraphTheme) -> Preferences:
        stmt = insert(UserPreferences).values(user_id=self.tenant.user_id, graph_theme=theme.value)
        stmt = stmt.on_conflict_do_update(
            index_elements=[UserPreferences.user_id],
            set_={"graph_theme": theme.value, "updated_at": stmt.excluded.updated_at},
        )
        await self._s.execute(stmt)
        return Preferences(theme)


__all__ = ["PreferencesRepository"]
