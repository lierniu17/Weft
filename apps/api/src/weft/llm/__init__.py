"""LLM provider abstraction (ADR-0002): DeepSeek for chat, Qwen embeddings via DashScope."""

from __future__ import annotations

from dataclasses import dataclass
from typing import TYPE_CHECKING

import httpx

from weft.llm.openai_compatible import OpenAICompatibleClient
from weft.llm.replay import MissingFixtureError, ReplayMode, ReplayTransport, fixture_key
from weft.llm.types import (
    ChatMessage,
    ChatModel,
    ChatRequest,
    ChatResult,
    EmbeddingModel,
    LLMError,
    LLMHTTPError,
    LLMResponseError,
    ToolCall,
    ToolSpec,
)

if TYPE_CHECKING:  # settings imports weft.llm.replay; avoid an import cycle
    from weft.settings import Settings


@dataclass(frozen=True)
class LLMClients:
    chat: OpenAICompatibleClient
    embeddings: OpenAICompatibleClient


def build_http_client(
    settings: Settings, *, upstream_transport: httpx.AsyncBaseTransport | None = None
) -> httpx.AsyncClient:
    """An ``httpx.AsyncClient`` with the replay layer; also hand this to Graphiti's clients."""
    transport = ReplayTransport(
        settings.llm_replay_mode, settings.llm_fixtures_dir, inner=upstream_transport
    )
    return httpx.AsyncClient(transport=transport, timeout=settings.llm_timeout_seconds)


def build_llm_clients(
    settings: Settings, *, upstream_transport: httpx.AsyncBaseTransport | None = None
) -> LLMClients:
    http = build_http_client(settings, upstream_transport=upstream_transport)
    return LLMClients(
        chat=OpenAICompatibleClient(
            base_url=settings.deepseek_base_url,
            api_key=settings.deepseek_api_key.get_secret_value(),
            http_client=http,
        ),
        embeddings=OpenAICompatibleClient(
            base_url=settings.dashscope_base_url,
            api_key=settings.dashscope_api_key.get_secret_value(),
            http_client=http,
        ),
    )


__all__ = [
    "ChatMessage",
    "ChatModel",
    "ChatRequest",
    "ChatResult",
    "EmbeddingModel",
    "LLMClients",
    "LLMError",
    "LLMHTTPError",
    "LLMResponseError",
    "MissingFixtureError",
    "OpenAICompatibleClient",
    "ReplayMode",
    "ReplayTransport",
    "ToolCall",
    "ToolSpec",
    "build_http_client",
    "build_llm_clients",
    "fixture_key",
]
