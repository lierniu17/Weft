"""The e2e:bot backend: the real Weft API, pinned for repeatable runs.

Run with the API's own environment (never edits apps/api)::

    uv run --project apps/api python tests/e2e/server/weft_e2e.py <command>

Commands
    serve --port P        the FastAPI app under uvicorn
    db-reset              drop + recreate the e2e Postgres database (migrations run separately)
    invites N             print N invite codes
    seed LOGIN            write the seed graph (BOT-5 / BOT-9) into LOGIN's graph

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
from datetime import UTC, datetime
from pathlib import Path

import httpx

HERE = Path(__file__).resolve().parent
FIXTURES = HERE.parent / "fixtures" / "llm"
FROZEN_START = datetime(2026, 11, 16, 2, 0, tzinfo=UTC)  # 10:00 Beijing
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


async def _seed(login: str) -> int:
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
            result = await seed.seed_graph(built)
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
    sub.add_parser("seed").add_argument("login")
    args = parser.parse_args()
    if args.command == "serve":
        return _serve(args.port)
    if args.command == "db-reset":
        return asyncio.run(_db_reset())
    if args.command == "invites":
        return asyncio.run(_invites(args.count))
    return asyncio.run(_seed(args.login))


if __name__ == "__main__":
    sys.exit(main())
