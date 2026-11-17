"""OpenAI-compatible HTTP client, used for DeepSeek (chat) and DashScope (embeddings).

Talks plain HTTP through an injected ``httpx.AsyncClient`` so the replay transport
(and test fakes) can sit underneath it.
"""

from __future__ import annotations

import json
from typing import Any

import httpx
from pydantic import ValidationError

from weft.llm.types import (
    ChatRequest,
    ChatResult,
    LLMHTTPError,
    LLMResponseError,
    T,
    ToolCall,
    Usage,
)


def _message_payload(message: Any) -> dict[str, Any]:
    out: dict[str, Any] = {"role": message.role, "content": message.content}
    if message.tool_calls:
        out["tool_calls"] = [
            {
                "id": c.id,
                "type": "function",
                "function": {
                    "name": c.name,
                    "arguments": json.dumps(c.arguments, ensure_ascii=False),
                },
            }
            for c in message.tool_calls
        ]
    if message.tool_call_id is not None:
        out["tool_call_id"] = message.tool_call_id
    return out


def chat_payload(request: ChatRequest) -> dict[str, Any]:
    body: dict[str, Any] = {
        "model": request.model,
        "messages": [_message_payload(m) for m in request.messages],
        "stream": False,
    }
    if request.tools:
        body["tools"] = [
            {
                "type": "function",
                "function": {
                    "name": t.name,
                    "description": t.description,
                    "parameters": t.parameters,
                },
            }
            for t in request.tools
        ]
    if request.tool_choice is not None:
        body["tool_choice"] = request.tool_choice
    if request.temperature is not None:
        body["temperature"] = request.temperature
    if request.max_tokens is not None:
        body["max_tokens"] = request.max_tokens
    if request.json_output:
        body["response_format"] = {"type": "json_object"}
    return body


def _parse_chat(data: dict[str, Any]) -> ChatResult:
    try:
        choice = data["choices"][0]
        message = choice["message"]
        calls = [
            ToolCall(
                id=c["id"],
                name=c["function"]["name"],
                arguments=json.loads(c["function"].get("arguments") or "{}"),
            )
            for c in message.get("tool_calls") or []
        ]
        usage = data.get("usage") or {}
        return ChatResult(
            content=message.get("content"),
            tool_calls=calls,
            finish_reason=choice.get("finish_reason"),
            usage=Usage(
                prompt_tokens=usage.get("prompt_tokens", 0),
                completion_tokens=usage.get("completion_tokens", 0),
            ),
        )
    except (KeyError, IndexError, TypeError, json.JSONDecodeError, ValidationError) as exc:
        raise LLMResponseError(f"malformed chat completion: {exc}") from exc


class OpenAICompatibleClient:
    """Implements both ``ChatModel`` and ``EmbeddingModel`` for one provider."""

    def __init__(self, *, base_url: str, api_key: str, http_client: httpx.AsyncClient) -> None:
        self._base_url = base_url.rstrip("/")
        self._api_key = api_key
        self._http = http_client

    async def _post(self, path: str, body: dict[str, Any]) -> dict[str, Any]:
        try:
            response = await self._http.post(
                f"{self._base_url}{path}",
                content=json.dumps(body, ensure_ascii=False).encode("utf-8"),
                headers={
                    "authorization": f"Bearer {self._api_key}",
                    "content-type": "application/json",
                },
            )
        except httpx.HTTPError as exc:
            raise LLMHTTPError(f"LLM request failed: {exc!r}") from exc
        if response.status_code >= 400:
            raise LLMHTTPError(
                f"LLM returned HTTP {response.status_code}: {response.text[:500]}",
                status_code=response.status_code,
            )
        try:
            data = response.json()
        except ValueError as exc:
            raise LLMResponseError("LLM response is not JSON") from exc
        if not isinstance(data, dict):
            raise LLMResponseError("LLM response is not a JSON object")
        return data

    async def chat(self, request: ChatRequest) -> ChatResult:
        return _parse_chat(await self._post("/chat/completions", chat_payload(request)))

    async def chat_json(self, request: ChatRequest, schema: type[T]) -> T:
        """Chat in JSON mode and validate the answer against ``schema``."""
        result = await self.chat(request.model_copy(update={"json_output": True}))
        if result.content is None:
            raise LLMResponseError("LLM returned no content for a JSON request")
        try:
            return schema.model_validate_json(result.content)
        except ValidationError as exc:
            raise LLMResponseError(f"LLM output does not match {schema.__name__}: {exc}") from exc

    async def embed(
        self, texts: list[str], *, model: str, dimensions: int | None = None
    ) -> list[list[float]]:
        body: dict[str, Any] = {"model": model, "input": texts}
        if dimensions is not None:
            body["dimensions"] = dimensions
        body["encoding_format"] = "float"
        data = await self._post("/embeddings", body)
        try:
            items = sorted(data["data"], key=lambda d: d["index"])
            vectors = [[float(x) for x in item["embedding"]] for item in items]
        except (KeyError, TypeError, ValueError) as exc:
            raise LLMResponseError(f"malformed embeddings response: {exc}") from exc
        if len(vectors) != len(texts):
            raise LLMResponseError("embeddings count does not match inputs")
        return vectors
