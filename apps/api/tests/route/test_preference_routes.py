"""GET / PATCH /api/me/preferences (graph-viz AC-18): 图谱外观 清蓝 / 星空, kept across logins."""

from __future__ import annotations

import httpx
import pytest

from tests.route.conftest import Register

pytestmark = pytest.mark.route

URL = "/api/me/preferences"


async def test_the_graph_theme_defaults_to_light_and_survives_a_new_login(
    register: Register,
) -> None:
    user = await register()
    assert (await user.client.get(URL)).json() == {"graph_theme": "light"}

    patched = await user.client.patch(URL, json={"graph_theme": "starfield"})
    assert patched.status_code == 200 and patched.json() == {"graph_theme": "starfield"}

    assert (await user.client.post("/api/auth/logout")).status_code == 204
    assert (await user.client.get(URL)).status_code == 401
    login = await user.client.post(
        "/api/auth/login", json={"username": user.username, "password": user.password}
    )
    assert login.status_code == 200
    assert (await user.client.get(URL)).json() == {"graph_theme": "starfield"}


async def test_an_empty_patch_changes_nothing(register: Register) -> None:
    user = await register()
    await user.client.patch(URL, json={"graph_theme": "starfield"})
    response = await user.client.patch(URL, json={})
    assert response.status_code == 200 and response.json() == {"graph_theme": "starfield"}


@pytest.mark.parametrize(
    "body",
    [
        {"graph_theme": "dark"},
        {"graph_theme": None},
        {"graph_theme": "light", "user_id": "00000000-0000-0000-0000-000000000000"},
    ],
)
async def test_unknown_themes_and_fields_are_refused(register: Register, body: object) -> None:
    user = await register()
    response = await user.client.patch(URL, json=body)
    assert response.status_code == 422 and response.json()["error"] == "validation_error"
    assert (await user.client.get(URL)).json() == {"graph_theme": "light"}


async def test_preferences_need_a_login(anonymous: httpx.AsyncClient) -> None:
    assert (await anonymous.get(URL)).status_code == 401
    assert (await anonymous.patch(URL, json={"graph_theme": "starfield"})).status_code == 401
