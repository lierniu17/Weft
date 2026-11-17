"""Hand-authored LLM responses, served through the real replay transport.

Every test that reaches the LLM declares its responses with ``LLMScript`` rules (what an
honest DeepSeek answer to that request looks like). The HTTP stack under test is::

    ScriptGate  ->  ReplayTransport(REPLAY, tests/fixtures/llm)

* ``ScriptGate`` refuses any request no rule matches, raises ``httpx.ReadTimeout`` for
  ``timeout`` rules (a timeout cannot be recorded), and checks that the replayed fixture is
  exactly the scripted response — so a hand-edited rule can never silently disagree with
  a stale fixture file.
* Fixture files are keyed by the request hash (``weft.llm.replay``). To (re)author them run
  ``WEFT_AUTHOR_LLM_FIXTURES=1 uv run pytest ...``: the gate then puts the transport in
  RECORD mode with the script as the "provider", which writes the fixture files. No test
  ever reaches the network.
"""

from __future__ import annotations

import json
import os
from collections.abc import Callable
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

import httpx

from weft.extraction.pipeline import ENTITY_TYPE_NAMES
from weft.llm import ReplayMode, ReplayTransport

FIXTURES_DIR = Path(__file__).resolve().parents[1] / "fixtures" / "llm"
AUTHOR_MODE = os.environ.get("WEFT_AUTHOR_LLM_FIXTURES") == "1"

Matcher = Callable[[dict[str, Any]], bool]


def chat_completion(content: str) -> dict[str, Any]:
    """A DeepSeek chat completion as the API returns it."""
    return {
        "id": "chatcmpl-weft-fixture",
        "object": "chat.completion",
        "created": 1763251200,
        "model": "deepseek-chat",
        "choices": [
            {
                "index": 0,
                "message": {"role": "assistant", "content": content},
                "logprobs": None,
                "finish_reason": "stop",
            }
        ],
        "usage": {"prompt_tokens": 812, "completion_tokens": 164, "total_tokens": 976},
        "system_fingerprint": "fp_weft_fixture",
    }


def _schema_name(body: dict[str, Any]) -> str | None:
    fmt = body.get("response_format") or {}
    return (fmt.get("json_schema") or {}).get("name")


def _user_text(body: dict[str, Any]) -> str:
    return "\n".join(
        m.get("content") or "" for m in body.get("messages", []) if m.get("role") == "user"
    )


def _weft_task(body: dict[str, Any]) -> dict[str, Any] | None:
    try:
        payload = json.loads(_user_text(body))
    except ValueError:
        return None
    return payload if isinstance(payload, dict) and "task" in payload else None


@dataclass
class Rule:
    name: str
    matches: Matcher
    response: dict[str, Any] | None  # None: time out
    used: int = 0


