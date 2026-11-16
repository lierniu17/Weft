"""LLM provider abstraction + record/replay, against an in-process fake HTTP transport.

No network: every request is answered by ``httpx.MockTransport``.
"""

import json
from pathlib import Path
from typing import Any

import httpx
import pytest
from pydantic import BaseModel

from weft.llm import (
    ChatMessage,
    ChatRequest,
    LLMHTTPError,
    LLMResponseError,
    MissingFixtureError,
    OpenAICompatibleClient,
    ReplayMode,
    ReplayTransport,
    ToolSpec,
    build_llm_clients,
    fixture_key,
)
from weft.settings import Settings

pytestmark = pytest.mark.unit

BASE = "https://llm.example.test/v1"


class FakeUpstream:
    """Records requests and answers like an OpenAI-compatible server."""

    def __init__(self, reply: dict[str, Any] | None = None, status: int = 200) -> None:
        self.requests: list[httpx.Request] = []
        self.reply = reply
        self.status = status

    def __call__(self, request: httpx.Request) -> httpx.Response:
        self.requests.append(request)
        if self.reply is not None:
            return httpx.Response(self.status, json=self.reply)
        body = json.loads(request.content)
        if request.url.path.endswith("/embeddings"):
            data = [
                {"index": i, "embedding": [float(len(t)), float(i)]}
                for i, t in enumerate(body["input"])
            ]
            return httpx.Response(200, json={"data": list(reversed(data))})
        last = body["messages"][-1]["content"]
        return httpx.Response(200, json=_chat_reply(content=f"echo:{last}"))

    @property
    def transport(self) -> httpx.MockTransport:
        return httpx.MockTransport(self)


def _chat_reply(
    content: str | None = None, tool_calls: list[dict[str, Any]] | None = None
) -> dict[str, Any]:
    message: dict[str, Any] = {"role": "assistant", "content": content}
    if tool_calls is not None:
        message["tool_calls"] = tool_calls
    return {
        "id": "x",
        "object": "chat.completion",
        "model": "deepseek-chat",
        "choices": [{"index": 0, "message": message, "finish_reason": "stop"}],
        "usage": {"prompt_tokens": 1, "completion_tokens": 1, "total_tokens": 2},
    }


def _client(transport: httpx.AsyncBaseTransport, key: str = "sk-test") -> OpenAICompatibleClient:
    return OpenAICompatibleClient(
        base_url=BASE, api_key=key, http_client=httpx.AsyncClient(transport=transport)
    )


def _hello(model: str = "deepseek-chat") -> ChatRequest:
    return ChatRequest(model=model, messages=[ChatMessage(role="user", content="你好")])


# --- OpenAI-compatible provider --------------------------------------------


async def test_chat_posts_openai_compatible_request_and_returns_content() -> None:
    upstream = FakeUpstream()
    result = await _client(upstream.transport).chat(_hello())
    assert result.content == "echo:你好"
    sent = upstream.requests[0]
    assert sent.method == "POST"
    assert str(sent.url) == f"{BASE}/chat/completions"
    assert sent.headers["authorization"] == "Bearer sk-test"
    body = json.loads(sent.content)
    assert body["model"] == "deepseek-chat"
    assert body["messages"] == [{"role": "user", "content": "你好"}]
    assert body["stream"] is False


async def test_chat_with_tools_parses_tool_calls() -> None:
    upstream = FakeUpstream(
        _chat_reply(
            tool_calls=[
                {
                    "id": "call_1",
                    "type": "function",
                    "function": {"name": "find_person", "arguments": '{"name": "老张"}'},
                }
            ]
        )
    )
    tool = ToolSpec(
        name="find_person",
        description="按姓名或别名查找人物",
        parameters={"type": "object", "properties": {"name": {"type": "string"}}},
    )
    request = ChatRequest(
        model="deepseek-chat",
        messages=[ChatMessage(role="user", content="老张是谁")],
        tools=[tool],
    )
    result = await _client(upstream.transport).chat(request)
    assert [(c.id, c.name, c.arguments) for c in result.tool_calls] == [
        ("call_1", "find_person", {"name": "老张"})
    ]
    body = json.loads(upstream.requests[0].content)
    assert body["tools"][0] == {
        "type": "function",
        "function": {
            "name": "find_person",
            "description": "按姓名或别名查找人物",
            "parameters": {"type": "object", "properties": {"name": {"type": "string"}}},
        },
    }


