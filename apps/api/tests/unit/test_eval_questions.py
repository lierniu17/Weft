"""The 补充追问 eval dataset (eval/extraction/questions.jsonl) and its scorer
(conversation-context AC-13). Never calls an API."""

from __future__ import annotations

import importlib.util
import json
import random
from pathlib import Path
from types import ModuleType
from typing import Any

import pytest

from weft.domain.dates import PartialDate

pytestmark = pytest.mark.unit

EVAL_DIR = Path(__file__).resolve().parents[2] / "eval" / "extraction"


def _load() -> ModuleType:
    spec = importlib.util.spec_from_file_location(
        "weft_eval_questions_score", EVAL_DIR / "questions_score.py"
    )
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


score = _load()


def _samples() -> list[dict[str, Any]]:
    lines = (EVAL_DIR / "questions.jsonl").read_text(encoding="utf-8").splitlines()
    return [json.loads(line) for line in lines if line.strip()]


def test_the_dataset_has_records_to_ask_about_and_complete_ones() -> None:
    samples = _samples()
    assert len(samples) >= 15
    assert len({s["id"] for s in samples}) == len(samples)
    asked = [s for s in samples if s["gold"]["questions"]]
    complete = [s for s in samples if not s["gold"]["questions"]]
    assert {s["category"] for s in asked} == {"该追问"}
    assert {s["category"] for s in complete} == {"不该追问"}
    assert len(complete) >= 6
    fields = {q["field"] for s in asked for q in s["gold"]["questions"]}
    assert fields == set(score.FIELDS)
    for s in samples:
        assert len(s["gold"]["questions"]) <= 2
        PartialDate.parse(s["occurred_date"])
        assert any(p.get("is_self") for p in s["graph_context"]["persons"])


def test_the_committed_split_is_the_seeded_stratified_halving() -> None:
    samples = _samples()
    committed = json.loads((EVAL_DIR / "questions-split.json").read_text(encoding="utf-8"))
    rng = random.Random(committed["seed"])
    dev: list[str] = []
    for category in sorted({s["category"] for s in samples}):
        ids = sorted(s["id"] for s in samples if s["category"] == category)
        dev += sorted(rng.sample(ids, len(ids) // 2))
    assert committed["dev"] == dev
    assert committed["heldout"] == [s["id"] for s in samples if s["id"] not in dev]


def _sample(sid: str, gold: list[dict[str, Any]]) -> dict[str, Any]:
    return {"id": sid, "category": "x", "gold": {"questions": gold}}


def _asked(*fields: str, pair: list[str] | None = None) -> dict[str, Any]:
    return {"questions": [{"field": f, "pair": pair} for f in fields]}


def test_hits_false_questions_and_extras() -> None:
    samples = [
        _sample("a", [{"field": "relationship_type", "about": "小李"}]),
        _sample("b", [{"field": "occurred", "about": None}, {"field": "met", "about": "老韩"}]),
        _sample("c", []),
        _sample("d", []),
    ]
    predictions = {
        "a": _asked("relationship_type", "occurred", pair=["我", "小张"]),  # wrong person
        "b": _asked("occurred"),
        "c": _asked(),
        "d": _asked("met", pair=["我", "老王"]),
    }
    report = score.score(samples, predictions)
    assert (report["question_hits"], report["gold_questions"]) == (2, 3)
    assert report["about_hit_rate"] == pytest.approx(1 / 3)
    assert (report["false_questions"], report["complete_records"]) == (1, 2)
    assert report["false_question_rate"] == 0.5
    assert report["extra_questions"] == 1
    assert report["passed"] is False


def test_a_perfect_prediction_passes_and_a_missing_one_asks_nothing() -> None:
    samples = [_sample("a", [{"field": "met", "about": "老韩"}]), _sample("c", [])]
    perfect = score.score(samples, {"a": _asked("met", pair=["我", "老韩"]), "c": _asked()})
    assert perfect["passed"] is True and perfect["question_hit_rate"] == 1.0
    missing = score.score(samples, {})
    assert missing["missing_predictions"] == ["a", "c"]
    assert missing["question_hit_rate"] == 0.0 and missing["false_question_rate"] == 0.0


def test_cli_and_split_selection(tmp_path: Path) -> None:
    samples = tmp_path / "q.jsonl"
    samples.write_text(
        "\n".join(json.dumps(s) for s in [_sample("t-1", []), _sample("t-2", [])]),
        encoding="utf-8",
    )
    preds = tmp_path / "p.jsonl"
    preds.write_text(json.dumps({"id": "t-1", "draft": _asked("met")}), encoding="utf-8")
    assert score.main([str(preds), "--samples", str(samples)]) == 1  # 1 of 2 complete asked
    split = tmp_path / "split.json"
    split.write_text(json.dumps({"dev": ["t-1"], "heldout": ["t-2"]}), encoding="utf-8")
    rows = [_sample("t-1", []), _sample("t-2", [])]
    by_split = score.score_by_split(rows, {"t-1": _asked("met")}, split)
    assert by_split["dev"]["false_question_rate"] == 1.0
    assert by_split["heldout"]["false_question_rate"] == 0.0


def test_the_second_heldout_set_is_judged_on_its_own() -> None:
    """context-gaps AC-2: a new held-out set (questions-h2.jsonl), written before the fallback
    question; the original 17 samples are its dev set now."""
    lines = (EVAL_DIR / "questions-h2.jsonl").read_text(encoding="utf-8").splitlines()
    h2 = [json.loads(line) for line in lines if line.strip()]
    assert not {s["id"] for s in h2} & {s["id"] for s in _samples()}
    asked = [s for s in h2 if s["gold"]["questions"]]
    complete = [s for s in h2 if not s["gold"]["questions"]]
    assert {s["category"] for s in asked} == {"该追问"} and len(asked) >= 6
    assert {s["category"] for s in complete} == {"不该追问"} and len(complete) >= 5
    for s in h2:
        PartialDate.parse(s["occurred_date"])
        assert any(p.get("is_self") for p in s["graph_context"]["persons"])
