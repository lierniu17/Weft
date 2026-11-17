"""我的 → 图谱外观 (graph-viz AC-18): preferences saved to the account."""

from __future__ import annotations

from weft.domain.preferences import GraphTheme, Preferences
from weft.infra import Infra
from weft.repositories.preferences import PreferencesRepository
from weft.services._uow import tenant


async def get_preferences(infra: Infra) -> Preferences:
    async with infra.sql() as session:
        return await PreferencesRepository(session, tenant()).get()


async def update_preferences(infra: Infra, *, graph_theme: GraphTheme | None = None) -> Preferences:
    """Change what is given; the rest stays."""
    async with infra.sql() as session, session.begin():
        repo = PreferencesRepository(session, tenant())
        if graph_theme is None:
            return await repo.get()
        return await repo.set_graph_theme(graph_theme)


__all__ = ["get_preferences", "update_preferences"]
