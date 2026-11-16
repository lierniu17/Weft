"""Extraction eval: the dataset is well-formed and the scorer computes AC-42 metrics.

The real run (calling DeepSeek) is manual; these tests never call any API.
"""

import importlib.util
import json
from collections import Counter
from pathlib import Path
from types import ModuleType
from typing import Any

import pytest

from weft.domain.confidence import Confidence, ConflictAction, resolve_conflict
from weft.domain.dates import PartialDate
from weft.domain.draft import Draft, PersonMatch
from weft.domain.taxonomy import BUILTIN

pytestmark = pytest.mark.unit

EVAL_DIR = Path(__file__).resolve().parents[2] / "eval" / "extraction"
TODAY = PartialDate(2026, 11, 16).first_day()


def _load_score() -> ModuleType:
    spec = importlib.util.spec_from_file_location("weft_eval_score", EVAL_DIR / "score.py")
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


score = _load_score()


# --- the dataset -------------------------------------------------------------


def _samples() -> list[dict[str, Any]]:
    lines = (EVAL_DIR / "samples.jsonl").read_text(encoding="utf-8").splitlines()
    return [json.loads(line) for line in lines if line.strip()]


def test_dataset_has_fifty_samples_ten_per_category() -> None:
    samples = _samples()
    assert len(samples) == 50
    assert len({s["id"] for s in samples}) == 50
    assert Counter(s["category"] for s in samples) == {
        "口语": 10,
        "补记": 10,
        "同名": 10,
        "转述": 10,
        "冲突": 10,
    }


@pytest.mark.parametrize("sample", _samples(), ids=lambda s: s["id"])
def test_sample_gold_is_a_valid_draft(sample: dict[str, Any]) -> None:
    occurred = PartialDate.parse(sample["occurred_date"])
    assert occurred.precision.value == sample["precision"]
    occurred.ensure_not_future(today=TODAY)

    gold = Draft.model_validate(sample["gold"])
    context_ids = {p["id"] for p in sample["graph_context"]["persons"]}
    assert "self" in context_ids

    for person in gold.persons:
        if person.match is PersonMatch.MATCHED:
            assert person.person_id in context_ids
        for candidate in person.candidates or []:
            assert candidate.person_id in context_ids

    for rel in gold.relationships:
        for t in rel.types:
            assert BUILTIN.contains(t.category, t.subtype), (t.category, t.subtype)

    # AC-8: never more precise than the Entry
    for value in [f.valid_at for f in gold.facts] + [r.met_at for r in gold.relationships]:
        if value is not None:
            assert value.precision.level <= occurred.precision.level

    old_conf = {
        f["object"]: Confidence(f["confidence"]) for f in sample["graph_context"].get("facts", [])
    }
    for fact in gold.facts:
        if fact.conflict is not None:
            expected = resolve_conflict(old=old_conf[fact.conflict.old], new=fact.confidence)
            assert fact.conflict.action is expected


def test_conflict_category_covers_both_update_and_unverified() -> None:
    actions = Counter(
        f["conflict"]["action"]
        for s in _samples()
        if s["category"] == "冲突"
        for f in s["gold"]["facts"]
        if "conflict" in f
    )
    assert actions[ConflictAction.UPDATE.value] >= 3
    assert actions[ConflictAction.UNVERIFIED.value] >= 3


# --- the scorer on tiny hand-made predictions --------------------------------


