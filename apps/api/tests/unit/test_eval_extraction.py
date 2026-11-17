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

    gold = Draft.model_validate(score.gold_draft(sample))
    context_ids = {p["id"] for p in sample["graph_context"]["persons"]}
    assert "self" in context_ids

    context_names = {p["id"]: p["name"] for p in sample["graph_context"]["persons"]}
    for person in gold.persons:
        if person.match is PersonMatch.MATCHED:
            assert person.person_id in context_ids
            assert person.name == context_names[person.person_id]
        for candidate in person.candidates or []:
            assert candidate.person_id in context_ids

    for rel in gold.relationships:
        for t in rel.types:
            assert BUILTIN.contains(t.category, t.subtype), (t.category, t.subtype)

    # AC-8: never more precise than the Entry
    dates = [f.valid_at for f in gold.facts] + [f.valid_to for f in gold.facts]
    for value in dates + [r.met_at for r in gold.relationships]:
        if value is not None:
            assert value.precision.level <= occurred.precision.level

    old_conf = {
        f["object"]: Confidence(f["confidence"]) for f in sample["graph_context"].get("facts", [])
    }
    for fact in gold.facts:
        if fact.conflict is not None:
            expected = resolve_conflict(old=old_conf[fact.conflict.old], new=fact.confidence)
            assert fact.conflict.action is expected


def test_gold_ids_are_generated_deterministically_and_unique() -> None:
    sample = next(s for s in _samples() if s["gold"].get("relationships"))
    first, again = score.gold_draft(sample), score.gold_draft(sample)
    assert first == again
    ids = [item["id"] for kind in score.SECTIONS for item in first.get(kind) or []]
    assert len(ids) == len(set(ids)) > 0
    assert first["persons"][0]["id"] == "p1"
    assert "id" not in sample["gold"]["persons"][0], "the loader must not mutate the sample"


def test_gold_draft_keeps_hand_written_ids_and_names() -> None:
    sample = {
        "graph_context": {"persons": [{"id": "p-zw", "name": "张伟"}]},
        "gold": {
            "persons": [
                {
                    "id": "x",
                    "mention": "老张",
                    "match": "matched",
                    "person_id": "p-zw",
                    "name": "老张本名",
                }
            ]
        },
    }
    person = score.gold_draft(sample)["persons"][0]
    assert (person["id"], person["name"]) == ("x", "老张本名")


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


def _persons_only(gold: list[dict[str, Any]], pred: list[dict[str, Any]]) -> float:
    sample = {"id": "t", "gold": {"persons": gold}}
    result: float = score.score([sample], {"t": {"persons": pred}})["person_f1"]
    return result


def test_a_matched_person_is_judged_by_person_id_not_mention_text() -> None:
    gold = [{"mention": "小王", "match": "matched", "person_id": "p-xw1"}]
    assert (
        _persons_only(gold, [{"mention": "小王教练", "match": "matched", "person_id": "p-xw1"}])
        == 1.0
    )
    assert (
        _persons_only(gold, [{"mention": "小王", "match": "matched", "person_id": "p-xw2"}]) == 0.0
    )


def test_two_mentions_of_the_same_person_count_once() -> None:
    gold = [{"mention": "小王", "match": "matched", "person_id": "p-xw1"}]
    pred = [
        {"mention": "小王", "match": "matched", "person_id": "p-xw1"},
        {"mention": "小王教练", "match": "matched", "person_id": "p-xw1"},
    ]
    assert _persons_only(gold, pred) == 1.0


def test_a_new_descriptor_person_matches_up_to_its_reference_and_de() -> None:
    gold = [
        {"mention": "周姐", "match": "new"},
        {"mention": "周姐的老公", "match": "new"},
    ]
    assert (
        _persons_only(
            gold, [{"mention": "周姐", "match": "new"}, {"mention": "老公", "match": "new"}]
        )
        == 1.0
    )
    assert (
        _persons_only(
            gold, [{"mention": "周姐", "match": "new"}, {"mention": "周姐老公", "match": "new"}]
        )
        == 1.0
    )
    # a different new person is a miss, and one gold person is only matched once
    assert (
        _persons_only(
            gold, [{"mention": "周姐", "match": "new"}, {"mention": "前夫", "match": "new"}]
        )
        == 0.5
    )
    one_gold = [{"mention": "老公", "match": "new"}]
    pred = [{"mention": "周姐的老公", "match": "new"}, {"mention": "老公", "match": "new"}]
    assert _persons_only(one_gold, pred) == pytest.approx(2 / 3)


def test_an_ambiguous_person_is_judged_by_its_candidate_set() -> None:
    def amb(*ids: str) -> dict[str, Any]:
        return {
            "mention": "老张",
            "match": "ambiguous",
            "candidates": [{"person_id": i, "name": i} for i in ids],
        }

    assert _persons_only([amb("p-zw", "p-zq")], [amb("p-zq", "p-zw")]) == 1.0
    assert _persons_only([amb("p-zw", "p-zq")], [amb("p-zw")]) == 0.0
    matched = {"mention": "老张", "match": "matched", "person_id": "p-zw"}
    assert _persons_only([amb("p-zw", "p-zq")], [matched]) == 0.0


