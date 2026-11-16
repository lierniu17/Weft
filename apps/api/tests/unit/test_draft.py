"""Draft contract (spec 「录入与草稿流程」 step 3) and the confirm guard (AC-12)."""

import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from weft.domain.confidence import Confidence, ConflictAction
from weft.domain.dates import PartialDate
from weft.domain.draft import (
    Draft,
    DraftNotConfirmableError,
    PersonMatch,
    draft_json_schema,
)

pytestmark = pytest.mark.unit

CONTRACT = Path(__file__).resolve().parents[2] / "contracts" / "draft.schema.json"


def _draft(**overrides: object) -> dict[str, object]:
    base: dict[str, object] = {
        "persons": [
            {"mention": "我", "match": "matched", "person_id": "self"},
            {"mention": "老张", "match": "new"},
            {"mention": "小李", "match": "matched", "person_id": "p-li"},
        ],
        "facts": [
            {
                "subject": "老张",
                "predicate": "LIKES",
                "object": "钓鱼",
                "valid_at": "2026-11",
                "confidence": "self_told",
            },
            {
                "subject": "小李",
                "predicate": "WORKS_AT",
                "object": "阿里巴巴",
                "confidence": "self_told",
                "conflict": {"old": "字节跳动", "action": "update"},
            },
        ],
        "relationships": [
            {
                "pair": ["老张", "小李"],
                "types": [{"category": "social", "subtype": "室友", "original": "大学室友"}],
                "met_at": "2010",
                "origin": "大学同寝室",
                "introduced_by": None,
                "status": "tense",
                "confidence": "hearsay",
            }
        ],
        "feelings": [
            {
                "from": "小李",
                "to": "我",
                "dimension": "closeness",
                "level": "casual",
                "confidence": "inferred",
            },
            {
                "from": "我",
                "to": "小李",
                "dimension": "trust",
                "level": "high",
                "confidence": "witnessed",
            },
        ],
        "profile": [
            {"person": "老张", "field": "hometown", "value": "四川成都", "confidence": "self_told"}
        ],
    }
    base.update(overrides)
    return base


def test_full_spec_shape_parses() -> None:
    draft = Draft.model_validate(_draft())
    assert draft.persons[1].match is PersonMatch.NEW
    assert draft.facts[0].valid_at == PartialDate(2026, 11)
    assert draft.facts[1].conflict is not None
    assert draft.facts[1].conflict.action is ConflictAction.UPDATE
    assert draft.feelings[0].from_ == "小李"
    assert draft.relationships[0].confidence is Confidence.HEARSAY


def test_json_round_trip_uses_from_not_from_underscore() -> None:
    dumped = Draft.model_validate(_draft()).model_dump(mode="json")
    assert dumped["feelings"][0]["from"] == "小李"
    assert "from_" not in dumped["feelings"][0]
    assert Draft.model_validate(dumped) == Draft.model_validate(_draft())


def test_empty_draft_is_valid() -> None:
    assert Draft.model_validate({}).persons == []


# --- person match states (AC-12) -------------------------------------------


def test_matched_requires_person_id() -> None:
    with pytest.raises(ValidationError):
        Draft.model_validate(_draft(persons=[{"mention": "老张", "match": "matched"}]))


def test_ambiguous_requires_candidates() -> None:
    with pytest.raises(ValidationError):
        Draft.model_validate(_draft(persons=[{"mention": "老张", "match": "ambiguous"}]))


def test_new_must_not_carry_person_id() -> None:
    with pytest.raises(ValidationError):
        Draft.model_validate({"persons": [{"mention": "老张", "match": "new", "person_id": "p-1"}]})


def test_mentions_are_unique() -> None:
    with pytest.raises(ValidationError):
        Draft.model_validate(
            {"persons": [{"mention": "老张", "match": "new"}, {"mention": "老张", "match": "new"}]}
        )