class _Extracted(BaseModel):
    persons: list[str]


async def test_chat_json_requests_json_mode_and_validates_output() -> None:
    upstream = FakeUpstream(_chat_reply(content='{"persons": ["老张"]}'))
    out = await _client(upstream.transport).chat_json(_hello(), _Extracted)
    assert out == _Extracted(persons=["老张"])
    body = json.loads(upstream.requests[0].content)
    assert body["response_format"] == {"type": "json_object"}


@pytest.mark.parametrize("content", ["not json", '{"persons": "老张"}', None])
async def test_chat_json_unparseable_output_raises_response_error(content: str | None) -> None:
    upstream = FakeUpstream(_chat_reply(content=content))
    with pytest.raises(LLMResponseError):
        await _client(upstream.transport).chat_json(_hello(), _Extracted)


async def test_http_error_raises_with_status() -> None:
    upstream = FakeUpstream({"error": {"message": "rate limited"}}, status=429)
    with pytest.raises(LLMHTTPError) as exc:
        await _client(upstream.transport).chat(_hello())
    assert exc.value.status_code == 429


async def test_timeout_surfaces_as_llm_error() -> None:
    def boom(request: httpx.Request) -> httpx.Response:
        raise httpx.ReadTimeout("slow", request=request)

    with pytest.raises(LLMHTTPError):
        await _client(httpx.MockTransport(boom)).chat(_hello())


async def test_embeddings_are_returned_in_input_order() -> None:
    upstream = FakeUpstream()
    vectors = await _client(upstream.transport).embed(
        ["老张", "小李喜欢露营"], model="text-embedding-v4", dimensions=1024
    )
    assert vectors == [[2.0, 0.0], [6.0, 1.0]]
    body = json.loads(upstream.requests[0].content)
    assert str(upstream.requests[0].url) == f"{BASE}/embeddings"
    assert body == {
        "model": "text-embedding-v4",
        "input": ["老张", "小李喜欢露营"],
        "dimensions": 1024,
        "encoding_format": "float",
    }


# --- record / replay ---------------------------------------------------------


def test_fixture_key_ignores_json_formatting_and_headers() -> None:
    a = httpx.Request(
        "POST",
        f"{BASE}/chat/completions",
        content=b'{"a": 1, "b": [1, 2]}',
        headers={"authorization": "Bearer one"},
    )
    b = httpx.Request(
        "POST",
        "https://other-host.test/v1/chat/completions",
        content=b'{"b":[1,2],"a":1}',
        headers={"authorization": "Bearer two"},
    )
    c = httpx.Request("POST", f"{BASE}/chat/completions", content=b'{"a": 2, "b": [1, 2]}')
    assert fixture_key(a) == fixture_key(b)
    assert fixture_key(a) != fixture_key(c)


async def test_record_then_replay_serves_the_same_response_without_upstream(
    tmp_path: Path,
) -> None:
    upstream = FakeUpstream()
    recorder = ReplayTransport(ReplayMode.RECORD, tmp_path, inner=upstream.transport)
    recorded = await _client(recorder).chat(_hello())
    assert len(upstream.requests) == 1

    files = list(tmp_path.glob("*.json"))
    assert len(files) == 1
    saved = files[0].read_text(encoding="utf-8")
    assert "sk-test" not in saved  # credentials are never written to fixtures
    assert "你好" in saved  # fixtures are human-readable

    def no_network(request: httpx.Request) -> httpx.Response:
        raise AssertionError("replay must not reach the network")

    player = ReplayTransport(ReplayMode.REPLAY, tmp_path, inner=httpx.MockTransport(no_network))
    replayed = await _client(player, key="sk-different").chat(_hello())
    assert replayed == recorded


