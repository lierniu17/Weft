"""反问 eval (intent-clarify AC-9): the dataset is well-formed, the split is fixed, the scorer
computes its metrics, and the recognition prompt's examples are invented (none taken from
the clarify groups, the intent eval or the user samples).

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
from weft.services.intent import INTENT_CONTEXT_SYSTEM

pytestmark = pytest.mark.unit

EVAL_DIR = Path(__file__).resolve().parents[2] / "eval" / "intent"
TODAY = PartialDate(2026, 11, 16).first_day()


def _load_score() -> ModuleType:
    spec = importlib.util.spec_from_file_location(
        "weft_eval_clarify_score", EVAL_DIR / "clarify_score.py"
    )
    assert spec is not None and spec.loader is not None
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


score = _load_score()


def _groups() -> list[dict[str, Any]]:
    return list(score.read_jsonl(EVAL_DIR / "clarify.jsonl"))


# --- the dataset -------------------------------------------------------------------------


def test_dataset_has_30_groups_across_the_six_kinds() -> None:
    groups = _groups()
    assert len(groups) == 30
    assert len({g["id"] for g in groups}) == 30
    assert len({g["original"] for g in groups}) == 30
    assert Counter(g["category"] for g in groups) == {c: 5 for c in score.CATEGORIES}


@pytest.mark.parametrize("group", _groups(), ids=lambda g: g["id"])
def test_group_gold_is_valid(group: dict[str, Any]) -> None:
    gold = group["gold"]
    for key in ("original", "clarify_question", "reply"):
        assert group[key] and group[key].strip() == group[key]
    assert isinstance(gold["answers"], bool) and gold["intent"] in score.INTENTS
    for word in gold.get("has", []):
        assert word in group["original"] + group["reply"] or len(word) == 1, word
    if gold.get("occurred") is not None:
        PartialDate.parse(gold["occurred"]).ensure_not_future(today=TODAY)


def test_category_gold_follows_the_spec() -> None:
    by_category: dict[str, Counter[tuple[bool, str]]] = {}
    for g in _groups():
        key = (g["gold"]["answers"], g["gold"]["intent"])
        by_category.setdefault(g["category"], Counter())[key] += 1
    assert by_category["回答后记录"] == {(True, "record"): 5}
    assert by_category["回答后提问"] == {(True, "ask"): 5}
    assert by_category["补充信息"] == {(True, "record"): 5}
    assert by_category["仍然含糊"] == {(True, "chitchat"): 5}  # no second 反问: 拿不准
    assert by_category["算了"] == {(True, "chitchat"): 5}
    assert all(answers is False for answers, _ in by_category["换话题"])
    assert len({intent for _, intent in by_category["换话题"]}) >= 3  # records, asks, chitchat


def test_the_split_is_the_seeded_stratified_split() -> None:
    groups = _groups()
    committed = json.loads((EVAL_DIR / "clarify-split.json").read_text(encoding="utf-8"))
    assert committed == score.make_split(groups)
    assert committed["seed"] == 42
    dev, heldout = set(committed["dev"]), set(committed["heldout"])
    assert not dev & heldout and dev | heldout == {g["id"] for g in groups}
    assert (len(dev), len(heldout)) == (12, 18)


# --- the prompt's examples are invented ------------------------------------------------


def _prompt_examples() -> list[str]:
    return [q for q in re.findall(r"“([^”]+)”", INTENT_CONTEXT_SYSTEM) if len(q) >= 4]


def _eval_texts() -> list[tuple[str, str]]:
    texts = []
    for g in _groups():
        texts += [(g["id"], g["original"]), (g["id"], g["reply"])]
    for name in ("samples.jsonl", "user-samples.jsonl"):
        texts += [(s["id"], s["text"]) for s in score.read_jsonl(EVAL_DIR / name)]
    return texts


def test_the_prompt_quotes_none_of_the_eval_texts() -> None:
    examples = _prompt_examples()
    assert len(examples) >= 15
    for sid, text in _eval_texts():
        if len(text) < 4:
            continue  # 「算了算了」-like replies are too short to be a borrowed example
        assert text not in INTENT_CONTEXT_SYSTEM, sid
        for example in examples:
            assert example not in text and text not in example, (sid, example)


# --- the scorer --------------------------------------------------------------------------


def _group(gid: str, category: str, answers: bool, intent: str, **gold: Any) -> dict[str, Any]:
    return {
        "id": gid,
        "category": category,
        "original": "原话",
        "clarify_question": "反问",
        "reply": "回答",
        "gold": {"answers": answers, "intent": intent, **gold},
    }


def _pred(answers: bool, intent: str, **kw: Any) -> dict[str, Any]:
    return {"answers": answers, "intent": intent, **kw}


def _r1(uncertain: bool, valid: bool) -> dict[str, Any]:
    return {"uncertain": uncertain, "valid_clarify": valid}


def test_perfect_predictions_pass() -> None:
    groups = [
        _group("r", "回答后记录", True, "record", has=["老钟"]),
        _group("a", "回答后提问", True, "ask", has=["阿亮"]),
        _group("t", "换话题", False, "record"),
        _group("v", "仍然含糊", True, "chitchat"),
    ]
    predictions = {
        "r": _pred(True, "record", record_text="老钟在减肥", round1=_r1(True, True)),
        "a": _pred(True, "ask", question="阿亮在干嘛？", round1=_r1(True, True)),
        "t": _pred(False, "record", round1=_r1(True, True)),
        "v": _pred(True, "chitchat", round1=_r1(True, True)),
    }
    report = score.score(groups, predictions)
    assert report["merged_intent_accuracy"] == report["answers_accuracy"] == 1.0
    assert report["false_record_rate"] == 0.0 and report["valid_clarify_rate"] == 1.0
    assert report["merged_text_accuracy"] == 1.0
    assert report["passed"] and report["mistakes"] == []


def test_the_metrics() -> None:
    groups = [
        _group("r1", "回答后记录", True, "record", has=["老钟", "减肥"]),
        _group("r2", "补充信息", True, "record", occurred="2026-10"),
        _group("t1", "换话题", False, "record"),  # merged into the original: a wrong record
        _group("t2", "换话题", False, "chitchat"),
        _group("v1", "仍然含糊", True, "chitchat"),  # recorded although still vague
        _group("n1", "算了", True, "chitchat"),
    ]
    predictions = {
        "r1": _pred(True, "record", record_text="老钟最近很忙", round1=_r1(True, False)),
        "r2": _pred(True, "record", occurred="2026-10", round1=_r1(False, False)),
        "t1": _pred(True, "record", round1=_r1(True, True)),
        "t2": _pred(False, "chitchat"),
        "v1": _pred(True, "record"),
        "n1": _pred(False, "chitchat"),
    }
    extra = [{"id": "ambig-1", **_r1(True, True)}, {"id": "ambig-2", **_r1(True, False)}]
    report = score.score(groups, predictions, extra)
    assert report["merged_intent_accuracy"] == pytest.approx(5 / 6)
    assert report["answers_accuracy"] == pytest.approx(4 / 6)
    assert report["false_record_rate"] == pytest.approx(2 / 4)
    assert report["valid_clarify_rate"] == pytest.approx(2 / 4)  # r1, t1, ambig-1, ambig-2
    assert report["counts"]["round1_not_uncertain"] == ["r2"]
    assert report["counts"]["invalid_clarify"] == ["ambig-2", "r1"]
    assert report["merged_text_accuracy"] == 0.0 and report["time_accuracy"] == 1.0
    assert not report["passed"]
    wrong = {m["id"]: m["wrong"] for m in report["mistakes"]}
    assert wrong == {
        "r1": ["merged_text"],
        "t1": ["answers", "false_record"],
        "v1": ["intent", "false_record"],
        "n1": ["answers"],
    }


def test_a_missing_prediction_counts_as_wrong_and_fails_the_run() -> None:
    groups = [_group("r", "回答后记录", True, "record"), _group("n", "算了", True, "chitchat")]
    report = score.score(groups, {"n": _pred(True, "chitchat", round1=_r1(True, True))})
    assert report["missing_predictions"] == ["r"] and not report["passed"]


def test_scores_by_split() -> None:
    groups = _groups()
    gold = {
        g["id"]: _pred(
            g["gold"]["answers"],
            g["gold"]["intent"],
            record_text=g["original"] + g["reply"],
            question=g["original"] + g["reply"],
            occurred=g["gold"].get("occurred"),
            round1=_r1(True, True),
        )
        for g in groups
    }
    splits = score.score_by_split(groups, gold, {"heldout": [{"id": "x", **_r1(True, False)}]})
    assert set(splits) == {"dev", "heldout"}
    assert splits["dev"]["groups"] == 12 and splits["heldout"]["groups"] == 18
    assert splits["dev"]["passed"]
    assert splits["heldout"]["valid_clarify_rate"] == pytest.approx(18 / 19)