GOLD = {
    "id": "t-1",
    "gold": {
        "persons": [
            {"mention": "我", "match": "matched", "person_id": "self"},
            {"mention": "老张", "match": "matched", "person_id": "p-zw"},
            {"mention": "小李", "match": "new"},
        ],
        "facts": [
            {"subject": "老张", "predicate": "LIKES", "object": "钓鱼", "confidence": "self_told"},
            {
                "subject": "小李",
                "predicate": "WORKS_AT",
                "object": "阿里巴巴",
                "confidence": "hearsay",
            },
        ],
        "relationships": [
            {
                "pair": ["老张", "小李"],
                "types": [
                    {"category": "social", "subtype": "室友", "original": "大学室友"},
                    {"category": "hostile", "subtype": "矛盾", "original": "闹掰"},
                ],
                "confidence": "hearsay",
            }
        ],
        "feelings": [
            {
                "from": "我",
                "to": "老张",
                "dimension": "trust",
                "level": "high",
                "confidence": "witnessed",
            }
        ],
    },
}


def test_perfect_prediction_scores_one() -> None:
    report = score.score([GOLD], {"t-1": GOLD["gold"]})
    assert report["person_f1"] == 1.0
    assert report["relationship_type_accuracy"] == 1.0
    assert report["confidence_accuracy"] == 1.0
    assert report["passed"] is True


def test_person_f1_ignores_self_and_counts_wrong_match_as_fp_and_fn() -> None:
    pred = {
        "persons": [
            {"mention": "老张", "match": "new"},  # wrong: should be matched p-zw
            {"mention": "小李", "match": "new"},  # right
        ]
    }
    report = score.score([GOLD], {"t-1": pred})
    # tp=1, fp=1, fn=1 -> P=R=0.5 -> F1=0.5
    assert report["person_f1"] == pytest.approx(0.5)
    assert report["passed"] is False


def test_relationship_type_accuracy_is_per_gold_type_and_pair_is_unordered() -> None:
    pred = {
        "relationships": [
            {
                "pair": ["小李", "老张"],
                "types": [
                    {"category": "social", "subtype": "同学", "original": "同学"},
                    {"category": "hostile", "subtype": "矛盾", "original": "闹翻"},
                ],
                "confidence": "hearsay",
            }
        ]
    }
    assert score.score([GOLD], {"t-1": pred})["relationship_type_accuracy"] == pytest.approx(0.5)


def test_confidence_accuracy_over_matched_items_with_coverage() -> None:
    pred = {
        "facts": [
            # matches gold 钓鱼 fact (object substring), confidence wrong
            {
                "subject": "老张",
                "predicate": "LIKES",
                "object": "钓鱼和露营",
                "confidence": "witnessed",
            },
            # matches gold 阿里 fact, confidence right
            {"subject": "小李", "predicate": "WORKS_AT", "object": "阿里", "confidence": "hearsay"},
        ],
        "feelings": [
            {
                "from": "我",
                "to": "老张",
                "dimension": "trust",
                "level": "medium",
                "confidence": "witnessed",
            }
        ],
    }
    report = score.score([GOLD], {"t-1": pred})
    # 3 of 4 gold items matched (relationship missing); 2 of 3 matched have right confidence
    assert report["confidence_accuracy"] == pytest.approx(2 / 3)
    assert report["confidence_coverage"] == pytest.approx(3 / 4)


def test_missing_prediction_counts_as_empty() -> None:
    report = score.score([GOLD], {})
    assert report["person_f1"] == 0.0
    assert report["relationship_type_accuracy"] == 0.0
    assert report["missing_predictions"] == ["t-1"]


def test_cli_reads_jsonl_and_exits_nonzero_below_threshold(tmp_path: Path) -> None:
    samples = tmp_path / "s.jsonl"
    samples.write_text(json.dumps(GOLD, ensure_ascii=False) + "\n", encoding="utf-8")
    preds = tmp_path / "p.jsonl"
    preds.write_text(
        json.dumps({"id": "t-1", "draft": GOLD["gold"]}, ensure_ascii=False) + "\n",
        encoding="utf-8",
    )
    assert score.main([str(preds), "--samples", str(samples)]) == 0
    preds.write_text(json.dumps({"id": "t-1", "draft": {}}) + "\n", encoding="utf-8")
    assert score.main([str(preds), "--samples", str(samples)]) == 1
