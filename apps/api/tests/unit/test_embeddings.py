"""Embeddings (DashScope text-embedding-v4): batching, and the adapter Graphiti's search uses."""

from __future__ import annotations

import pytest

from weft.graph_search import GraphitiEmbedder
from weft.llm.embeddings import Embedder

pytestmark = pytest.mark.unit


class RecordingModel:
    """An in-process EmbeddingModel: vector = [len(text), call number]."""

    def __init__(self) -> None:
        self.calls: list[tuple[list[str], str, int | None]] = []

    async def embed(
        self, texts: list[str], *, model: str, dimensions: int | None = None
    ) -> list[list[float]]:
        self.calls.append((list(texts), model, dimensions))
        return [[float(len(t)), float(len(self.calls))] for t in texts]


async def test_texts_are_embedded_in_provider_sized_batches_keeping_their_order() -> None:
    model = RecordingModel()
    embedder = Embedder(model, model="text-embedding-v4", dimensions=1024, batch_size=10)
    texts = [f"t{'x' * i}" for i in range(23)]

    vectors = await embedder.embed(texts)

    assert [len(batch) for batch, _, _ in model.calls] == [10, 10, 3]
    assert all(m == "text-embedding-v4" and d == 1024 for _, m, d in model.calls)
    assert [v[0] for v in vectors] == [float(len(t)) for t in texts]


async def test_nothing_to_embed_makes_no_call() -> None:
    model = RecordingModel()
    assert await Embedder(model, model="m", dimensions=8).embed([]) == []
    assert model.calls == []


async def test_graphiti_gets_one_vector_per_query() -> None:
    model = RecordingModel()
    adapter = GraphitiEmbedder(Embedder(model, model="m", dimensions=8))

    assert await adapter.create(input_data=["谁喜欢露营"]) == [5.0, 1.0]
    assert await adapter.create(input_data="老张") == [2.0, 2.0]
    assert await adapter.create_batch(["a", "bb"]) == [[1.0, 3.0], [2.0, 3.0]]
