"""Text embeddings (ADR-0002: 通义千问 ``text-embedding-v4`` via DashScope's OpenAI-compatible API).

Used for Graphiti's hybrid search: ``name_embedding`` on persons and entities,
``fact_embedding`` on facts, and the query vector at search time.
"""

from __future__ import annotations

from weft.llm.types import EmbeddingModel

# DashScope's text-embedding-v4 accepts at most 10 inputs per request.
DASHSCOPE_BATCH_SIZE = 10


class Embedder:
    def __init__(
        self,
        client: EmbeddingModel,
        *,
        model: str,
        dimensions: int,
        batch_size: int = DASHSCOPE_BATCH_SIZE,
    ) -> None:
        self._client = client
        self.model = model
        self.dimensions = dimensions
        self._batch_size = batch_size

    async def embed(self, texts: list[str]) -> list[list[float]]:
        """One vector per text, in order; raises ``LLMError`` if the provider fails."""
        vectors: list[list[float]] = []
        for start in range(0, len(texts), self._batch_size):
            batch = texts[start : start + self._batch_size]
            vectors += await self._client.embed(batch, model=self.model, dimensions=self.dimensions)
        return vectors


__all__ = ["DASHSCOPE_BATCH_SIZE", "Embedder"]
