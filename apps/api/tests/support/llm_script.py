"""Hand-authored LLM responses, served through the real replay transport.

Every test that reaches the LLM declares its responses with ``LLMScript`` rules (what an
honest DeepSeek answer to that request looks like). The HTTP stack under test is::

    ScriptGate  ->  ReplayTransport(REPLAY, tests/fixtures/llm)

* ``ScriptGate`` refuses any request no rule matches, raises ``httpx.ReadTimeout`` for
  ``timeout`` rules (a timeout cannot be recorded), and checks that the replayed fixture is
  exactly the scripted response — so a hand-edited rule can never silently disagree with
  a stale fixture file.
* Embedding requests (DashScope ``/embeddings``) are answered by ``fake_embedding``: a
  deterministic hashed bag of characters and character bigrams, so texts sharing words are
  close (cosine) and semantic search is testable without a fixture per vector. They never
  reach the replay layer or the network.
* Fixture files are keyed by the request hash (``weft.llm.replay``). To (re)author them run
  ``WEFT_AUTHOR_LLM_FIXTURES=1 uv run pytest ...``: the gate then puts the transport in
  RECORD mode with the script as the "provider", which writes the fixture files. No test
  ever reaches the network.
"""

from __future__ import annotations

import hashlib
import itertools
import json
import math
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


def fake_embedding(text: str, dimensions: int = 1024) -> list[float]:
    """A deterministic unit vector: hashed characters + bigrams (punctuation ignored)."""
    chars = [c for c in text if c.isalnum()]
    features = chars + [a + b for a, b in itertools.pairwise(chars)]
    vector = [0.0] * dimensions
    for feature in features:
        digest = hashlib.sha256(feature.encode("utf-8")).digest()
        vector[int.from_bytes(digest[:4], "big") % dimensions] += 1.0
    norm = math.sqrt(sum(v * v for v in vector)) or 1.0
    return [v / norm for v in vector]


def embeddings_response(body: dict[str, Any]) -> dict[str, Any]:
    """What DashScope's OpenAI-compatible ``/embeddings`` returns for ``body``."""
    texts = body["input"] if isinstance(body["input"], list) else [body["input"]]
    dimensions = int(body.get("dimensions") or 1024)
    return {
        "object": "list",
        "model": body.get("model", "text-embedding-v4"),
        "data": [
            {"object": "embedding", "index": i, "embedding": fake_embedding(t, dimensions)}
            for i, t in enumerate(texts)
        ],
        "usage": {"prompt_tokens": 0, "total_tokens": 0},
    }


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


def tool_calls_completion(calls: list[tuple[str, dict[str, Any]]], turn: int) -> dict[str, Any]:
    """A DeepSeek chat completion that calls tools (``finish_reason = tool_calls``)."""
    completion = chat_completion("")
    completion["choices"][0]["message"] = {
        "role": "assistant",
        "content": "",
        "tool_calls": [
            {
                "id": f"call_{turn}_{i}",
                "type": "function",
                "function": {"name": name, "arguments": json.dumps(args, ensure_ascii=False)},
            }
            for i, (name, args) in enumerate(calls)
        ],
    }
    completion["choices"][0]["finish_reason"] = "tool_calls"
    return completion


HISTORY_MARKER = "\n上文："  # weft.services.ask: the 上文 JSON follows it in the system prompt


def _ask_history(body: dict[str, Any]) -> list[str]:
    """The questions of the 上文 a Q&A request carries (oldest first; [] if none)."""
    messages = body.get("messages") or [{}]
    system = messages[0].get("content") or ""
    if HISTORY_MARKER not in system:
        return []
    turns = json.loads(system.rsplit(HISTORY_MARKER, 1)[1])
    return [t["question"] for t in turns]


def _ask_turn(
    body: dict[str, Any], question: str, turn: int, history: list[str] | None = None
) -> bool:
    tools = {t["function"]["name"] for t in body.get("tools") or []}
    messages = body.get("messages", [])
    return (
        "final_answer" in tools
        and len(messages) > 1
        and messages[1].get("content") == question
        and sum(m.get("role") == "assistant" for m in messages) == turn
        and (history is None or _ask_history(body) == history)
    )


def _task_history(task: dict[str, Any]) -> list[str]:
    return [t["question"] for t in task.get("history") or []]


def _schema_name(body: dict[str, Any]) -> str | None:
    """The response model Graphiti asked for. DeepSeek only takes ``json_object``, so
    Graphiti appends the model's JSON schema to the last message instead."""
    messages = body.get("messages") or []
    marker = "Respond with a JSON object in the following format:"
    last = (messages[-1].get("content") or "") if messages else ""
    if marker not in last:
        return None
    try:
        schema = json.loads(last.rsplit(marker, 1)[1])
    except ValueError:
        return None
    return schema.get("title") if isinstance(schema, dict) else None


def _user_text(body: dict[str, Any]) -> str:
    return "\n".join(
        m.get("content") or "" for m in body.get("messages", []) if m.get("role") == "user"
    )


