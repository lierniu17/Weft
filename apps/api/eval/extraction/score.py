"""Score extraction predictions against eval/extraction/samples.jsonl (AC-42).

Usage::

    uv run python eval/extraction/score.py predictions.jsonl [--samples samples.jsonl]
                                           [--split dev|heldout]

``predictions.jsonl``: one ``{"id": <sample id>, "draft": <Draft JSON>}`` per line.
Prints a JSON report; exits 1 when any metric is below its threshold.

Gold labels in samples.jsonl leave out the draft-internal item ``id`` and the display
``name`` / ``note`` of matched persons; ``gold_draft`` fills them in deterministically, so
the result validates against contracts/draft.schema.json. Scoring never looks at ids.

Persons are judged by **which person a mention resolves to**, not by its wording (spec
AC-42): a matched mention is its graph person id (Self is ``self``), an ambiguous one is
its candidate set, and a new person (including a descriptor person such as 「周姐的老公」)
is the same person as a gold new person when their mentions agree up to 「的」 or one ends
with the other (「老公」 = 「周姐的老公」). Facts, relationships, feelings and profile items
refer to persons through the same resolution.

``split.json`` fixes the dev / held-out split (stratified by category, seeded): prompts
are tuned on the dev set only and AC-42 is decided on the held-out set.

Standard library only, so it can be run without the app installed.
"""

from __future__ import annotations

import argparse
import copy
import json
import random
import sys
from collections import defaultdict
from collections.abc import Callable, Iterable, Mapping
from pathlib import Path
from typing import Any

THRESHOLDS = {
    "person_f1": 0.9,
    "relationship_type_accuracy": 0.8,
    "confidence_accuracy": 0.8,
}
SELF_ID = "self"
SELF_MENTION = "我"
DEFAULT_SAMPLES = Path(__file__).with_name("samples.jsonl")
SPLIT_PATH = Path(__file__).with_name("split.json")
SPLIT_SEED = 42
DEV_PER_CATEGORY = 6  # of 10 per category -> 30 dev / 20 held-out
SPLITS = ("dev", "heldout")

# Directional kin subtypes with an inverse ("pair[0] 是 pair[1] 的 X"): (A, B, 子女) is the
# same relationship as (B, A, 父母). Every other subtype is scored on the unordered pair.
INVERSE_SUBTYPES = {("kin", "子女"): ("kin", "父母")}
DIRECTED_SUBTYPES = {("kin", "父母")} | set(INVERSE_SUBTYPES)

Item = dict[str, Any]
Identity = tuple[str, ...]
Resolve = Callable[[str], Identity]

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


# --- which person a mention resolves to ------------------------------------------------


def _norm(mention: str) -> str:
    return mention.strip().replace("的", "")


def _identity(person: Mapping[str, Any]) -> Identity:
    match = person.get("match")
    if match == "matched" and person.get("person_id"):
        return ("id", str(person["person_id"]))
    if match == "ambiguous":
        ids = sorted(str(c.get("person_id")) for c in person.get("candidates") or [])
        return ("ambiguous", *ids)
    return ("new", _norm(person["mention"]))


def _resolver(draft: Mapping[str, Any]) -> Resolve:
    by_mention = {p["mention"].strip(): _identity(p) for p in draft.get("persons") or []}

    def resolve(mention: str) -> Identity:
        mention = mention.strip()
        if mention in by_mention:
            return by_mention[mention]
        if mention == SELF_MENTION:
            return ("id", SELF_ID)
        return ("new", _norm(mention))

    return resolve


def _referenced_mentions(draft: Mapping[str, Any]) -> list[str]:
    refs = [p["mention"] for p in draft.get("persons") or []]
    refs += [f["subject"] for f in draft.get("facts") or []]
    for r in draft.get("relationships") or []:
        refs += list(r["pair"])
    for fe in draft.get("feelings") or []:
        refs += [fe["from"], fe["to"]]
    refs += [p["person"] for p in draft.get("profile") or []]
    return refs


