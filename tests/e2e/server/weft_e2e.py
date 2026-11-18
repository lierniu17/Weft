"""The e2e:bot backend: the real Weft API, pinned for repeatable runs.

Run with the API's own environment (never edits apps/api)::

    uv run --project apps/api python tests/e2e/server/weft_e2e.py <command>

Commands
    serve --port P        the FastAPI app under uvicorn
    db-reset              drop + recreate the e2e Postgres database (migrations run separately)
    invites N             print N invite codes
    seed LOGIN [--size N] write the seed graph (BOT-5 / BOT-9) into LOGIN's graph; --size
                          grows it with generated persons to N (graph performance, e.g. 300)
    clean-graph [--orphans]
                          delete the graphs of the e2e database's users from Neo4j (Neo4j
                          is shared with the dev stack and pytest, and its fulltext
                          statistics are index-wide). --orphans also deletes leftovers of
                          earlier e2e runs whose users are gone: groups no Postgres database
                          on the server has a user for, written entirely on the e2e clock.

What is pinned
    * LLM traffic: replay only, from tests/e2e/fixtures/llm/ (LLM_FIXTURES_DIR). Provider
      keys are blanked and base URLs point at a closed local port, so nothing can reach a
      real model even if a fixture is missing (the call fails instead).
    * The clock: the day is always 2026-11-16 (Beijing), starting at 10:00 when the process
      starts, so dates in prompts (and so fixture keys) never drift.

Authoring fixtures (WEFT_E2E_AUTHOR=1): a missing fixture is answered by the hand-written
script in ``llm_script.py`` and saved; nothing is ever sent to a provider. ``pnpm e2e:bot``
never sets it.
"""

from __future__ import annotations

import argparse
import asyncio
import json
import os
import sys
from datetime import UTC, datetime, timedelta
from pathlib import Path

import httpx

HERE = Path(__file__).resolve().parent
FIXTURES = HERE.parent / "fixtures" / "llm"
FROZEN_START = datetime(2026, 11, 16, 2, 0, tzinfo=UTC)  # 10:00 Beijing
# How far the e2e clock can get in one run (it ticks in real time from FROZEN_START).
E2E_CLOCK_SPAN = timedelta(hours=2)
_STARTED = datetime.now(UTC)

# Never let a real key or a real provider anywhere near the e2e stack.
os.environ["DEEPSEEK_API_KEY"] = ""
os.environ["DASHSCOPE_API_KEY"] = ""
os.environ["DEEPSEEK_BASE_URL"] = "http://127.0.0.1:9"
os.environ["DASHSCOPE_BASE_URL"] = "http://127.0.0.1:9/compatible-mode/v1"
os.environ["LLM_REPLAY_MODE"] = "replay"
os.environ["LLM_FIXTURES_DIR"] = str(FIXTURES)
os.environ.setdefault("SESSION_SECRET", "weft-e2e-session-secret")
if "weft_e2e" not in os.environ.get("DATABASE_URL", ""):
    sys.exit("DATABASE_URL must point at the weft_e2e database")

from weft.domain.tenancy import TenantContext, tenant_scope  # noqa: E402
from weft.infra import Infra, build_infra  # noqa: E402
from weft.llm.replay import ReplayMode, ReplayTransport, fixture_key  # noqa: E402
from weft.settings import Settings  # noqa: E402


def clock() -> datetime:
    return FROZEN_START + (datetime.now(UTC) - _STARTED)


class AuthorTransport(httpx.AsyncBaseTransport):
    """Serves existing fixtures; writes missing ones from the hand-written script."""

    def __init__(self, fixtures: Path) -> None:
        from llm_script import respond  # only needed when authoring

        self._respond = respond
        self._fixtures = fixtures
        self._replay = ReplayTransport(ReplayMode.REPLAY, fixtures)

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        await request.aread()
        path = self._fixtures / f"{fixture_key(request)}.json"
        if not path.exists():
            body = json.loads(request.content)
            status, payload = self._respond(request.url.path, body)
            path.parent.mkdir(parents=True, exist_ok=True)
            record = {
                "request": {"method": request.method, "path": request.url.path, "body": body},
                "response": {
                    "status_code": status,
                    "content_type": "application/json",
                    "json": True,
                    "body": payload,
                },
            }
            path.write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding="utf-8")
        return await self._replay.handle_async_request(request)


def infra() -> Infra:
    settings = Settings()
    assert settings.llm_replay_mode is ReplayMode.REPLAY
    if os.environ.get("WEFT_E2E_AUTHOR") == "1":
        http = httpx.AsyncClient(
            transport=AuthorTransport(settings.llm_fixtures_dir),
            timeout=settings.llm_timeout_seconds,
        )
        return build_infra(settings, http=http, clock=clock)
    return build_infra(settings, clock=clock)


async def _db_reset() -> int:
    import asyncpg

    url = os.environ["DATABASE_URL"].replace("postgresql+asyncpg://", "postgresql://")
    admin_url, _, name = url.rpartition("/")
    conn = await asyncpg.connect(f"{admin_url}/postgres")
    try:
        await conn.execute(f'DROP DATABASE IF EXISTS "{name}" WITH (FORCE)')
        await conn.execute(f'CREATE DATABASE "{name}"')
    finally:
        await conn.close()
    print(f"reset database {name}")
    return 0


async def _invites(count: int) -> int:
    from weft.services import invites

    built = infra()
    try:
        for code in await invites.generate(built, count):
            print(code)
    finally:
        await built.aclose()
    return 0


