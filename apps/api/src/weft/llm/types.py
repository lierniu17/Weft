"""Provider-neutral LLM types: chat (with tool calling / JSON output) and embeddings."""

from __future__ import annotations

from typing import Any, Literal, Protocol, TypeVar

from pydantic import BaseModel, Field

T = TypeVar("T", bound=BaseModel)


class LLMError(RuntimeError):
    """Base class for provider failures (AC-18: the Draft becomes 抽取失败, retryable)."""


class LLMHTTPError(LLMError):
    """Transport failure or non-2xx response."""

    def __init__(self, message: str, *, status_code: int | None = None) -> None:
        super().__init__(message)
        self.status_code = status_code


class LLMResponseError(LLMError):
    """The provider answered, but the answer could not be parsed / validated."""


class ToolCall(BaseModel):
    id: str
    name: str
    arguments: dict[str, Any]


class ChatMessage(BaseModel):
    role: Literal["system", "user", "assistant", "tool"]
    content: str | None = None
    tool_calls: list[ToolCall] | None = None
    tool_call_id: str | None = None


class ToolSpec(BaseModel):
    """A fixed, server-defined tool (ADR-0001: the LLM never emits raw Cypher)."""

    name: str
    description: str
    parameters: dict[str, Any] = Field(description="JSON Schema of the arguments")


class ChatRequest(BaseModel):
    model: str
    messages: list[ChatMessage]
    tools: list[ToolSpec] | None = None
    tool_choice: Literal["auto", "none", "required"] | None = None
    temperature: float | None = None
    max_tokens: int | None = None
    json_output: bool = False


class Usage(BaseModel):
    prompt_tokens: int = 0
    completion_tokens: int = 0


class ChatResult(BaseModel):
    content: str | None
    tool_calls: list[ToolCall] = Field(default_factory=list)
    finish_reason: str | None = None
    usage: Usage = Field(default_factory=Usage)


class ChatModel(Protocol):
    async def chat(self, request: ChatRequest) -> ChatResult: ...

    async def chat_json(self, request: ChatRequest, schema: type[T]) -> T: ...


class EmbeddingModel(Protocol):
    async def embed(
        self, texts: list[str], *, model: str, dimensions: int | None = None
    ) -> list[list[float]]: ...