def _ambiguous_draft() -> Draft:
    return Draft.model_validate(
        {
            "persons": [
                {
                    "mention": "老张",
                    "match": "ambiguous",
                    "candidates": [
                        {"person_id": "p-zw", "name": "张伟", "note": "同事"},
                        {"person_id": "p-zq", "name": "张强", "note": "邻居"},
                    ],
                }
            ],
            "facts": [
                {
                    "subject": "老张",
                    "predicate": "EXPERIENCED",
                    "object": "升职",
                    "confidence": "hearsay",
                }
            ],
        }
    )


def test_cannot_confirm_while_any_person_is_ambiguous() -> None:
    draft = _ambiguous_draft()
    assert draft.ambiguous_mentions() == ["老张"]
    with pytest.raises(DraftNotConfirmableError) as exc:
        draft.ensure_confirmable()
    assert exc.value.mentions == ["老张"]


def test_confirmable_after_choosing_a_candidate() -> None:
    chosen = _ambiguous_draft().choose("老张", person_id="p-zw")
    assert chosen.persons[0].match is PersonMatch.MATCHED
    assert chosen.persons[0].person_id == "p-zw"
    chosen.ensure_confirmable()


def test_confirmable_after_marking_new() -> None:
    chosen = _ambiguous_draft().choose("老张", person_id=None)
    assert chosen.persons[0].match is PersonMatch.NEW
    chosen.ensure_confirmable()


def test_choosing_a_non_candidate_is_rejected() -> None:
    with pytest.raises(ValueError):
        _ambiguous_draft().choose("老张", person_id="p-somebody-else")


# --- cross references ------------------------------------------------------


@pytest.mark.parametrize(
    "override",
    [
        {
            "facts": [
                {"subject": "王五", "predicate": "LIKES", "object": "茶", "confidence": "inferred"}
            ]
        },
        {
            "feelings": [
                {
                    "from": "王五",
                    "to": "我",
                    "dimension": "trust",
                    "level": "low",
                    "confidence": "inferred",
                }
            ]
        },
        {
            "profile": [
                {"person": "王五", "field": "gender", "value": "男", "confidence": "inferred"}
            ]
        },
        {"relationships": [{"pair": ["我", "王五"], "types": [], "confidence": "witnessed"}]},
        {
            "relationships": [
                {
                    "pair": ["我", "老张"],
                    "types": [],
                    "introduced_by": "王五",
                    "confidence": "witnessed",
                }
            ]
        },
    ],
)
def test_person_references_must_resolve_to_a_mention(override: dict[str, object]) -> None:
    with pytest.raises(ValidationError):
        Draft.model_validate(_draft(**override))


def test_relationship_pair_must_be_two_different_people() -> None:
    with pytest.raises(ValidationError):
        Draft.model_validate(
            _draft(
                relationships=[{"pair": ["老张", "老张"], "types": [], "confidence": "witnessed"}]
            )
        )


def test_feeling_level_must_match_dimension() -> None:
    bad = {
        "from": "我",
        "to": "小李",
        "dimension": "trust",
        "level": "close",
        "confidence": "witnessed",
    }
    with pytest.raises(ValidationError):
        Draft.model_validate(_draft(feelings=[bad]))


def test_feeling_levels_have_chinese_labels() -> None:
    draft = Draft.model_validate(_draft())
    assert draft.feelings[0].level_label == "一般"
    assert draft.feelings[1].level_label == "高"


# --- exported contract for the frontend ------------------------------------


def test_exported_json_schema_is_up_to_date() -> None:
    """Regenerate with: uv run python -m weft.contracts"""
    assert CONTRACT.exists(), "run `uv run python -m weft.contracts`"
    assert json.loads(CONTRACT.read_text(encoding="utf-8")) == draft_json_schema()


def test_json_schema_exposes_spec_field_names() -> None:
    schema = draft_json_schema()
    assert set(schema["properties"]) == {"persons", "facts", "relationships", "feelings", "profile"}
    text = json.dumps(schema, ensure_ascii=False)
    for name in [
        "mention",
        "candidates",
        "conflict",
        "unverified",
        "introduced_by",
        "met_at",
        '"from"',
    ]:
        assert name in text
