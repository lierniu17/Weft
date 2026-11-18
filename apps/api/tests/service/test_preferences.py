"""User preferences (graph-viz AC-18): the graph theme is kept per account, default 清蓝."""

from __future__ import annotations

import pytest
from sqlalchemy import text

from tests.support.users import new_user
from weft.domain.preferences import GraphTheme, Preferences
from weft.domain.tenancy import tenant_scope
from weft.infra import Infra
from weft.services import accounts, preferences

pytestmark = pytest.mark.service


async def test_a_new_account_has_the_light_graph_theme(infra: Infra) -> None:
    user = await new_user(infra)
    with tenant_scope(user.tenant):
        assert await preferences.get_preferences(infra) == Preferences(GraphTheme.LIGHT)


async def test_the_graph_theme_is_saved_to_the_account(infra: Infra) -> None:
    user = await new_user(infra)
    with tenant_scope(user.tenant):
        saved = await preferences.update_preferences(infra, graph_theme=GraphTheme.STARFIELD)
        assert saved == Preferences(GraphTheme.STARFIELD)
        assert await preferences.get_preferences(infra) == saved
        # nothing to change: unchanged
        assert await preferences.update_preferences(infra) == saved
        back = await preferences.update_preferences(infra, graph_theme=GraphTheme.LIGHT)
    assert back.graph_theme is GraphTheme.LIGHT


async def test_preferences_are_per_user(infra: Infra) -> None:
    a, b = await new_user(infra), await new_user(infra)
    with tenant_scope(a.tenant):
        await preferences.update_preferences(infra, graph_theme=GraphTheme.STARFIELD)
    with tenant_scope(b.tenant):
        assert (await preferences.get_preferences(infra)).graph_theme is GraphTheme.LIGHT
        await preferences.update_preferences(infra, graph_theme=GraphTheme.LIGHT)
    with tenant_scope(a.tenant):
        assert (await preferences.get_preferences(infra)).graph_theme is GraphTheme.STARFIELD


async def test_preferences_go_with_the_account(infra: Infra) -> None:
    user = await new_user(infra)
    with tenant_scope(user.tenant):
        await preferences.update_preferences(infra, graph_theme=GraphTheme.STARFIELD)
        await accounts.delete_account(infra, password=user.password)
    async with infra.sql() as session:
        rows = await session.scalar(
            text("SELECT count(*) FROM user_preferences WHERE user_id = :id"), {"id": user.id}
        )
    assert rows == 0


async def test_the_database_refuses_an_unknown_theme(infra: Infra) -> None:
    user = await new_user(infra)
    async with infra.sql.begin() as session:
        with pytest.raises(Exception, match="graph_theme"):
            await session.execute(
                text("INSERT INTO user_preferences (user_id, graph_theme) VALUES (:id, 'dark')"),
                {"id": user.id},
            )
