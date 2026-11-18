"""Intent recognition eval runner (intent-routing AC-11): ``eval/intent/samples.jsonl``.

Every sample goes through exactly the recognition a chat message gets
(``weft.services.intent``: the fast path for clear questions, else the model, then the
confidence threshold). The clock is pinned to 2026-11-16 (Beijing), the date the gold
occurred dates assume. ``eval/intent/score.py`` scores the predictions, overall and per
dev / held-out split; AC-11 is decided on the held-out split. No database is touched.
"""

from __future__ import annotations

import asyncio
import importlib.util
import logging
from datetime import UTC, datetime
from types import ModuleType
from typing import Any

from weft.domain.intent import decide, fast_path
from weft.infra import Infra
from weft.services import intent
from weft.settings import API_DIR

logger = logging.getLogger(__name__)

EVAL_DIR = API_DIR / "eval" / "intent"
SAMPLES_PATH = EVAL_DIR / "samples.jsonl"
EVAL_NOW = datetime(2026, 11, 16, 4, 0, tzinfo=UTC)  # 12:00 Beijing, a Monday
CONCURRENCY = 6

Sample = dict[str, Any]


def eval_clock() -> datetime:
    return EVAL_NOW


def load_scorer() -> ModuleType:
    """``eval/intent/score.py`` (standard library only, kept outside the package)."""
    spec = importlib.util.spec_from_file_location("weft_eval_intent_score", EVAL_DIR / "score.py")
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


async def predict(infra: Infra, sample: Sample) -> dict[str, Any]:
    """What recognition makes of one sample, with the model's raw reading for diagnosis."""
    text = sample["text"]
    fast = fast_path(text)
    raw: dict[str, Any] | None = None
    if fast is not None:
        seen = fast
    else:
        reading = await intent.read(infra, text)
        raw = reading.model_dump(mode="json")
        seen = decide(
            reading,
            text=text,
            threshold=infra.settings.intent_confidence_threshold,
            today=infra.today(),
        )
    return {
        "id": sample["id"],
        "intent": seen.intent.value,
        "confidence": seen.confidence,
        "uncertain": seen.uncertain,
        "occurred": None if seen.occurred is None else seen.occurred.isoformat(),
        "fast_path": seen.fast_path,
        "raw": raw,
    }


async def run(infra: Infra, samples: list[Sample]) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Predict every sample (a few at a time) and score; returns (predictions, report)."""
    gate = asyncio.Semaphore(CONCURRENCY)
    errors: dict[str, str] = {}

    async def one(sample: Sample) -> dict[str, Any] | None:
        async with gate:
            try:
                return await predict(infra, sample)
            except Exception as exc:  # one failed sample must not stop the run
                logger.warning("intent eval: sample %s failed: %r", sample["id"], exc)
                errors[sample["id"]] = f"{type(exc).__name__}: {str(exc)[:200]}"
                return None

    results = await asyncio.gather(*(one(s) for s in samples))
    predictions = [p for p in results if p is not None]
    scorer = load_scorer()
    by_id = {p["id"]: p for p in predictions}
    report: dict[str, Any] = scorer.score(samples, by_id)
    report["splits"] = scorer.score_by_split(samples, by_id)
    report["errors"] = errors  # samples whose recognition call failed
    return predictions, report


__all__ = ["EVAL_NOW", "SAMPLES_PATH", "eval_clock", "load_scorer", "predict", "run"]
