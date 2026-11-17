"""The LLM clients extraction needs, all sharing one ``httpx`` client (and so the replay layer).

* ``chat`` — our own DeepSeek calls (relationship / feeling / profile enrichment, person
  matching), JSON mode.
* ``graphiti`` — the clients bundle Graphiti's step functions (``extract_nodes`` /
  ``extract_edges``) take. Its LLM client is Graphiti's OpenAI-compatible generic client
  on top of the same ``httpx`` client, so its traffic is recorded / replayed too.
  It carries no driver: the step functions we call never touch the database, and every
  write goes through our tenant-scoped repository instead (ADR-0001).
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

import httpx
from graphiti_core.graphiti_types import GraphitiClients
from graphiti_core.llm_client.config import LLMConfig
from graphiti_core.llm_client.openai_generic_client import OpenAIGenericClient
from graphiti_core.tracer import NoOpTracer
from openai import AsyncOpenAI

from weft.llm import OpenAICompatibleClient
from weft.settings import Settings

DEEPSEEK_MAX_OUTPUT_TOKENS = 8192  # deepseek-chat's limit; Graphiti's default is 16384


@dataclass(frozen=True)
class ExtractionLLM:
    chat: OpenAICompatibleClient
    model: str
    graphiti: GraphitiClients


def build_extraction_llm(settings: Settings, http: httpx.AsyncClient) -> ExtractionLLM:
    api_key = settings.deepseek_api_key.get_secret_value() or "unset"
    openai_client = AsyncOpenAI(
        api_key=api_key,
        base_url=settings.deepseek_base_url,
        # openai types this as its vendored httpx fork; the plain httpx client is compatible
        # at runtime and is what carries the replay transport.
        http_client=http,  # type: ignore[arg-type]
        max_retries=0,
        timeout=settings.llm_timeout_seconds,
    )
    graphiti_llm = OpenAIGenericClient(
        config=LLMConfig(
            api_key=api_key,
            model=settings.deepseek_chat_model,
            small_model=settings.deepseek_chat_model,
            base_url=settings.deepseek_base_url,
            temperature=0.0,
        ),
        client=openai_client,
        # DeepSeek refuses response_format json_schema (HTTP 400 「This response_format type
        # is unavailable now」); in json_object mode Graphiti puts the schema in the prompt.
        structured_output_mode="json_object",
        max_tokens=DEEPSEEK_MAX_OUTPUT_TOKENS,
    )
    # No driver / embedder / reranker: extract_nodes and extract_edges only use the LLM.
    unused: dict[str, Any] = {"driver": None, "embedder": None, "cross_encoder": None}
    graphiti = GraphitiClients.model_construct(
        llm_client=graphiti_llm,
        tracer=NoOpTracer(),
        prompt_library=None,
        llm_runtime=None,
        max_coroutines=None,
        **unused,
    )
    chat = OpenAICompatibleClient(
        base_url=settings.deepseek_base_url, api_key=api_key, http_client=http
    )
    return ExtractionLLM(chat=chat, model=settings.deepseek_chat_model, graphiti=graphiti)


__all__ = ["ExtractionLLM", "build_extraction_llm"]
