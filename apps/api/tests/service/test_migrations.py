"""Migrations 0003 (intent routing: existing Entries become 'record' messages) and 0004
(intent clarify: the 反问 columns, nothing else).

Migrates a throwaway database to 0002, writes Entries the old way, then upgrades: every
Entry the user wrote becomes a message — same text, same time, linked to the Entry, never
re-recognized — and manual profile edits do not (spec 「不在范围内」, ADR 0005). 0004 leaves
those messages exactly as they were and can be rolled back.
"""

from __future__ import annotations

import asyncio
import secrets
import uuid
from datetime import UTC, datetime
from typing import Any

import asyncpg
import pytest
from sqlalchemy import make_url

from tests.conftest import _admin, _base_settings
from weft.db import migrate

pytestmark = pytest.mark.service

T1 = datetime(2026, 10, 1, 2, 0, tzinfo=UTC)
T2 = datetime(2026, 11, 2, 9, 30, tzinfo=UTC)


async def _connect(url: str) -> asyncpg.Connection:
    u = make_url(url)
    return await asyncpg.connect(
        user=u.username, password=u.password, host=u.host, port=u.port, database=u.database
    )


async def _seed_old_schema(url: str) -> dict[str, uuid.UUID]:
    conn = await _connect(url)
    ids = {k: uuid.uuid4() for k in ("user", "other", "e1", "e2", "edit", "e3")}
    try:
        for user in ("user", "other"):
            await conn.execute(
                "INSERT INTO users (id, username, password_hash, display_name) "
                "VALUES ($1, $2, 'x', '小明')",
                ids[user],
                f"u_{secrets.token_hex(4)}",
            )
        rows: list[tuple[str, str, str, str, datetime]] = [
            ("e1", "user", "2015 年读大学时认识了小李", "2015", T1),
            ("e2", "user", "今天和老张吃饭", "2026-11-02", T2),
            ("edit", "user", "(手动编辑)", "2026-11-02", T2),
            ("e3", "other", "老周请喝咖啡", "2026-11-02", T2),
        ]
        for key, owner, text, occurred, created in rows:
            await conn.execute(
                "INSERT INTO entries (id, user_id, text, occurred_on, occurred_precision, kind, "
                "created_at) VALUES ($1, $2, $3, $4, $5, $6, $7)",
                ids[key],
                ids[owner],
                text,
                occurred,
                {4: "year", 7: "month", 10: "day"}[len(occurred)],
                "manual_edit" if key == "edit" else "user",
                created,
            )
    finally:
        await conn.close()
    return ids


async def _messages(url: str) -> list[dict[str, Any]]:
    conn = await _connect(url)
    try:
        rows = await conn.fetch("SELECT * FROM messages ORDER BY created_at, text")
    finally:
        await conn.close()
    return [dict(r) for r in rows]


async def _tables(url: str) -> set[str]:
    conn = await _connect(url)
    try:
        rows = await conn.fetch("SELECT tablename FROM pg_tables WHERE schemaname = 'public'")
    finally:
        await conn.close()
    return {r["tablename"] for r in rows}


@pytest.fixture
def fresh_database() -> Any:
    base = _base_settings().database_url
    name = f"weft_migration_{secrets.token_hex(4)}"
    asyncio.run(_admin(f'CREATE DATABASE "{name}"', base))
    try:
        yield make_url(base).set(database=name).render_as_string(hide_password=False)
    finally:
        asyncio.run(_admin(f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)', base))


def test_existing_entries_become_record_messages_without_recognition(fresh_database: str) -> None:
    migrate(fresh_database, revision="0002")
    ids = asyncio.run(_seed_old_schema(fresh_database))

    migrate(fresh_database)

    messages = asyncio.run(_messages(fresh_database))
    assert [(m["user_id"], m["entry_id"], m["text"]) for m in messages] == [
        (ids["user"], ids["e1"], "2015 年读大学时认识了小李"),
        (ids["user"], ids["e2"], "今天和老张吃饭"),
        (ids["other"], ids["e3"], "老周请喝咖啡"),
    ]
    for m in messages:
        assert (m["intent"], m["recognized_intent"], m["confidence"]) == ("record", None, None)
        assert m["uncertain"] is False and m["answer"] is None and m["reply"] is None
        assert m["created_at"] in (T1, T2)
    assert messages[0]["created_at"] == T1


def test_the_migration_can_be_rolled_back(fresh_database: str) -> None:
    migrate(fresh_database)
    assert "messages" in asyncio.run(_tables(fresh_database))

    from alembic import command
    from alembic.config import Config

    from weft.settings import API_DIR

    config = Config(str(API_DIR / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", fresh_database)
    command.downgrade(config, "0002")
    assert "messages" not in asyncio.run(_tables(fresh_database))


async def _columns(url: str) -> set[str]:
    conn = await _connect(url)
    try:
        rows = await conn.fetch(
            "SELECT column_name FROM information_schema.columns WHERE table_name = 'messages'"
        )
    finally:
        await conn.close()
    return {r["column_name"] for r in rows}


CLARIFY_COLUMNS = {"clarify_json", "clarification_of", "clarification_resolved_at"}


def test_migration_0004_only_adds_the_clarification_columns(fresh_database: str) -> None:
    migrate(fresh_database, revision="0002")
    asyncio.run(_seed_old_schema(fresh_database))
    migrate(fresh_database, revision="0003")
    before = asyncio.run(_messages(fresh_database))

    migrate(fresh_database, revision="0004")

    after = asyncio.run(_messages(fresh_database))
    assert [{k: v for k, v in m.items() if k not in CLARIFY_COLUMNS} for m in after] == before
    assert all(m[c] is None for m in after for c in CLARIFY_COLUMNS)

    from alembic import command
    from alembic.config import Config

    from weft.settings import API_DIR

    config = Config(str(API_DIR / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", fresh_database)
    command.downgrade(config, "0003")
    assert not asyncio.run(_columns(fresh_database)) & CLARIFY_COLUMNS
    assert len(asyncio.run(_messages(fresh_database))) == len(before)


def test_migration_0005_only_adds_the_history_column(fresh_database: str) -> None:
    """上文 (conversation-context): 0005 adds history_used_of and changes no message."""
    migrate(fresh_database, revision="0002")
    asyncio.run(_seed_old_schema(fresh_database))
    migrate(fresh_database, revision="0004")
    before = asyncio.run(_messages(fresh_database))

    migrate(fresh_database)

    after = asyncio.run(_messages(fresh_database))
    assert [{k: v for k, v in m.items() if k != "history_used_of"} for m in after] == before
    assert all(m["history_used_of"] is None for m in after)

    from alembic import command
    from alembic.config import Config

    from weft.settings import API_DIR

    config = Config(str(API_DIR / "alembic.ini"))
    config.set_main_option("sqlalchemy.url", fresh_database)
    command.downgrade(config, "0004")
    assert "history_used_of" not in asyncio.run(_columns(fresh_database))
    assert len(asyncio.run(_messages(fresh_database))) == len(before)