def _same_new_person(gold: Identity, pred: Identity) -> bool:
    g, p = gold[1], pred[1]
    return bool(g) and bool(p) and (g == p or g.endswith(p) or p.endswith(g))


def _align(gold: set[Identity], pred: set[Identity]) -> dict[Identity, Identity]:
    """Predicted identity -> the gold identity it is the same person as (one to one).

    Identical identities pair up first; then each remaining predicted new person takes
    the first remaining gold new person with an agreeing mention.
    """
    aligned = {i: i for i in pred & gold}
    free_gold = sorted(g for g in gold - pred if g[0] == "new")
    for p in sorted(i for i in pred - gold if i[0] == "new"):
        for g in free_gold:
            if _same_new_person(g, p):
                aligned[p] = g
                free_gold.remove(g)
                break
    return aligned


class _Resolution:
    """Gold and predicted mentions of one sample resolved into one identity space.

    A predicted person that is not any gold person keeps an identity no gold item has.
    """

    def __init__(self, gold: Mapping[str, Any], pred: Mapping[str, Any]) -> None:
        self.gold: Resolve = _resolver(gold)
        self._own: Resolve = _resolver(pred)
        gold_ids = {self.gold(m) for m in _referenced_mentions(gold)}
        pred_ids = {self._own(m) for m in _referenced_mentions(pred)}
        self._aligned = _align(gold_ids, pred_ids)

    def pred(self, mention: str) -> Identity:
        own = self._own(mention)
        if own == ("id", SELF_ID):
            return own
        return self._aligned.get(own, ("pred", *own))


def _persons(draft: Mapping[str, Any], resolve: Resolve) -> set[Identity]:
    """The distinct persons a draft lists, Self excluded."""
    return {resolve(p["mention"]) for p in draft.get("persons") or []} - {("id", SELF_ID)}


# --- items --------------------------------------------------------------------------


def _type_key(pair: Iterable[str], category: str, subtype: str, resolve: Resolve) -> Any:
    a, b = (resolve(m) for m in pair)
    if (category, subtype) in INVERSE_SUBTYPES:
        a, b = b, a
        category, subtype = INVERSE_SUBTYPES[(category, subtype)]
    if (category, subtype) in DIRECTED_SUBTYPES:
        return ((a, b), category, subtype)
    return (frozenset((a, b)), category, subtype)


def _type_keys(draft: Mapping[str, Any], resolve: Resolve) -> set[Any]:
    return {
        _type_key(r["pair"], t["category"], t["subtype"], resolve)
        for r in draft.get("relationships") or []
        for t in r.get("types") or []
    }


def _item_key(kind: str, item: Mapping[str, Any], resolve: Resolve) -> Any:
    if kind == "facts":
        return resolve(item["subject"])
    if kind == "relationships":
        return frozenset(resolve(m) for m in item["pair"])
    if kind == "feelings":
        return (resolve(item["from"]), resolve(item["to"]), item["dimension"])
    return (resolve(item["person"]), item["field"])


def _find(gold: Item, preds: Iterable[Item], kind: str, res: _Resolution) -> Item | None:
    key = _item_key(kind, gold, res.gold)
    for pred in preds:
        if _item_key(kind, pred, res.pred) != key:
            continue
        if kind != "facts":
            return pred
        g, p = gold["object"].strip(), pred["object"].strip()
        if g and p and (g in p or p in g):
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
        res = _Resolution(gold, pred)

        g_persons, p_persons = _persons(gold, res.gold), _persons(pred, res.pred)
        tp += len(g_persons & p_persons)
        fp += len(p_persons - g_persons)
        fn += len(g_persons - p_persons)

        g_types, p_types = _type_keys(gold, res.gold), _type_keys(pred, res.pred)
        type_total += len(g_types)
        type_correct += len(g_types & p_types)

        for kind in ("facts", "relationships", "feelings", "profile"):
            for item in gold.get(kind) or []:
                conf_total += 1
                match = _find(item, pred.get(kind) or [], kind, res)
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