async def test_replay_fails_loudly_on_missing_fixture(tmp_path: Path) -> None:
    upstream = FakeUpstream()
    player = ReplayTransport(ReplayMode.REPLAY, tmp_path, inner=upstream.transport)
    with pytest.raises(MissingFixtureError) as exc:
        await _client(player).chat(_hello())
    assert upstream.requests == []
    assert exc.value.key in str(exc.value)
    assert "record" in str(exc.value)


async def test_off_mode_passes_through_and_writes_nothing(tmp_path: Path) -> None:
    upstream = FakeUpstream()
    passthrough = ReplayTransport(ReplayMode.OFF, tmp_path, inner=upstream.transport)
    result = await _client(passthrough).chat(_hello())
    assert result.content == "echo:你好"
    assert len(upstream.requests) == 1
    assert list(tmp_path.iterdir()) == []


async def test_record_does_not_save_error_responses(tmp_path: Path) -> None:
    upstream = FakeUpstream({"error": "boom"}, status=500)
    recorder = ReplayTransport(ReplayMode.RECORD, tmp_path, inner=upstream.transport)
    with pytest.raises(LLMHTTPError):
        await _client(recorder).chat(_hello())
    assert list(tmp_path.iterdir()) == []


async def test_replay_transport_also_serves_the_openai_sdk(tmp_path: Path) -> None:
    """Graphiti's own LLM client is built on the openai SDK; it must replay too."""
    from openai import AsyncOpenAI

    upstream = FakeUpstream()
    recorder = ReplayTransport(ReplayMode.RECORD, tmp_path, inner=upstream.transport)
    sdk = AsyncOpenAI(
        base_url=BASE,
        api_key="sk-test",
        http_client=httpx.AsyncClient(transport=recorder),
        max_retries=0,
    )
    first = await sdk.chat.completions.create(
        model="deepseek-chat", messages=[{"role": "user", "content": "你好"}]
    )

    player = ReplayTransport(
        ReplayMode.REPLAY, tmp_path, inner=httpx.MockTransport(lambda r: 1 / 0)
    )
    sdk2 = AsyncOpenAI(
        base_url=BASE,
        api_key="sk-x",
        http_client=httpx.AsyncClient(transport=player),
        max_retries=0,
    )
    second = await sdk2.chat.completions.create(
        model="deepseek-chat", messages=[{"role": "user", "content": "你好"}]
    )
    assert second.choices[0].message.content == first.choices[0].message.content == "echo:你好"


# --- wiring from settings ---------------------------------------------------


async def test_clients_are_built_from_settings_for_deepseek_and_dashscope(tmp_path: Path) -> None:
    upstream = FakeUpstream()
    settings = Settings(
        _env_file=None,
        deepseek_api_key="sk-deepseek",
        deepseek_base_url="https://api.deepseek.test",
        dashscope_api_key="sk-dashscope",
        dashscope_base_url="https://dashscope.test/compatible-mode/v1",
        llm_replay_mode="off",
        llm_fixtures_dir=tmp_path,
    )
    clients = build_llm_clients(settings, upstream_transport=upstream.transport)
    await clients.chat.chat(_hello(model=settings.deepseek_chat_model))
    await clients.embeddings.embed(["老张"], model=settings.dashscope_embedding_model)
    chat_req, embed_req = upstream.requests
    assert str(chat_req.url) == "https://api.deepseek.test/chat/completions"
    assert chat_req.headers["authorization"] == "Bearer sk-deepseek"
    assert str(embed_req.url) == "https://dashscope.test/compatible-mode/v1/embeddings"
    assert embed_req.headers["authorization"] == "Bearer sk-dashscope"