def test_relationship_type_accuracy_is_per_gold_type_and_pair_is_unordered() -> None:
    pred = {
        "persons": GOLD["gold"]["persons"],
        "relationships": [
            {
                "pair": ["小李", "老张"],
                "types": [
                    {"category": "social", "subtype": "同学", "original": "同学"},
                    {"category": "hostile", "subtype": "矛盾", "original": "闹翻"},
                ],
                "confidence": "hearsay",
            }
        ],
    }
    assert score.score([GOLD], {"t-1": pred})["relationship_type_accuracy"] == pytest.approx(0.5)


def _kin(pair: list[str], subtype: str) -> dict[str, Any]:
    return {
        "pair": pair,
        "types": [{"category": "kin", "subtype": subtype, "original": "女儿"}],
        "confidence": "self_told",
    }


def test_parent_child_types_are_directional_and_inverse_of_each_other() -> None:
    persons = [
        {"mention": "老张", "match": "new"},
        {"mention": "老张的女儿", "match": "new"},
    ]
    sample = {
        "id": "t",
        "gold": {"persons": persons, "relationships": [_kin(["老张", "老张的女儿"], "父母")]},
    }

    def accuracy(rel: dict[str, Any], mentions: tuple[str, str] = ("老张", "老张的女儿")) -> float:
        pred = {
            "persons": [{"mention": m, "match": "new"} for m in mentions],
            "relationships": [rel],
        }
        result: float = score.score([sample], {"t": pred})["relationship_type_accuracy"]
        return result

    assert accuracy(_kin(["老张", "老张的女儿"], "父母")) == 1.0
    assert accuracy(_kin(["老张的女儿", "老张"], "子女")) == 1.0  # the same, said the other way
    assert accuracy(_kin(["老张的女儿", "老张"], "父母")) == 0.0  # reversed
    assert accuracy(_kin(["老张", "老张的女儿"], "子女")) == 0.0
    # the descriptor person resolves whatever its wording
    assert accuracy(_kin(["老张", "女儿"], "父母"), ("老张", "女儿")) == 1.0


def test_items_refer_to_persons_through_their_resolution() -> None:
    sample = {
        "id": "t",
        "gold": {
            "persons": [{"mention": "小王", "match": "matched", "person_id": "p-xw1"}],
            "facts": [
                {
                    "subject": "小王",
                    "predicate": "LIKES",
                    "object": "健身",
                    "confidence": "witnessed",
                }
            ],
        },
    }
    pred = {
        "persons": [{"mention": "小王教练", "match": "matched", "person_id": "p-xw1"}],
        "facts": [
            {
                "subject": "小王教练",
                "predicate": "LIKES",
                "object": "健身",
                "confidence": "witnessed",
            }
        ],
    }
    report = score.score([sample], {"t": pred})
    assert report["confidence_coverage"] == 1.0
    assert report["confidence_accuracy"] == 1.0
    wrong = {**pred, "persons": [{"mention": "小王教练", "match": "new"}]}
    assert score.score([sample], {"t": wrong})["confidence_coverage"] == 0.0


def test_confidence_accuracy_over_matched_items_with_coverage() -> None:
    pred = {
        "persons": GOLD["gold"]["persons"],
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


# --- the dev / held-out split ------------------------------------------------


def test_the_committed_split_is_the_seeded_stratified_split_of_the_samples() -> None:
    samples = _samples()
    committed = json.loads((EVAL_DIR / "split.json").read_text(encoding="utf-8"))
    assert committed == score.make_split(samples)
    dev, heldout = set(committed["dev"]), set(committed["heldout"])
    assert (len(dev), len(heldout)) == (30, 20)
    assert dev.isdisjoint(heldout) and dev | heldout == {s["id"] for s in samples}
    category = {s["id"]: s["category"] for s in samples}
    assert Counter(category[i] for i in heldout) == {c: 4 for c in set(category.values())}


def test_select_and_score_by_split(tmp_path: Path) -> None:
    split = tmp_path / "split.json"
    split.write_text(json.dumps({"dev": ["t-1"], "heldout": ["t-2"]}), encoding="utf-8")
    other = {**GOLD, "id": "t-2"}
    assert [s["id"] for s in score.select([GOLD, other], "heldout", split)] == ["t-2"]
    assert score.select([GOLD, other], None, split) == [GOLD, other]
    by_split = score.score_by_split([GOLD, other], {"t-1": GOLD["gold"]}, split)
    assert by_split["dev"]["person_f1"] == 1.0
    assert by_split["heldout"]["missing_predictions"] == ["t-2"]


def test_self_is_never_a_person_even_when_only_the_prediction_lists_it() -> None:
    gold = [{"mention": "老张", "match": "matched", "person_id": "p-zw"}]
    pred = [
        {"mention": "老张", "match": "matched", "person_id": "p-zw"},
        {"mention": "我", "match": "matched", "person_id": "self"},
    ]
    assert _persons_only(gold, pred) == 1.0
