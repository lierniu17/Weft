"""Intent eval (AC-11): the dataset is well-formed, the split is fixed, the scorer computes the
four metrics, and the recognition prompt's examples are invented (none from the eval set).

The real run (calling DeepSeek) is manual; these tests never call any API.
"""

from __future__ import annotations

import importlib.util
import json
import re
from collections import Counter
from pathlib import Path
from types import ModuleType
from typing import Any

import pytest

from weft.domain.dates import PartialDate
from weft.services.intent import INTENT_SYSTEM

pytestmark = pytest.mark.unit

EVAL_DIR = Path(__file__).resolve().parents[2] / "eval" / "intent"
TODAY = PartialDate(2026, 11, 16).first_day()
CATEGORIES = {
    "记录",
    "提问",
    "混合",
    "寒暄",
    "陈述句式的提问",
    "反问",
    "带时间的补记",
    "模糊句",
}


def _load_score() -> ModuleType:
    spec = importlib.util.spec_from_file_location("weft_eval_intent_score", EVAL_DIR / "score.py")
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


score = _load_score()


def _samples() -> list[dict[str, Any]]:
    return list(score.read_jsonl(EVAL_DIR / "samples.jsonl"))


# --- the dataset -------------------------------------------------------------------------


def test_dataset_has_120_samples_across_the_eight_kinds() -> None:
    samples = _samples()
    assert len(samples) == 120
    assert len({s["id"] for s in samples}) == 120
    assert len({s["text"] for s in samples}) == 120
    assert Counter(s["category"] for s in samples) == {c: 15 for c in CATEGORIES}
    intents = Counter(s["gold"]["intent"] for s in samples)
    assert set(intents) == set(score.INTENTS)


@pytest.mark.parametrize("sample", _samples(), ids=lambda s: s["id"])
def test_sample_gold_is_valid(sample: dict[str, Any]) -> None:
    gold = sample["gold"]
    assert gold["intent"] in score.INTENTS
    assert sample["text"].strip() == sample["text"] and sample["text"]
    if gold["intent"] in score.RECORDING:
        assert "occurred" in gold  # every record is time-scored (null = today)
    else:
        assert "occurred" not in gold
    if gold.get("occurred") is not None:
        PartialDate.parse(gold["occurred"]).ensure_not_future(today=TODAY)


def test_category_gold_follows_the_spec() -> None:
    by_category: dict[str, Counter[str]] = {}
    for s in _samples():
        by_category.setdefault(s["category"], Counter())[s["gold"]["intent"]] += 1
    assert by_category["记录"] == {"record": 15}
    assert by_category["提问"] == {"ask": 15}
    assert by_category["陈述句式的提问"] == {"ask": 15}
    assert by_category["混合"] == {"record_ask": 15}
    assert by_category["寒暄"] == {"chitchat": 15}
    assert by_category["模糊句"] == {"chitchat": 15}  # 拿不准 -> 无关
    assert by_category["带时间的补记"] == {"record": 15}
    assert by_category["反问"]["record"] >= 10  # rhetorical lines mostly carry information
    backfill = [s for s in _samples() if s["category"] == "带时间的补记"]
    assert all(s["gold"]["occurred"] for s in backfill)  # every one names a time


def test_the_split_is_the_seeded_stratified_split() -> None:
    samples = _samples()
    committed = json.loads((EVAL_DIR / "split.json").read_text(encoding="utf-8"))
    assert committed == score.make_split(samples)
    assert committed["seed"] == 42
    dev, heldout = set(committed["dev"]), set(committed["heldout"])
    assert not dev & heldout and dev | heldout == {s["id"] for s in samples}
    assert (len(dev), len(heldout)) == (56, 64)


# --- the prompt's examples are invented ------------------------------------------------


def _prompt_examples() -> list[str]:
    return [q for q in re.findall(r"“([^”]+)”", INTENT_SYSTEM) if len(q) >= 4]