def _weft_task(body: dict[str, Any]) -> dict[str, Any] | None:
    """The JSON task payload of one of Weft's own calls (its first user message)."""
    first = next((m for m in body.get("messages", []) if m.get("role") == "user"), None)
    try:
        payload = json.loads((first or {}).get("content") or "")
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
    embedded: list[str] = field(default_factory=list)  # every text sent for embedding
    embeddings_down: bool = False  # the embedding provider answers HTTP 503
    tool_outputs: list[str] = field(default_factory=list)  # tool results the model last saw

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
        self,
        text: str,
        result: dict[str, Any],
        *,
        requires_custom: str | None = None,
        written_on: str | None = None,
    ) -> LLMScript:
        """Our relationship / feeling / profile / confidence / time enrichment call.

        ``requires_custom``: only answer if that subtype is in the vocabulary sent to the
        model (the user's custom subtypes take part in classification, AC-32).
        ``written_on``: only answer if the Entry is sent with that day of writing as its
        reference date and its occurred date as ``event_occurred`` (read from a message,
        intent-routing AC-8).
        """

        def matches(body: dict[str, Any]) -> bool:
            task = _weft_task(body)
            if task is None or task["task"] != "enrich" or task["entry"]["text"] != text:
                return False
            entry = task["entry"]
            if written_on is not None and (
                "event_occurred" not in entry or entry["occurred"] != written_on
            ):
                return False
            if requires_custom is None:
                return True
            return any(requires_custom in names for names in task["relationship_types"].values())

        suffix = f"+{requires_custom}" if requires_custom else ""
        suffix += f"@{written_on}" if written_on else ""
        return self._add(f"enrich[{text[:12]}]{suffix}", matches, result)

    def enrichment_raw(self, text: str, content: str) -> LLMScript:
        """The enrichment call answering with ``content`` verbatim (e.g. unparseable)."""

        def matches(body: dict[str, Any]) -> bool:
            task = _weft_task(body)
            return task is not None and task["task"] == "enrich" and task["entry"]["text"] == text

        self.rules.append(Rule(f"enrich-raw[{text[:12]}]", matches, chat_completion(content)))
        return self

    def enrichment_retry(self, text: str, content: str, *, feedback: str = "") -> LLMScript:
        """The answer to the enrichment call sent back with validation errors (the request
        carries the first answer as an assistant turn, and ``feedback`` in the errors)."""

        def matches(body: dict[str, Any]) -> bool:
            task = _weft_task(body)
            messages = body.get("messages", [])
            return (
                task is not None
                and task["task"] == "enrich"
                and task["entry"]["text"] == text
                and any(m.get("role") == "assistant" for m in messages)
                and feedback in (messages[-1].get("content") or "")
            )

        self.rules.append(Rule(f"enrich-retry[{text[:12]}]", matches, chat_completion(content)))
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

    # --- 意图识别 (intent routing) -------------------------------------------------

    def intent(
        self,
        text: str,
        intent: str,
        *,
        confidence: float = 0.93,
        occurred: str | None = None,
        record_text: str | None = None,
        question: str | None = None,
        reply: str | None = None,
        clarify: Any = None,
        history: list[str] | None = None,
    ) -> LLMScript:
        """The model's reading of a chat message (``weft.services.intent``), sent without a
        pending 反问. ``clarify``: the 反问 the model writes (any JSON, to test the checks).
        ``history``: only if sent with that 上文 (its questions, oldest first)."""

        def matches(body: dict[str, Any]) -> bool:
            task = _weft_task(body)
            return (
                task is not None
                and task["task"] == "intent"
                and task["text"] == text
                and "context" not in task
                and (history is None or _task_history(task) == history)
            )

        return self._add(
            f"intent[{text[:12]}]{'+history' if history else ''}",
            matches,
            {
                "intent": intent,
                "confidence": confidence,
                "occurred": occurred,
                "record_text": record_text,
                "question": question,
                "reply": reply,
                "clarify": clarify,
                "answers_clarification": None,
            },
        )

    def intent_after(
        self,
        original: str,
        clarify_question: str,
        text: str,
        intent: str,
        *,
        answers: bool,
        confidence: float = 0.93,
        occurred: str | None = None,
        record_text: str | None = None,
        question: str | None = None,
        reply: str | None = None,
        clarify: Any = None,
    ) -> LLMScript:
        """The model's reading of ``text`` sent right after the 拿不准 message ``original``,
        with the 反问 ``clarify_question`` as context (intent clarify AC-4): whether it
        ``answers`` it, and the merged ``record_text`` / ``question``."""

        def matches(body: dict[str, Any]) -> bool:
            task = _weft_task(body)
            return (
                task is not None
                and task["task"] == "intent"
                and task["text"] == text
                and task.get("context")
                == {"original": original, "clarify_question": clarify_question}
            )

        return self._add(
            f"intent-after[{original[:8]}][{text[:12]}]",
            matches,
            {
                "intent": intent,
                "confidence": confidence,
                "occurred": occurred,
                "record_text": record_text,
                "question": question,
                "reply": reply,
                "clarify": clarify,
                "answers_clarification": answers,
            },
        )

    def intent_confirm(
        self,
        original: str,
        clarify_question: str,
        text: str,
        intent: str,
        *,
        answers: bool,
        confidence: float = 0.93,
        question: str | None = None,
        record_text: str | None = None,
        reply: str | None = None,
    ) -> LLMScript:
        """The model's reading of ``text`` sent right after the question ``original`` got
        问答's 指代确认 ``clarify_question`` (conversation-context AC-3): whether it says which
        person or event was meant, and the full ``question`` then."""

        def matches(body: dict[str, Any]) -> bool:
            task = _weft_task(body)
            context = (task or {}).get("context") or {}
            return (
                task is not None
                and task["task"] == "intent"
                and task["text"] == text
                and context.get("kind") == "confirm"
                and context.get("original") == original
                and context.get("clarify_question") == clarify_question
            )

        return self._add(
            f"intent-confirm[{original[:8]}][{text[:12]}]",
            matches,
            {
                "intent": intent,
                "confidence": confidence,
                "occurred": None,
                "record_text": record_text,
                "question": question,
                "reply": reply,
                "clarify": None,
                "answers_clarification": answers,
            },
        )

    def intent_timeout(self, text: str) -> LLMScript:
        def matches(body: dict[str, Any]) -> bool:
            task = _weft_task(body)
            return (
                task is not None
                and task["task"] == "intent"
                and task["text"] == text
                and "context" not in task
            )

        self.rules.append(Rule(f"intent-timeout[{text[:12]}]", matches, None))
        return self

    # --- generated summaries ----------------------------------------------------

    def person_summary(self, name: str, summary: str, *, has: str | None = None) -> LLMScript:
        """The 综合描述 DeepSeek writes for ``name`` (only if the profile mentions ``has``)."""

        def matches(body: dict[str, Any]) -> bool:
            task = _weft_task(body)
            return (
                task is not None
                and task["task"] == "summarize_person"
                and task["person"]["name"] == name
                and (has is None or has in json.dumps(task, ensure_ascii=False))
            )

        return self._add(
            f"summary[{name}]{'+' + has if has else ''}", matches, {"summary": summary}
        )

    def person_summary_timeout(self, name: str) -> LLMScript:
        def matches(body: dict[str, Any]) -> bool:
            task = _weft_task(body)
            return (
                task is not None
                and task["task"] == "summarize_person"
                and task["person"]["name"] == name
            )

        self.rules.append(Rule(f"summary-timeout[{name}]", matches, None))
        return self

    def relationship_summary(self, a: str, b: str, summary: str) -> LLMScript:
        def matches(body: dict[str, Any]) -> bool:
            task = _weft_task(body)
            return (
                task is not None
                and task["task"] == "summarize_relationship"
                and set(task["pair"]) == {a, b}
            )

        return self._add(f"relationship-summary[{a}-{b}]", matches, {"summary": summary})

    # --- 问答 ------------------------------------------------------------------

    def ask(
        self,
        question: str,
        *turns: list[tuple[str, dict[str, Any]]],
        history: list[str] | None = None,
    ) -> LLMScript:
        """A Q&A conversation: turn ``i`` answers the request that already carries ``i``
        assistant turns, by calling the given tools (the last turn calls final_answer).
        ``history``: only if sent with that 上文 (its questions, oldest first; [] for none)."""
        suffix = "" if history is None else f"+history{len(history)}"
        for turn, calls in enumerate(turns):
            self.rules.append(
                Rule(
                    f"ask[{question[:12]}]{suffix}#{turn}",
                    lambda b, t=turn: _ask_turn(b, question, t, history),
                    tool_calls_completion(calls, turn),
                )
            )
        return self

    def ask_says(self, question: str, turn: int, content: str) -> LLMScript:
        """The model answering turn ``turn`` in plain text, without calling any tool."""
        self.rules.append(
            Rule(
                f"ask-text[{question[:12]}]#{turn}",
                lambda b: _ask_turn(b, question, turn),
                chat_completion(content),
            )
        )
        return self

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
        if request.url.path.endswith("/embeddings"):
            if self.script.embeddings_down:
                return httpx.Response(503, json={"error": "unavailable"}, request=request)
            self.script.embedded.extend(body["input"])
            return httpx.Response(200, json=embeddings_response(body), request=request)
        tool_outputs = [m["content"] for m in body.get("messages", []) if m.get("role") == "tool"]
        if tool_outputs:
            self.script.tool_outputs = tool_outputs
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


__all__ = [
    "AUTHOR_MODE",
    "FIXTURES_DIR",
    "LLMScript",
    "ScriptGate",
    "chat_completion",
    "fake_embedding",
]
