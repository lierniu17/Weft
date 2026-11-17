"""Record / replay of LLM HTTP traffic (spec 「测试决策」: the service layer replays LLM calls).

``ReplayTransport`` is an ``httpx`` transport, so it sits under *any* client that takes an
``httpx.AsyncClient`` — our ``OpenAICompatibleClient`` and the openai SDK that Graphiti
uses internally alike.

* ``record`` — call the real provider and save ``request-hash -> response`` fixtures.
* ``replay`` — serve fixtures only; a missing fixture raises ``MissingFixtureError``.
* ``off``    — pass straight through.

The hash covers method, URL path and the canonicalized JSON body. Host, query string and
headers (including credentials) are excluded and never written to disk.
"""

from __future__ import annotations

import hashlib
import json
from enum import StrEnum
from pathlib import Path
from typing import Any

import httpx


class ReplayMode(StrEnum):
    RECORD = "record"
    REPLAY = "replay"
    OFF = "off"


class MissingFixtureError(LookupError):
    def __init__(self, key: str, path: Path, summary: str) -> None:
        super().__init__(
            f"no LLM fixture {key} at {path} for {summary}; "
            "run the test once with LLM_REPLAY_MODE=record (needs real API keys) to create it"
        )
        self.key = key
        self.path = path


def _body_of(request: httpx.Request) -> Any:
    raw = request.content
    if not raw:
        return None
    try:
        return json.loads(raw)
    except ValueError:
        return raw.decode("utf-8", errors="replace")


def fixture_key(request: httpx.Request) -> str:
    canonical = json.dumps(
        {"method": request.method, "path": request.url.path, "body": _body_of(request)},
        sort_keys=True,
        ensure_ascii=False,
        separators=(",", ":"),
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _summary(request: httpx.Request) -> str:
    return f"{request.method} {request.url.path}"


class ReplayTransport(httpx.AsyncBaseTransport):
    def __init__(
        self,
        mode: ReplayMode,
        fixtures_dir: Path,
        *,
        inner: httpx.AsyncBaseTransport | None = None,
    ) -> None:
        self.mode = ReplayMode(mode)
        self.fixtures_dir = Path(fixtures_dir)
        self._inner = inner or httpx.AsyncHTTPTransport()

    def _path(self, key: str) -> Path:
        return self.fixtures_dir / f"{key}.json"

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        await request.aread()
        if self.mode is ReplayMode.OFF:
            return await self._inner.handle_async_request(request)

        key = fixture_key(request)
        path = self._path(key)

        if self.mode is ReplayMode.REPLAY:
            if not path.exists():
                raise MissingFixtureError(key, path, _summary(request))
            saved = json.loads(path.read_text(encoding="utf-8"))["response"]
            body = saved["body"]
            content = (
                json.dumps(body, ensure_ascii=False).encode("utf-8")
                if saved.get("json", True)
                else str(body).encode("utf-8")
            )
            return httpx.Response(
                saved["status_code"],
                headers={"content-type": saved.get("content_type", "application/json")},
                content=content,
                request=request,
            )

        # RECORD
        response = await self._inner.handle_async_request(request)
        raw = await response.aread()
        await response.aclose()
        if response.status_code < 400:
            self._save(path, request, response, raw)
        return httpx.Response(
            response.status_code,
            headers={"content-type": response.headers.get("content-type", "application/json")},
            content=raw,
            request=request,
        )

    def _save(
        self, path: Path, request: httpx.Request, response: httpx.Response, raw: bytes
    ) -> None:
        try:
            body: Any = json.loads(raw)
            is_json = True
        except ValueError:
            body, is_json = raw.decode("utf-8", errors="replace"), False
        path.parent.mkdir(parents=True, exist_ok=True)
        record = {
            "request": {
                "method": request.method,
                "path": request.url.path,
                "body": _body_of(request),
            },
            "response": {
                "status_code": response.status_code,
                "content_type": response.headers.get("content-type", "application/json"),
                "json": is_json,
                "body": body,
            },
        }
        path.write_text(json.dumps(record, ensure_ascii=False, indent=2), encoding="utf-8")

    async def aclose(self) -> None:
        await self._inner.aclose()