def test_the_prompt_quotes_none_of_the_eval_samples() -> None:
    examples = _prompt_examples()
    assert len(examples) >= 10
    for s in _samples():
        assert s["text"] not in INTENT_SYSTEM, s["id"]
        for example in examples:
            assert example not in s["text"] and s["text"] not in example, (s["id"], example)


# --- the scorer --------------------------------------------------------------------------


def _sample(sid: str, intent: str, occurred: str | None = None, *, timed: bool = False) -> Any:
    gold: dict[str, Any] = {"intent": intent}
    if timed or intent in score.RECORDING:
        gold["occurred"] = occurred
    return {"id": sid, "category": "x", "text": sid, "gold": gold}


def _pred(intent: str, occurred: str | None = None) -> dict[str, Any]:
    return {"intent": intent, "occurred": occurred}


def test_perfect_predictions_pass() -> None:
    samples = [
        _sample("r", "record", "2015"),
        _sample("a", "ask"),
        _sample("m", "record_ask", None),
        _sample("c", "chitchat"),
    ]
    predictions = {
        "r": _pred("record", "2015"),
        "a": _pred("ask"),
        "m": _pred("record_ask", "2026-11-16"),  # today, said explicitly = null
        "c": _pred("chitchat"),
    }
    report = score.score(samples, predictions)
    assert report["accuracy"] == 1.0 and report["time_accuracy"] == 1.0
    assert report["record_miss_rate"] == 0.0 and report["false_record_rate"] == 0.0
    assert report["passed"] and report["mistakes"] == []


def test_the_four_metrics() -> None:
    samples = [
        _sample("r1", "record", "2015"),
        _sample("r2", "record", None),
        _sample("r3", "record", "2026-10"),
        _sample("m1", "record_ask", None),
        _sample("c1", "chitchat"),
        _sample("c2", "chitchat"),
        _sample("a1", "ask"),
        _sample("a2", "ask"),
    ]
    predictions = {
        "r1": _pred("record", "2015-07"),  # right intent, too precise a date
        "r2": _pred("ask"),  # a lost record
        "r3": _pred("record", "2026-10"),
        "m1": _pred("record"),  # wrong intent, but the record is kept
        "c1": _pred("record_ask"),  # an unwanted draft
        "c2": _pred("chitchat"),
        "a1": _pred("chitchat"),
        "a2": _pred("ask"),
    }
    report = score.score(samples, predictions)
    assert report["accuracy"] == pytest.approx(4 / 8)
    assert report["record_miss_rate"] == pytest.approx(1 / 4)
    assert report["false_record_rate"] == pytest.approx(1 / 2)
    assert report["time_accuracy"] == pytest.approx(3 / 4)
    assert not report["passed"]
    assert {m["id"] for m in report["mistakes"]} == {"r1", "r2", "m1", "c1", "a1"}
    assert report["confusion"]["record->ask"] == 1


def test_a_missing_prediction_counts_as_wrong_and_fails_the_run() -> None:
    samples = [_sample("r", "record", None), _sample("c", "chitchat")]
    report = score.score(samples, {"c": _pred("chitchat")})
    assert report["missing_predictions"] == ["r"]
    assert report["record_miss_rate"] == 1.0 and not report["passed"]


def test_scores_by_split() -> None:
    samples = _samples()
    gold = {s["id"]: _pred(s["gold"]["intent"], s["gold"].get("occurred")) for s in samples}
    splits = score.score_by_split(samples, gold)
    assert set(splits) == {"dev", "heldout"}
    assert splits["dev"]["samples"] == 56 and splits["heldout"]["samples"] == 64
    assert all(part["passed"] for part in splits.values())


def test_the_command_line_scores_a_predictions_file(tmp_path: Path) -> None:
    samples = _samples()
    lines = [
        json.dumps({"id": s["id"], **_pred(s["gold"]["intent"], s["gold"].get("occurred"))})
        for s in samples
    ]
    path = tmp_path / "predictions.jsonl"
    path.write_text("\n".join(lines), encoding="utf-8")
    assert score.main([str(path), "--split", "heldout"]) == 0
