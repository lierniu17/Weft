"""Score intent predictions against eval/intent/samples.jsonl (intent-routing spec AC-11).

Usage::

    uv run python eval/intent/score.py predictions.jsonl [--samples samples.jsonl]
                                       [--split dev|heldout]

``predictions.jsonl``: one ``{"id", "intent", "occurred", "uncertain"}`` per line —
``intent`` is the routed intent (after the confidence threshold: a 拿不准 message is
``chitchat``), ``occurred`` the recognized date (``YYYY[-MM[-DD]]`` or null for today).
Prints a JSON report; exits 1 when any metric misses its threshold.

Metrics (AC-11):

* ``accuracy`` — predicted intent equals the gold intent, over all samples (≥ 0.95).
* ``record_miss_rate`` — of the samples whose gold intent records something (``record``,
  ``record_ask``), the share predicted ``ask`` or ``chitchat``: the new information would be
  lost (≤ 0.02).
* ``false_record_rate`` — of the samples whose gold intent is ``chitchat`` (寒暄, 模糊句 and
  rhetorical lines without information), the share predicted ``record`` or ``record_ask``:
  a Draft nobody wanted (≤ 0.05).
* ``time_accuracy`` — of the samples whose gold has ``occurred`` (every gold record), the
  share whose predicted date equals it, precision included; null means today (≥ 0.90).

``split.json`` fixes the dev / held-out split (stratified by category, seeded): prompts are
tuned on the dev split only, and AC-11 passes or fails on the held-out split.

Standard library only, so it can be run without the app installed.
"""

from __future__ import annotations

import argparse
import json
import random
import sys
from collections import Counter, defaultdict
from collections.abc import Mapping
from pathlib import Path
from typing import Any

INTENTS = ("record", "ask", "record_ask", "chitchat")
RECORDING = frozenset({"record", "record_ask"})
NOT_RECORDING = frozenset({"ask", "chitchat"})
THRESHOLDS = {
    "accuracy": ("min", 0.95),
    "record_miss_rate": ("max", 0.02),
    "false_record_rate": ("max", 0.05),
    "time_accuracy": ("min", 0.90),
}
TODAY = "2026-11-16"  # the eval clock (Beijing); null occurred means this day
DEFAULT_SAMPLES = Path(__file__).with_name("samples.jsonl")
SPLIT_PATH = Path(__file__).with_name("split.json")
SPLIT_SEED = 42
DEV_PER_CATEGORY = 7  # of 15 per category -> 56 dev / 64 held-out
SPLITS = ("dev", "heldout")

Item = dict[str, Any]


def _ratio(num: int, den: int) -> float:
    return num / den if den else 0.0


def _day(value: str | None) -> str:
    return value or TODAY


def score(samples: list[Item], predictions: Mapping[str, Mapping[str, Any]]) -> dict[str, Any]:
    correct = 0
    recording = missed = 0
    idle = false_records = 0
    timed = time_correct = 0
    missing: list[str] = []
    mistakes: list[dict[str, Any]] = []
    confusion: Counter[str] = Counter()

    for sample in samples:
        gold = sample["gold"]
        pred = predictions.get(sample["id"])
        if pred is None:
            missing.append(sample["id"])
            pred = {"intent": None, "occurred": None}
        got = pred.get("intent")
        confusion[f"{gold['intent']}->{got}"] += 1
        wrong: dict[str, Any] = {}
        if got == gold["intent"]:
            correct += 1
        else:
            wrong["intent"] = got
        if gold["intent"] in RECORDING:
            recording += 1
            missed += int(got in NOT_RECORDING or got is None)
        if gold["intent"] == "chitchat":
            idle += 1
            false_records += int(got in RECORDING)
        if "occurred" in gold:
            timed += 1
            if _day(pred.get("occurred")) == _day(gold["occurred"]):
                time_correct += 1
            else:
                wrong["occurred"] = pred.get("occurred")
        if wrong:
            mistakes.append(
                {
                    "id": sample["id"],
                    "text": sample["text"],
                    "gold": gold,
                    "got": {"intent": got, "occurred": pred.get("occurred")},
                    "confidence": pred.get("confidence"),
                    "wrong": sorted(wrong),
                }
            )

    report: dict[str, Any] = {
        "samples": len(samples),
        "accuracy": _ratio(correct, len(samples)),
        "record_miss_rate": _ratio(missed, recording),
        "false_record_rate": _ratio(false_records, idle),
        "time_accuracy": _ratio(time_correct, timed),
        "counts": {
            "correct": correct,
            "recording": recording,
            "missed_records": missed,
            "chitchat": idle,
            "false_records": false_records,
            "timed": timed,
            "time_correct": time_correct,
        },
        "confusion": dict(sorted(confusion.items())),
        "missing_predictions": missing,
        "mistakes": mistakes,
        "thresholds": {k: {"min" if d == "min" else "max": v} for k, (d, v) in THRESHOLDS.items()},
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
    samples: list[Item], *, seed: int = SPLIT_SEED, dev_per_category: int = DEV_PER_CATEGORY
) -> dict[str, Any]:
    """Stratified by category: ``dev_per_category`` random samples of each go to dev."""
    by_category: dict[str, list[str]] = defaultdict(list)
    for sample in samples:
        by_category[sample["category"]].append(sample["id"])
    rng = random.Random(seed)
    dev: list[str] = []
    for category in sorted(by_category):
        dev += sorted(rng.sample(sorted(by_category[category]), dev_per_category))
    chosen = set(dev)
    heldout = [s["id"] for s in samples if s["id"] not in chosen]
    return {"seed": seed, "dev_per_category": dev_per_category, "dev": dev, "heldout": heldout}


def load_split(path: Path = SPLIT_PATH) -> dict[str, list[str]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    return {name: list(data[name]) for name in SPLITS}


def select(samples: list[Item], split: str | None, path: Path = SPLIT_PATH) -> list[Item]:
    """The samples of one split (all of them for ``None``), in file order."""
    if split is None:
        return samples
    wanted = set(load_split(path)[split])
    return [s for s in samples if s["id"] in wanted]


def score_by_split(
    samples: list[Item], predictions: Mapping[str, Mapping[str, Any]], path: Path = SPLIT_PATH
) -> dict[str, dict[str, Any]]:
    """``score`` for each split's samples among ``samples`` (empty splits are left out)."""
    out = {}
    for name in SPLITS:
        part = select(samples, name, path)
        if part:
            report = score(part, predictions)
            out[name] = {k: v for k, v in report.items() if k != "thresholds"}
    return out


def read_jsonl(path: Path) -> list[Item]:
    lines = path.read_text(encoding="utf-8").splitlines()
    return [json.loads(line) for line in lines if line.strip()]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=(__doc__ or "").splitlines()[0])
    parser.add_argument("predictions", type=Path)
    parser.add_argument("--samples", type=Path, default=DEFAULT_SAMPLES)
    parser.add_argument("--split", choices=SPLITS, default=None)
    args = parser.parse_args(argv)

    samples = select(read_jsonl(args.samples), args.split)
    predictions = {row["id"]: row for row in read_jsonl(args.predictions)}
    report = score(samples, predictions)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    sys.exit(main())
