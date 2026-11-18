"""反问 eval runner (intent-clarify AC-9): ``eval/intent/clarify.jsonl``.

For every group, two recognitions exactly as the chat does them (``weft.services.intent``):

* round 1 — the ``original`` on its own: is it 拿不准, and does it come with a usable 反问;
* round 2 — the ``reply`` sent with the pending 反问 as context: does it answer it, and how
  is 原话 + 回答 handled (merged intent, record text / question, occurred date).

Round 1 also runs over the intent eval's 模糊句 (``eval/intent/samples.jsonl``), so the
valid-反问 rate covers the vague lines the routing eval already has. The clock is pinned to
2026-11-16 (Beijing). ``eval/intent/clarify_score.py`` scores, per dev / held-out split; AC-9
is decided on the held-out split. No database is touched.
"""

from __future__ import annotations

import asyncio
import importlib.util
import json
import logging
from types import ModuleType
from typing import Any

from weft.domain.intent import ClarifyContext, decide, fast_path
from weft.eval import intent as intent_eval
from weft.infra import Infra
from weft.services import intent
from weft.settings import API_DIR

logger = logging.getLogger(__name__)

EVAL_DIR = API_DIR / "eval" / "intent"
GROUPS_PATH = EVAL_DIR / "clarify.jsonl"
VAGUE_CATEGORY = "模糊句"  # the intent eval's vague lines: round 1 only
CONCURRENCY = 6
eval_clock = intent_eval.eval_clock

Group = dict[str, Any]


def load_scorer() -> ModuleType:
    """``eval/intent/clarify_score.py`` (standard library only, kept outside the package)."""
    spec = importlib.util.spec_from_file_location(
        "weft_eval_clarify_score", EVAL_DIR / "clarify_score.py"
    )
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


async def first_round(infra: Infra, text: str) -> dict[str, Any]:
    """Recognition of a message on its own: 拿不准? with a usable 反问?"""
    if fast_path(text) is not None:
        return {"uncertain": False, "valid_clarify": False, "fast_path": True, "clarify": None}
    reading = await intent.read(infra, text)
    seen = decide(
        reading,
        text=text,
        threshold=infra.settings.intent_confidence_threshold,
        today=infra.today(),
    )
    return {
        "uncertain": seen.uncertain,
        "valid_clarify": seen.clarify is not None,
        "confidence": seen.confidence,
        "clarify": None if seen.clarify is None else seen.clarify.to_json(),
        "raw_clarify": reading.clarify,
    }


async def predict(infra: Infra, group: Group) -> dict[str, Any]:
    """Both rounds of one group, with the model's raw reading for diagnosis."""
    context = ClarifyContext(original=group["original"], clarify_question=group["clarify_question"])
    reading = await intent.read(infra, group["reply"], context)
    seen = decide(
        reading,
        text=group["reply"],
        threshold=infra.settings.intent_confidence_threshold,
        today=infra.today(),
        context=context,
    )
    return {
        "id": group["id"],
        "answers": seen.answers_clarification,
        "intent": seen.intent.value,
        "confidence": seen.confidence,
        "uncertain": seen.uncertain,
        "record_text": seen.record_text,
        "question": seen.question,
        "occurred": None if seen.occurred is None else seen.occurred.isoformat(),
        "round1": await first_round(infra, group["original"]),
        "raw": reading.model_dump(mode="json"),
    }


def vague_samples() -> list[dict[str, Any]]:
    """The intent eval's 模糊句, with the split each belongs to."""
    lines = intent_eval.SAMPLES_PATH.read_text(encoding="utf-8").splitlines()
    samples = [json.loads(line) for line in lines if line.strip()]
    split = intent_eval.load_scorer().load_split()
    where = {sid: name for name, ids in split.items() for sid in ids}
    return [{**s, "split": where.get(s["id"])} for s in samples if s["category"] == VAGUE_CATEGORY]


async def run(
    infra: Infra, groups: list[Group], vague: list[dict[str, Any]] | None = None
) -> tuple[list[dict[str, Any]], dict[str, Any]]:
    """Predict every group (a few at a time) and score; returns (predictions, report).

    ``vague``: extra originals for round 1 (default: the intent eval's 模糊句)."""
    vague = vague_samples() if vague is None else vague
    gate = asyncio.Semaphore(CONCURRENCY)
    errors: dict[str, str] = {}

    async def guarded(key: str, work: Any) -> Any:
        async with gate:
            try:
                return await work
            except Exception as exc:  # one failed sample must not stop the run
                logger.warning("clarify eval: %s failed: %r", key, exc)
                errors[key] = f"{type(exc).__name__}: {str(exc)[:200]}"
                return None

    results = await asyncio.gather(*(guarded(g["id"], predict(infra, g)) for g in groups))
    firsts = await asyncio.gather(*(guarded(s["id"], first_round(infra, s["text"])) for s in vague))
    predictions = [p for p in results if p is not None]
    extra = [
        {"id": s["id"], "split": s.get("split"), "text": s["text"], **r}
        for s, r in zip(vague, firsts, strict=True)
        if r is not None
    ]
    scorer = load_scorer()
    by_id = {p["id"]: p for p in predictions}
    report: dict[str, Any] = scorer.score(groups, by_id, extra)
    report["splits"] = scorer.score_by_split(
        groups,
        by_id,
        {name: [e for e in extra if e["split"] == name] for name in scorer.SPLITS},
    )
    report["round1_vague"] = extra
    report["errors"] = errors
    return predictions, report


__all__ = [
    "GROUPS_PATH",
    "eval_clock",
    "first_round",
    "load_scorer",
    "predict",
    "run",
    "vague_samples",
]
