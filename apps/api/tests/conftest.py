"""Shared fixtures for service and route tests (real Postgres + Neo4j from docker compose).

Isolation:
* Postgres — every test session creates its own throwaway database, migrates it with
  Alembic, and drops it at the end; every test truncates all tables afterwards.
* Neo4j — the community edition has one database, so tests are isolated by tenant: every
  user gets a fresh ``group_id`` and each test deletes the groups it created.
* LLM — ``tests/support/llm_script.py``: hand-authored responses through the replay
  transport, never the network.
"""

from __future__ import annotations

import asyncio
import os
import secrets
import uuid
from collections.abc import AsyncIterator, Iterator
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta

import asyncpg
import httpx
import pytest
from pydantic import SecretStr
from sqlalchemy import make_url, text

from tests import PRE_IMPORT_ENV
from tests.support.llm_script import LLMScript, ScriptGate
from weft.db import migrate
from weft.domain.tenancy import TenantContext, group_id_for_user
from weft.infra import Infra, build_infra, create_neo4j_driver
from weft.repositories.graph_schema import ensure_graph_schema
from weft.settings import API_DIR, Settings


def _forget_local_env_file() -> None:
    """Never let the developer's apps/api/.env (real API keys, database) into a test run.

    graphiti_core calls python-dotenv's ``load_dotenv()`` when imported, copying that file
    into ``os.environ``; drop whatever it added after ``tests/__init__.py`` took its snapshot.
    """
    import graphiti_core.driver.driver
    import graphiti_core.graphiti
    import graphiti_core.helpers  # noqa: F401  (each of these calls load_dotenv())
    from dotenv import dotenv_values

    for key in dotenv_values(API_DIR / ".env"):
        if key not in PRE_IMPORT_ENV:
            os.environ.pop(key, None)
    Settings.model_config["env_file"] = None  # Settings() in a test reads only the environment


_forget_local_env_file()

# 2026-11-16 12:00 Beijing time — the date the spec's examples use.
DEFAULT_NOW = datetime(2026, 11, 16, 4, 0, tzinfo=UTC)
TABLES = "users, invite_codes, sessions, entries, drafts, custom_subtypes, usage_counters"

CREATED_GROUPS: set[str] = set()


def track_user(user_id: uuid.UUID | str) -> TenantContext:
    """Remember a user's graph group so the test deletes it afterwards."""
    tenant = TenantContext.for_user(user_id)
    CREATED_GROUPS.add(tenant.group_id)
    return tenant


class FakeClock:
    def __init__(self, now: datetime = DEFAULT_NOW) -> None:
        self.now = now

    def __call__(self) -> datetime:
        return self.now

    def advance(self, **kwargs: float) -> None:
        self.now = self.now + timedelta(**kwargs)


def _base_settings() -> Settings:
    """Defaults plus the environment (DATABASE_URL, NEO4J_*), never apps/api/.env."""
    return Settings(_env_file=None)


async def _admin(sql: str, base_url: str) -> None:
    url = make_url(base_url)
    conn = await asyncpg.connect(
        user=url.username,
        password=url.password,
        host=url.host,
        port=url.port,
        database=url.database,
    )
    try:
        await conn.execute(sql)
    finally:
        await conn.close()


@pytest.fixture(scope="session")
def database_url() -> Iterator[str]:
    base = _base_settings().database_url
    name = f"weft_test_{os.getpid()}_{secrets.token_hex(3)}"
    asyncio.run(_admin(f'CREATE DATABASE "{name}"', base))
    url = make_url(base).set(database=name).render_as_string(hide_password=False)
    try:
        migrate(url)
        yield url
    finally:
        asyncio.run(_admin(f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)', base))


@pytest.fixture(scope="session")
def graph_schema() -> None:
    async def run() -> None:
        driver = create_neo4j_driver(_base_settings())
        try:
            await ensure_graph_schema(driver)
        finally:
            await driver.close()

    asyncio.run(run())


@pytest.fixture
def settings(database_url: str, graph_schema: None) -> Settings:
    # 64-dimensional fake embeddings (tests/support/llm_script.py) keep vectors cheap to
    # move through the Python Neo4j driver; production uses text-embedding-v4's 1024.
    return _base_settings().model_copy(
        update={
            "database_url": database_url,
            "deepseek_api_key": SecretStr("sk-test"),
            "embedding_dimensions": 64,
        }
    )


@pytest.fixture
def clock() -> FakeClock:
    return FakeClock()


@pytest.fixture
def llm() -> LLMScript:
    return LLMScript()


async def _cleanup(infra: Infra) -> None:
    async with infra.sql() as session:
        user_ids = (await session.execute(text("SELECT id FROM users"))).scalars().all()
    groups = {group_id_for_user(u) for u in user_ids} | CREATED_GROUPS
    if groups:
        async with infra.neo4j.session() as neo:
            await neo.run(
                "MATCH (n) WHERE n.group_id IN $groups DETACH DELETE n", groups=sorted(groups)
            )
    async with infra.sql.begin() as session:
        await session.execute(text(f"TRUNCATE {TABLES} CASCADE"))
    CREATED_GROUPS.clear()


@pytest.fixture
async def infra(settings: Settings, clock: FakeClock, llm: LLMScript) -> AsyncIterator[Infra]:
    http = httpx.AsyncClient(transport=ScriptGate(llm), timeout=settings.llm_timeout_seconds)
    built = build_infra(settings, http=http, clock=clock)
    try:
        yield built
    finally:
        try:
            await _cleanup(built)
        finally:
            await built.aclose()


@dataclass(frozen=True)
class TestUser:
    id: uuid.UUID
    username: str
    password: str
    display_name: str
    token: str
    tenant: TenantContext


__all__ = ["DEFAULT_NOW", "FakeClock", "TestUser", "track_user"]