def _pg_url(database: str | None = None) -> str:
    url = os.environ["DATABASE_URL"].replace("postgresql+asyncpg://", "postgresql://")
    return url if database is None else f"{url.rpartition('/')[0]}/{database}"


async def _user_groups(database: str) -> set[str] | None:
    """The graph groups of ``database``'s users; None if it has no Weft users table."""
    import asyncpg

    from weft.domain.tenancy import group_id_for_user

    try:
        conn = await asyncpg.connect(_pg_url(database))
    except asyncpg.InvalidCatalogNameError:
        return None
    try:
        rows = await conn.fetch("SELECT id FROM users")
    except asyncpg.UndefinedTableError:
        return None
    finally:
        await conn.close()
    return {group_id_for_user(r["id"]) for r in rows}


async def _orphan_e2e_groups() -> set[str]:
    """Groups left by earlier e2e runs (their weft_e2e database has been reset since).

    A group qualifies only if no database on the Postgres server (dev, e2e, live pytest
    sessions) has a user for it, and every node in it was written on the e2e clock: the
    e2e API's day starts at FROZEN_START (02:00 UTC), pytest's FakeClock at 04:00 UTC.
    """
    import asyncpg

    conn = await asyncpg.connect(_pg_url("postgres"))
    try:
        names = [
            r["datname"]
            for r in await conn.fetch("SELECT datname FROM pg_database WHERE NOT datistemplate")
        ]
    finally:
        await conn.close()
    owned: set[str] = set()
    for name in names:
        owned |= await _user_groups(name) or set()
    built = infra()
    try:
        async with built.neo4j.session() as neo:
            result = await neo.run(
                "MATCH (n) WHERE n.group_id IS NOT NULL"
                " WITH n.group_id AS g, min(n.created_at) AS first, max(n.created_at) AS last,"
                " count(n.created_at) AS dated, count(n) AS nodes"
                " WHERE dated = nodes AND first >= datetime($start) AND last < datetime($end)"
                " RETURN g",
                start=FROZEN_START.isoformat(),
                end=(FROZEN_START + E2E_CLOCK_SPAN).isoformat(),
            )
            candidates = {record["g"] async for record in result}
    finally:
        await built.aclose()
    return candidates - owned


async def _clean_graph(orphans: bool) -> int:
    groups = await _user_groups(_pg_url().rpartition("/")[2]) or set()
    from_users = len(groups)
    if orphans:
        groups |= await _orphan_e2e_groups()
    built = infra()
    try:
        async with built.neo4j.session() as neo:

            async def count() -> tuple[int, int]:
                result = await neo.run(
                    "MATCH (n) WHERE n.group_id IN $groups"
                    " RETURN count(DISTINCT n.group_id) AS g, count(n) AS n",
                    groups=sorted(groups),
                )
                record = await result.single()
                assert record is not None
                return record["g"], record["n"]

            found, nodes = await count()
            print(
                f"e2e graph cleanup: {found} groups, {nodes} nodes to delete"
                f" ({from_users} e2e users{', plus orphans of earlier runs' if orphans else ''})"
            )
            if nodes:
                await neo.run(
                    "MATCH (n) WHERE n.group_id IN $groups"
                    " CALL (n) { DETACH DELETE n } IN TRANSACTIONS OF 1000 ROWS",
                    groups=sorted(groups),
                )
            left_groups, left = await count()
    finally:
        await built.aclose()
    print(f"e2e graph cleanup: done, {left_groups} groups / {left} nodes left")
    return 0 if left == 0 else 1


async def _seed(login: str, size: int | None = None) -> int:
    from weft.repositories.accounts import UserRepository
    from weft.services import seed
    from weft.services.results import Err

    built = infra()
    try:
        async with built.sql() as session:
            found = await UserRepository(session).get_by_username(login)
        if found is None:
            print(f"no such user: {login}", file=sys.stderr)
            return 1
        with tenant_scope(TenantContext.for_user(found[0].id)):
            result = await seed.seed_graph(built, size=size)
        if isinstance(result, Err):
            print(f"cannot seed: {result.message}", file=sys.stderr)
            return 1
        print(f"seeded {len(set(result.value.persons.values()))} persons")
        return 0
    finally:
        await built.aclose()


def _serve(port: int) -> int:
    import uvicorn

    from weft.main import create_app

    app = create_app(Settings(), infra=infra())
    uvicorn.run(app, host="127.0.0.1", port=port, log_level="warning")
    return 0


def main() -> int:
    parser = argparse.ArgumentParser(prog="weft_e2e")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("serve").add_argument("--port", type=int, required=True)
    sub.add_parser("db-reset")
    sub.add_parser("invites").add_argument("count", type=int)
    seed_cmd = sub.add_parser("seed")
    seed_cmd.add_argument("login")
    seed_cmd.add_argument("--size", type=int, default=None)
    sub.add_parser("clean-graph").add_argument("--orphans", action="store_true")
    args = parser.parse_args()
    if args.command == "serve":
        return _serve(args.port)
    if args.command == "db-reset":
        return asyncio.run(_db_reset())
    if args.command == "clean-graph":
        return asyncio.run(_clean_graph(args.orphans))
    if args.command == "invites":
        return asyncio.run(_invites(args.count))
    return asyncio.run(_seed(args.login, args.size))


if __name__ == "__main__":
    sys.exit(main())
