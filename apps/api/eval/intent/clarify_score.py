"""Score 反问 (clarification) predictions against eval/intent/clarify.jsonl (intent-clarify AC-9).

Usage::

    uv run python eval/intent/clarify_score.py predictions.jsonl [--groups clarify.jsonl]
                                               [--split dev|heldout]

Each group is a vague message (``original``) the system was unsure about, the 反问 it asked
(``clarify_question``) and what the user typed next (``reply``). ``gold.answers``: the reply
answers the 反问; ``gold.intent``: how the reply is handled — for an answer, the intent of
原话 + 回答 merged (a still vague answer or 「算了」 is ``chitchat``); otherwise the reply's
own intent. ``gold.has``: words the merged record text / question must keep;
``gold.occurred``: the merged occurred date, where the reply gives one.

``predictions.jsonl``: one ``{"id", "answers", "intent", "record_text", "question",
"occurred", "round1"?}`` per line — ``intent`` after the confidence threshold, ``round1``
the original's own recognition ``{"uncertain", "valid_clarify"}``. Prints a JSON report;
exits 1 when any metric misses its threshold.

Metrics (AC-9, decided on the held-out split):

* ``merged_intent_accuracy`` — predicted intent equals the gold intent (≥ 0.90).
* ``answers_accuracy`` — 是否在回答反问 judged right (≥ 0.90).
* ``false_record_rate`` — of the 换话题 / 算了 / 仍然含糊 groups, the share where something is
  recorded that should not be: a record where gold has none, or a reply merged into the
  original (or kept apart) wrongly and recorded so (≤ 0.05).
* ``valid_clarify_rate`` — of the originals recognition was unsure about (round 1: these
  groups' originals plus the 模糊句 of the intent eval, passed in by the runner), the share
  that came with a usable 反问 (≥ 0.90).

Reported, not thresholded: ``merged_text_accuracy`` (the merged text keeps ``gold.has``),
``time_accuracy`` (merged occurred date) and the count of originals not judged 拿不准.

``clarify-split.json`` fixes the dev / held-out split (stratified by category, seed 42).
Standard library only, so it can be run without the app installed.
"""

from __future__ import annotations

import argparse
import json
import random
import sys
from collections import Counter, defaultdict
from collections.abc import Iterable, Mapping
from pathlib import Path
from typing import Any

INTENTS = ("record", "ask", "record_ask", "chitchat")
RECORDING = frozenset({"record", "record_ask"})
NO_RECORD_CATEGORIES = frozenset({"换话题", "算了", "仍然含糊"})
CATEGORIES = ("回答后记录", "回答后提问", "补充信息", "换话题", "仍然含糊", "算了")
THRESHOLDS = {
    "merged_intent_accuracy": ("min", 0.90),
    "answers_accuracy": ("min", 0.90),
    "false_record_rate": ("max", 0.05),
    "valid_clarify_rate": ("min", 0.90),
}
TODAY = "2026-11-16"  # the eval clock (Beijing); null occurred means this day
DEFAULT_GROUPS = Path(__file__).with_name("clarify.jsonl")
SPLIT_PATH = Path(__file__).with_name("clarify-split.json")
SPLIT_SEED = 42
DEV_PER_CATEGORY = 2  # of 5 per category -> 12 dev / 18 held-out
SPLITS = ("dev", "heldout")

Item = dict[str, Any]


def _ratio(num: int, den: int) -> float:
    return num / den if den else 0.0


def _merged_text(pred: Mapping[str, Any]) -> str:
    if pred.get("intent") == "ask":
        return str(pred.get("question") or "")
    if pred.get("intent") in RECORDING:
        return str(pred.get("record_text") or "")
    return ""