@dataclass
class LLMScript:
    rules: list[Rule] = field(default_factory=list)

    # --- Graphiti step functions ------------------------------------------

    def graphiti_entities(self, text: str, entities: list[tuple[str, str]]) -> LLMScript:
        """``extract_nodes``: (name, entity type) pairs found in the Entry ``text``."""
        ids = {name: i + 1 for i, name in enumerate(ENTITY_TYPE_NAMES)}
        content = {
            "extracted_entities": [
                {"name": name, "entity_type_id": ids[kind], "episode_indices": [0]}
                for name, kind in entities
            ]
        }
        return self._add(
            f"extract_nodes[{text[:12]}]",
            lambda b: _schema_name(b) == "ExtractedEntities" and f"\n{text}\n" in _user_text(b),
            content,
        )

    def graphiti_facts(self, text: str, facts: list[dict[str, Any]]) -> LLMScript:
        """``extract_edges``: facts as Graphiti's ``Edge`` model (source/target/relation/fact)."""
        edges = [
            {
                "source_entity_name": f["source"],
                "target_entity_name": f["target"],
                "relation_type": f["relation"],
                "fact": f["fact"],
                "valid_at": f.get("valid_at"),
                "invalid_at": f.get("invalid_at"),
                "episode_indices": [0],
            }
            for f in facts
        ]
        return self._add(
            f"extract_edges[{text[:12]}]",
            lambda b: _schema_name(b) == "ExtractedEdges" and text in _user_text(b),
            {"edges": edges},
        )

    # --- Weft's own calls ---------------------------------------------------

    def enrichment(
        self, text: str, result: dict[str, Any], *, requires_custom: str | None = None
    ) -> LLMScript:
        """Our relationship / feeling / profile / confidence / time enrichment call.

        ``requires_custom``: only answer if that subtype is in the vocabulary sent to the
        model (the user's custom subtypes take part in classification, AC-32).
        """

        def matches(body: dict[str, Any]) -> bool:
            task = _weft_task(body)
            if task is None or task["task"] != "enrich" or task["entry"]["text"] != text:
                return False
            if requires_custom is None:
                return True
            return any(requires_custom in names for names in task["relationship_types"].values())

        suffix = f"+{requires_custom}" if requires_custom else ""
        return self._add(f"enrich[{text[:12]}]{suffix}", matches, result)

    def enrichment_raw(self, text: str, content: str) -> LLMScript:
        """The enrichment call answering with ``content`` verbatim (e.g. unparseable)."""

        def matches(body: dict[str, Any]) -> bool:
            task = _weft_task(body)
            return task is not None and task["task"] == "enrich" and task["entry"]["text"] == text

        self.rules.append(Rule(f"enrich-raw[{text[:12]}]", matches, chat_completion(content)))
        return self

    def enrichment_timeout(self, text: str) -> LLMScript:
        def matches(body: dict[str, Any]) -> bool:
            task = _weft_task(body)
            return task is not None and task["task"] == "enrich" and task["entry"]["text"] == text

        self.rules.append(Rule(f"enrich-timeout[{text[:12]}]", matches, None))
        return self

    def person_match(
        self, mention: str, *, decision: str, candidates: list[int] | None = None
    ) -> LLMScript:
        """Our person-matching judgement for ``mention`` (indices into the sent candidates)."""

        def matches(body: dict[str, Any]) -> bool:
            task = _weft_task(body)
            if task is None or task["task"] != "match_person":
                return False
            return bool(task["mention"] == mention)

        return self._add(
            f"match[{mention}]",
            matches,
            {"decision": decision, "candidate_indices": candidates or []},
        )

    # --- plumbing -------------------------------------------------------------

    def _add(self, name: str, matches: Matcher, content: dict[str, Any]) -> LLMScript:
        text = json.dumps(content, ensure_ascii=False)
        self.rules.append(Rule(name, matches, chat_completion(text)))
        return self

    def find(self, body: dict[str, Any]) -> Rule:
        for rule in reversed(self.rules):  # later rules override earlier ones
            if rule.matches(body):
                rule.used += 1
                return rule
        summary = json.dumps(body, ensure_ascii=False)[:600]
        raise AssertionError(f"no scripted LLM response for request: {summary}")


class ScriptGate(httpx.AsyncBaseTransport):
    def __init__(self, script: LLMScript, fixtures_dir: Path = FIXTURES_DIR) -> None:
        self.script = script
        provider = httpx.MockTransport(self._provide)
        mode = ReplayMode.RECORD if AUTHOR_MODE else ReplayMode.REPLAY
        self._replay = ReplayTransport(mode, fixtures_dir, inner=provider)

    def _provide(self, request: httpx.Request) -> httpx.Response:
        rule = self.script.find(json.loads(request.content))
        assert rule.response is not None
        return httpx.Response(200, json=rule.response)

    async def handle_async_request(self, request: httpx.Request) -> httpx.Response:
        await request.aread()
        body = json.loads(request.content)
        rule = self.script.find(body)
        if rule.response is None:
            raise httpx.ReadTimeout("scripted LLM timeout", request=request)
        response = await self._replay.handle_async_request(request)
        if not AUTHOR_MODE:
            replayed = json.loads(await response.aread())
            assert replayed == rule.response, (
                f"LLM fixture for {rule.name} is stale; rerun with WEFT_AUTHOR_LLM_FIXTURES=1"
            )
            response = httpx.Response(
                response.status_code,
                headers=response.headers,
                content=json.dumps(replayed, ensure_ascii=False).encode("utf-8"),
                request=request,
            )
        return response


__all__ = ["AUTHOR_MODE", "FIXTURES_DIR", "LLMScript", "ScriptGate", "chat_completion"]
