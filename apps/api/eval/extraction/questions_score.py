"""Score 补充追问 (Draft question) predictions against eval/extraction/questions.jsonl
(conversation-context AC-13).

Usage::

    uv run python eval/extraction/questions_score.py predictions.jsonl
                                                     [--samples questions.jsonl]
                                                     [--split dev|heldout]

``predictions.jsonl``: one ``{"id": <sample id>, "draft": <Draft JSON>}`` per line.
Prints a JSON report; exits 1 when a metric misses its threshold.

Each sample is an Entry whose ``gold.questions`` says what the Draft should ask:
``[{"field": "relationship_type" | "met" | "occurred", "about": <mention> | null}]``, or
``[]`` for a complete record that must not be asked about.

Metrics (decided on the held-out split):

* ``question_hit_rate`` — of the gold questions, the share whose field the Draft asks
  about (≥ 0.80). ``about_hit_rate`` (reported only) also wants the asked pair to contain
  the gold person.
* ``false_question_rate`` — of the complete records, the share that got any question
  (≤ 0.10).

Reported, not thresholded: ``extra_questions`` (questions about another field on records
that should be asked about). ``questions-split.json`` fixes the dev / held-out split
(stratified by category, seed 42), drawn before any prompt was written.

Standard library only, so it can be run without the app installed.
"""

from __future__ import annotations

import argparse
import json
import sys
from collections.abc import Mapping
from pathlib import Path
from typing import Any

THRESHOLDS = {
    "question_hit_rate": ("min", 0.80),
    "false_question_rate": ("max", 0.10),
}
FIELDS = ("relationship_type", "met", "occurred")
DEFAULT_SAMPLES = Path(__file__).with_name("questions.jsonl")
SPLIT_PATH = Path(__file__).with_name("questions-split.json")
SPLITS = ("dev", "heldout")

Item = dict[str, Any]


def _ratio(num: int, den: int) -> float:
    return num / den if den else 0.0


def _asked(draft: Mapping[str, Any]) -> list[Item]:
    return list(draft.get("questions") or [])


def score(samples: list[Item], predictions: Mapping[str, Mapping[str, Any]]) -> dict[str, Any]:
    gold_total = hits = about_hits = 0
    complete = false_questions = 0
    extra = 0
    missing: list[str] = []
    details: list[Item] = []
    for sample in samples:
        if sample["id"] not in predictions:
            missing.append(sample["id"])
        asked = _asked(predictions.get(sample["id"], {}))
        gold = sample["gold"]["questions"]
        fields = [q.get("field") for q in asked]
        row: Item = {"id": sample["id"], "gold": gold, "asked": asked}
        if not gold:
            complete += 1
            row["false_question"] = bool(asked)
            false_questions += int(bool(asked))
        else:
            row["hits"] = []
            for g in gold:
                gold_total += 1
                hit = g["field"] in fields
                hits += int(hit)
                pairs = [q.get("pair") or [] for q in asked if q.get("field") == g["field"]]
                about = hit and (g.get("about") is None or any(g["about"] in p for p in pairs))
                about_hits += int(about)
                row["hits"].append({"field": g["field"], "hit": hit, "about": about})
            wanted = {g["field"] for g in gold}
            extra += sum(1 for f in fields if f not in wanted)
        details.append(row)
    report: dict[str, Any] = {
        "samples": len(samples),
        "gold_questions": gold_total,
        "question_hits": hits,
        "question_hit_rate": _ratio(hits, gold_total),
        "about_hit_rate": _ratio(about_hits, gold_total),
        "complete_records": complete,
        "false_questions": false_questions,
        "false_question_rate": _ratio(false_questions, complete),
        "extra_questions": extra,
        "missing_predictions": missing,
        "thresholds": {k: list(v) for k, v in THRESHOLDS.items()},
        "details": details,
    }
    report["passed"] = all(
        report[k] >= v if kind == "min" else report[k] <= v for k, (kind, v) in THRESHOLDS.items()
    )
    return report


def load_split(path: Path = SPLIT_PATH) -> dict[str, list[str]]:
    data = json.loads(path.read_text(encoding="utf-8"))
    return {name: list(data[name]) for name in SPLITS}


def select(samples: list[Item], split: str | None, path: Path = SPLIT_PATH) -> list[Item]:
    if split is None:
        return samples
    wanted = set(load_split(path)[split])
    return [s for s in samples if s["id"] in wanted]


def score_by_split(
    samples: list[Item], predictions: Mapping[str, Mapping[str, Any]], path: Path = SPLIT_PATH
) -> dict[str, dict[str, Any]]:
    out = {}
    for name in SPLITS:
        part = select(samples, name, path)
        if part:
            report = score(part, predictions)
            out[name] = {k: v for k, v in report.items() if k not in ("thresholds", "details")}
    return out


def _read_jsonl(path: Path) -> list[Item]:
    lines = path.read_text(encoding="utf-8").splitlines()
    return [json.loads(line) for line in lines if line.strip()]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("predictions", type=Path)
    parser.add_argument("--samples", type=Path, default=DEFAULT_SAMPLES)
    parser.add_argument("--split", choices=SPLITS, default=None)
    args = parser.parse_args(argv)
    samples = select(_read_jsonl(args.samples), args.split)
    predictions = {row["id"]: row["draft"] for row in _read_jsonl(args.predictions)}
    report = score(samples, predictions)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    sys.exit(main())
