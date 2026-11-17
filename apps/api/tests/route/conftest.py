"""Route-test fixtures: the real app over HTTP (httpx + ASGI), one cookie jar per user."""

from __future__ import annotations

import secrets
import uuid
from collections.abc import AsyncIterator, Awaitable, Callable
from dataclasses import dataclass

import httpx
import pytest
from fastapi import FastAPI

from tests.conftest import TestUser, track_user
from weft.infra import Infra
from weft.main import create_app
from weft.services import invites

PASSWORD = "correct horse battery"


@dataclass
class ApiUser:
    client: httpx.AsyncClient
    id: uuid.UUID
    username: str
    password: str
    self_person_id: str


def as_test_user(user: ApiUser) -> TestUser:
    """The same account as a service-level ``TestUser`` (to arrange its graph)."""
    return TestUser(
        id=user.id,
        username=user.username,
        password=user.password,
        display_name="",
        token="",
        tenant=track_user(user.id),
    )


@pytest.fixture
def app(infra: Infra) -> FastAPI:
    return create_app(infra.settings, infra=infra)


@pytest.fixture
async def anonymous(app: FastAPI) -> AsyncIterator[httpx.AsyncClient]:
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=app), base_url="http://weft.test"
    ) as client:
        yield client


Register = Callable[..., Awaitable[ApiUser]]


@pytest.fixture
async def register(app: FastAPI, infra: Infra) -> AsyncIterator[Register]:
    clients: list[httpx.AsyncClient] = []

    async def _register(display_name: str = "小明") -> ApiUser:
        [code] = await invites.generate(infra, 1)
        client = httpx.AsyncClient(
            transport=httpx.ASGITransport(app=app), base_url="http://weft.test"
        )
        clients.append(client)
        username = f"u_{secrets.token_hex(4)}"
        response = await client.post(
            "/api/auth/register",
            json={
                "invite_code": code,
                "username": username,
                "password": PASSWORD,
                "display_name": display_name,
            },
        )
        assert response.status_code == 201, response.text
        body = response.json()
        track_user(body["id"])
        return ApiUser(
            client=client,
            id=uuid.UUID(body["id"]),
            username=username,
            password=PASSWORD,
            self_person_id=body["self_person_id"],
        )

    yield _register
    for client in clients:
        await client.aclose()


__all__ = ["PASSWORD", "ApiUser", "Register", "as_test_user"]