def score(
    groups: list[Item],
    predictions: Mapping[str, Mapping[str, Any]],
    extra_round1: Iterable[Mapping[str, Any]] = (),
) -> dict[str, Any]:
    """``extra_round1``: more originals' round-1 results ``{"id", "uncertain",
    "valid_clarify"}`` (the intent eval's 模糊句) for ``valid_clarify_rate``."""
    intent_ok = answers_ok = 0
    guarded = false_records = 0
    texted = text_ok = 0
    timed = time_ok = 0
    missing: list[str] = []
    mistakes: list[dict[str, Any]] = []
    confusion: Counter[str] = Counter()
    round1: list[Mapping[str, Any]] = []

    for group in groups:
        gold = group["gold"]
        pred = predictions.get(group["id"])
        if pred is None:
            missing.append(group["id"])
            pred = {}
        if isinstance(pred.get("round1"), Mapping):
            round1.append({"id": group["id"], **pred["round1"]})
        got = pred.get("intent")
        confusion[f"{gold['intent']}->{got}"] += 1
        wrong: list[str] = []
        if got == gold["intent"]:
            intent_ok += 1
        else:
            wrong.append("intent")
        if pred.get("answers") is gold["answers"]:
            answers_ok += 1
        else:
            wrong.append("answers")
        if group["category"] in NO_RECORD_CATEGORIES:
            guarded += 1
            should_record = gold["intent"] in RECORDING
            recorded_wrongly = got in RECORDING and (
                not should_record or pred.get("answers") is not gold["answers"]
            )
            if recorded_wrongly:
                false_records += 1
                wrong.append("false_record")
        if gold.get("has") and got == gold["intent"]:
            texted += 1
            text = _merged_text(pred)
            if all(word in text for word in gold["has"]):
                text_ok += 1
            else:
                wrong.append("merged_text")
        if "occurred" in gold and got == gold["intent"]:
            timed += 1
            if (pred.get("occurred") or TODAY) == (gold["occurred"] or TODAY):
                time_ok += 1
            else:
                wrong.append("occurred")
        if wrong:
            mistakes.append(
                {
                    "id": group["id"],
                    "original": group["original"],
                    "reply": group["reply"],
                    "gold": gold,
                    "got": {
                        k: pred.get(k)
                        for k in ("answers", "intent", "record_text", "question", "occurred")
                    },
                    "confidence": pred.get("confidence"),
                    "wrong": wrong,
                }
            )

    round1 += list(extra_round1)
    unsure = [r for r in round1 if r.get("uncertain")]
    valid = sum(1 for r in unsure if r.get("valid_clarify"))
    report: dict[str, Any] = {
        "groups": len(groups),
        "merged_intent_accuracy": _ratio(intent_ok, len(groups)),
        "answers_accuracy": _ratio(answers_ok, len(groups)),
        "false_record_rate": _ratio(false_records, guarded),
        "valid_clarify_rate": _ratio(valid, len(unsure)),
        "merged_text_accuracy": _ratio(text_ok, texted),
        "time_accuracy": _ratio(time_ok, timed),
        "counts": {
            "intent_correct": intent_ok,
            "answers_correct": answers_ok,
            "guarded": guarded,
            "false_records": false_records,
            "round1_originals": len(round1),
            "round1_uncertain": len(unsure),
            "round1_not_uncertain": sorted(str(r["id"]) for r in round1 if not r.get("uncertain")),
            "valid_clarify": valid,
            "invalid_clarify": sorted(str(r["id"]) for r in unsure if not r.get("valid_clarify")),
            "texted": texted,
            "text_correct": text_ok,
            "timed": timed,
            "time_correct": time_ok,
        },
        "confusion": dict(sorted(confusion.items())),
        "missing_predictions": missing,
        "mistakes": mistakes,
        "thresholds": {k: {d: v} for k, (d, v) in THRESHOLDS.items()},
    }
    report["passed"] = passed(report) and not missing
    return report


def passed(report: Mapping[str, Any]) -> bool:
    return all(
        report[k] >= v if direction == "min" else report[k] <= v
        for k, (direction, v) in THRESHOLDS.items()
    )


# --- dev / held-out split ------------------------------------------------------------


def make_split(
    groups: list[Item], *, seed: int = SPLIT_SEED, dev_per_category: int = DEV_PER_CATEGORY
) -> dict[str, Any]:
    """Stratified by category: ``dev_per_category`` random groups of each go to dev."""
    by_category: dict[str, list[str]] = defaultdict(list)
    for group in groups:
        by_category[group["category"]].append(group["id"])
    rng = random.Random(seed)
    dev: list[str] = []
    for category in sorted(by_category):
        dev += sorted(rng.sample(sorted(by_category[category]), dev_per_category))
    chosen = set(dev)
    heldout = [g["id"] for g in groups if g["id"] not in chosen]
    return {"seed": seed, "dev_per_category": dev_per_category, "dev": dev, "heldout": heldout}


def load_split(path: Path = SPLIT_PATH) -> dict[str, list[str]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    return {name: list(data[name]) for name in SPLITS}


def select(groups: list[Item], split: str | None, path: Path = SPLIT_PATH) -> list[Item]:
    """The groups of one split (all of them for ``None``), in file order."""
    if split is None:
        return groups
    wanted = set(load_split(path)[split])
    return [g for g in groups if g["id"] in wanted]


def score_by_split(
    groups: list[Item],
    predictions: Mapping[str, Mapping[str, Any]],
    extra_round1: Mapping[str, Iterable[Mapping[str, Any]]] | None = None,
    path: Path = SPLIT_PATH,
) -> dict[str, dict[str, Any]]:
    """``score`` for each split's groups among ``groups`` (empty splits are left out);
    ``extra_round1`` gives each split's extra round-1 originals."""
    out = {}
    for name in SPLITS:
        part = select(groups, name, path)
        if part:
            report = score(part, predictions, (extra_round1 or {}).get(name, ()))
            out[name] = {k: v for k, v in report.items() if k != "thresholds"}
    return out


def read_jsonl(path: Path) -> list[Item]:
    lines = path.read_text(encoding="utf-8").splitlines()
    return [json.loads(line) for line in lines if line.strip()]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=(__doc__ or "").splitlines()[0])
    parser.add_argument("predictions", type=Path)
    parser.add_argument("--groups", type=Path, default=DEFAULT_GROUPS)
    parser.add_argument("--split", choices=SPLITS, default=None)
    args = parser.parse_args(argv)

    groups = select(read_jsonl(args.groups), args.split)
    predictions = {row["id"]: row for row in read_jsonl(args.predictions)}
    report = score(groups, predictions)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    sys.exit(main())
