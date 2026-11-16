"""Score extraction predictions against eval/extraction/samples.jsonl (AC-42).

Usage::

    uv run python eval/extraction/score.py predictions.jsonl [--samples samples.jsonl]

``predictions.jsonl``: one ``{"id": <sample id>, "draft": <Draft JSON>}`` per line.
Prints a JSON report; exits 1 when any metric is below its threshold.

Gold labels in samples.jsonl leave out the draft-internal item ``id`` and the display
``name`` / ``note`` of matched persons; ``gold_draft`` fills them in deterministically, so
the result validates against contracts/draft.schema.json. Scoring never looks at ids.

Standard library only, so it can be run without the app installed.
"""

from __future__ import annotations

import argparse
import copy
import json
import sys
from collections.abc import Iterable, Mapping
from pathlib import Path
from typing import Any

THRESHOLDS = {
    "person_f1": 0.9,
    "relationship_type_accuracy": 0.8,
    "confidence_accuracy": 0.8,
}
SELF_ID = "self"
DEFAULT_SAMPLES = Path(__file__).with_name("samples.jsonl")

Item = dict[str, Any]

# Draft section -> id prefix of its items (p1, f1, r1, e1, g1, ...).
SECTIONS = {"persons": "p", "facts": "f", "relationships": "r", "feelings": "e", "profile": "g"}


def gold_draft(sample: Mapping[str, Any]) -> Item:
    """The sample's gold Draft with item ids and matched persons' display fields filled in.

    Hand-written values win; the sample itself is not modified.
    """
    draft: Item = copy.deepcopy(sample["gold"])
    for section, prefix in SECTIONS.items():
        for n, item in enumerate(draft.get(section) or [], start=1):
            item.setdefault("id", f"{prefix}{n}")
    context = {p["id"]: p for p in sample.get("graph_context", {}).get("persons", [])}
    for person in draft.get("persons") or []:
        known = context.get(person.get("person_id")) if person.get("match") == "matched" else None
        if known is not None:
            person.setdefault("name", known["name"])
            if known.get("note"):
                person.setdefault("note", known["note"])
    return draft


def _persons(draft: Mapping[str, Any]) -> set[tuple[str, str, str | None]]:
    """(mention, match, person_id) for every non-Self person."""
    out = set()
    for p in draft.get("persons") or []:
        if p.get("person_id") == SELF_ID:
            continue
        pid = p.get("person_id") if p.get("match") == "matched" else None
        out.add((p["mention"].strip(), p["match"], pid))
    return out


def _pair(rel: Mapping[str, Any]) -> frozenset[str]:
    return frozenset(m.strip() for m in rel["pair"])


def _type_keys(draft: Mapping[str, Any]) -> set[tuple[frozenset[str], str, str]]:
    return {
        (_pair(r), t["category"], t["subtype"])
        for r in draft.get("relationships") or []
        for t in r.get("types") or []
    }


def _fact_matches(gold: Item, pred: Item) -> bool:
    g, p = gold["object"].strip(), pred["object"].strip()
    return gold["subject"] == pred["subject"] and bool(g) and bool(p) and (g in p or p in g)


def _find(gold: Item, preds: Iterable[Item], kind: str) -> Item | None:
    for pred in preds:
        if kind == "facts" and _fact_matches(gold, pred):
            return pred
        if kind == "relationships" and _pair(gold) == _pair(pred):
            return pred
        if kind == "feelings" and all(gold[k] == pred.get(k) for k in ("from", "to", "dimension")):
            return pred
        if kind == "profile" and all(gold[k] == pred.get(k) for k in ("person", "field")):
            return pred
    return None


def _ratio(num: int, den: int) -> float:
    return num / den if den else 0.0


def score(samples: list[Item], predictions: Mapping[str, Mapping[str, Any]]) -> dict[str, Any]:
    tp = fp = fn = 0
    type_total = type_correct = 0
    conf_total = conf_matched = conf_correct = 0
    missing: list[str] = []

    for sample in samples:
        gold = sample["gold"]
        if sample["id"] not in predictions:
            missing.append(sample["id"])
        pred = predictions.get(sample["id"], {})

        g_persons, p_persons = _persons(gold), _persons(pred)
        tp += len(g_persons & p_persons)
        fp += len(p_persons - g_persons)
        fn += len(g_persons - p_persons)

        g_types, p_types = _type_keys(gold), _type_keys(pred)
        type_total += len(g_types)
        type_correct += len(g_types & p_types)

        for kind in ("facts", "relationships", "feelings", "profile"):
            for item in gold.get(kind) or []:
                conf_total += 1
                match = _find(item, pred.get(kind) or [], kind)
                if match is not None:
                    conf_matched += 1
                    conf_correct += int(match.get("confidence") == item["confidence"])

    precision, recall = _ratio(tp, tp + fp), _ratio(tp, tp + fn)
    report: dict[str, Any] = {
        "samples": len(samples),
        "person_f1": _ratio(2 * precision * recall, precision + recall),
        "person_precision": precision,
        "person_recall": recall,
        "relationship_type_accuracy": _ratio(type_correct, type_total),
        "confidence_accuracy": _ratio(conf_correct, conf_matched),
        "confidence_coverage": _ratio(conf_matched, conf_total),
        "missing_predictions": missing,
        "thresholds": THRESHOLDS,
    }
    report["passed"] = all(report[k] >= v for k, v in THRESHOLDS.items())
    return report


def _read_jsonl(path: Path) -> list[Item]:
    lines = path.read_text(encoding="utf-8").splitlines()
    return [json.loads(line) for line in lines if line.strip()]


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("predictions", type=Path)
    parser.add_argument("--samples", type=Path, default=DEFAULT_SAMPLES)
    args = parser.parse_args(argv)

    samples = _read_jsonl(args.samples)
    predictions = {row["id"]: row["draft"] for row in _read_jsonl(args.predictions)}
    report = score(samples, predictions)
    print(json.dumps(report, ensure_ascii=False, indent=2))
    return 0 if report["passed"] else 1


if __name__ == "__main__":
    sys.exit(main())
