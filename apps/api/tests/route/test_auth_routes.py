"""Auth routes: registration, cookie session, login errors, logout, account deletion
(AC-1, AC-2, AC-3, AC-5) over HTTP."""

from __future__ import annotations

import uuid

import httpx
import pytest

from tests.conftest import track_user
from tests.route.conftest import PASSWORD, Register
from weft.infra import Infra
from weft.main import PUBLIC_ROUTES
from weft.services import invites

pytestmark = pytest.mark.route


async def test_register_sets_an_http_only_session_cookie_and_returns_self(
    infra: Infra, anonymous: httpx.AsyncClient
) -> None:
    [code] = await invites.generate(infra, 1)
    response = await anonymous.post(
        "/api/auth/register",
        json={
            "invite_code": code,
            "username": "xiaoming",
            "password": PASSWORD,
            "display_name": "小明",
        },
    )
    assert response.status_code == 201
    cookie = response.headers["set-cookie"]
    assert cookie.startswith(f"{infra.settings.session_cookie_name}=")
    assert "HttpOnly" in cookie and "SameSite=lax" in cookie
    body = response.json()
    track_user(body["id"])
    assert body["username"] == "xiaoming" and body["display_name"] == "小明"

    people = (await anonymous.get("/api/persons")).json()
    assert people == [
        {"id": body["self_person_id"], "name": "小明", "aliases": [], "is_self": True, "note": None}
    ]


@pytest.mark.parametrize(
    ("setup", "error"),
    [("unknown", "invite_invalid"), ("revoked", "invite_revoked"), ("used", "invite_used")],
)
async def test_register_refuses_bad_invites_with_their_reason(
    infra: Infra, anonymous: httpx.AsyncClient, register: Register, setup: str, error: str
) -> None:
    code = "NOSUCHCODE"
    if setup == "revoked":
        [code] = await invites.generate(infra, 1)
        await invites.revoke(infra, code)
    if setup == "used":
        await register()
        [code] = [i.code for i in await invites.list_all(infra) if i.status == "used"]
    response = await anonymous.post(
        "/api/auth/register",
        json={
            "invite_code": code,
            "username": "newbie",
            "password": PASSWORD,
            "display_name": "新人",
        },
    )
    assert response.status_code == 400
    assert response.json()["error"] == error
    assert response.json()["message"]
    assert "set-cookie" not in response.headers


async def test_register_validates_its_body(anonymous: httpx.AsyncClient) -> None:
    response = await anonymous.post(
        "/api/auth/register",
        json={"invite_code": "X", "username": "a", "password": "short", "display_name": " "},
    )
    assert response.status_code == 422
    body = response.json()
    assert body["error"] == "validation_error"
    assert {tuple(f["loc"])[-1] for f in body["fields"]} >= {"username", "password", "display_name"}


async def test_wrong_password_and_unknown_account_get_the_same_401(
    anonymous: httpx.AsyncClient, register: Register
) -> None:
    user = await register()
    wrong = await anonymous.post(
        "/api/auth/login", json={"username": user.username, "password": "wrong password"}
    )
    unknown = await anonymous.post(
        "/api/auth/login", json={"username": "nobody_at_all", "password": "wrong password"}
    )
    assert wrong.status_code == unknown.status_code == 401
    assert (
        wrong.json()
        == unknown.json()
        == {"error": "invalid_credentials", "message": "账号或密码错误"}
    )


async def test_login_gives_access_and_logout_takes_it_away(
    anonymous: httpx.AsyncClient, register: Register
) -> None:
    user = await register()
    login = await anonymous.post(
        "/api/auth/login", json={"username": user.username, "password": user.password}
    )
    assert login.status_code == 200
    assert (await anonymous.get("/api/auth/me")).json()["id"] == str(user.id)

    assert (await anonymous.post("/api/auth/logout")).status_code == 204
    anonymous.cookies.clear()  # what the browser does with the expired cookie
    for path in ("/api/auth/me", "/api/entries", "/api/persons"):
        response = await anonymous.get(path)
        assert response.status_code == 401
        assert response.json()["error"] == "unauthenticated"


async def test_a_logged_out_token_is_refused_even_if_replayed(register: Register) -> None:
    user = await register()
    cookie = "; ".join(f"{k}={v}" for k, v in user.client.cookies.items())
    assert (await user.client.post("/api/auth/logout")).status_code == 204
    replay = await user.client.get("/api/entries", headers={"cookie": cookie})
    assert replay.status_code == 401


async def test_every_non_public_route_requires_a_session(
    anonymous: httpx.AsyncClient,
) -> None:
    spec = (await anonymous.get("/openapi.json")).json()
    routes = [(method.upper(), path) for path, ops in spec["paths"].items() for method in ops]
    assert len(routes) > len(PUBLIC_ROUTES)
    for method, path in routes:
        if (method, path) in PUBLIC_ROUTES:
            continue
        url = path
        while "{" in url:
            start, end = url.index("{"), url.index("}")
            url = url[:start] + str(uuid.uuid4()) + url[end + 1 :]
        response = await anonymous.request(method, url, json={})
        assert response.status_code == 401, (method, path, response.text)
        assert response.json()["error"] == "unauthenticated"


async def test_deleting_the_account_needs_the_password_and_ends_access(
    anonymous: httpx.AsyncClient, register: Register
) -> None:
    user = await register()
    wrong = await user.client.request("DELETE", "/api/account", json={"password": "nope nope"})
    assert wrong.status_code == 403 and wrong.json()["error"] == "wrong_password"

    deleted = await user.client.request("DELETE", "/api/account", json={"password": user.password})
    assert deleted.status_code == 204
    login = await anonymous.post(
        "/api/auth/login", json={"username": user.username, "password": user.password}
    )
    assert login.status_code == 401
