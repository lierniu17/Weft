"""Draft contract (spec 「录入与草稿流程」 step 3) and the confirm guard (AC-12)."""

import json
from typing import Any

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


def _draft(**overrides: object) -> dict[str, object]:
    base: dict[str, object] = {
        "persons": [
            {"id": "p1", "mention": "我", "match": "matched", "person_id": "self", "name": "陈明"},
            {"id": "p2", "mention": "老张", "match": "new"},
            {
                "id": "p3",
                "mention": "小李",
                "match": "matched",
                "person_id": "p-li",
                "name": "李磊",
                "note": "前同事",
            },
        ],
        "facts": [
            {
                "id": "f1",
                "subject": "老张",
                "predicate": "LIKES",
                "object": "钓鱼",
                "valid_at": "2026-11",
                "confidence": "self_told",
            },
            {
                "id": "f2",
                "subject": "小李",
                "predicate": "WORKS_AT",
                "object": "阿里巴巴",
                "confidence": "self_told",
                "conflict": {"old": "字节跳动", "action": "update"},
            },
        ],
        "relationships": [
            {
                "id": "r1",
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
                "id": "e1",
                "from": "小李",
                "to": "我",
                "dimension": "closeness",
                "level": "casual",
                "confidence": "inferred",
            },
            {
                "id": "e2",
                "from": "我",
                "to": "小李",
                "dimension": "trust",
                "level": "high",
                "confidence": "witnessed",
            },
        ],
        "profile": [
            {
                "id": "g1",
                "person": "老张",
                "field": "hometown",
                "value": "四川成都",
                "confidence": "self_told",
            }
        ],
    }
    base.update(overrides)
    return base


def test_full_spec_shape_parses() -> None:
    draft = Draft.model_validate(_draft())
    assert draft.persons[1].match is PersonMatch.NEW
    assert draft.persons[2].name == "李磊"
    assert draft.persons[2].note == "前同事"
    assert draft.facts[0].id == "f1"
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


# --- item ids (补充约定: every item has a stable id within the draft) ----------


@pytest.mark.parametrize("section", ["persons", "facts", "relationships", "feelings", "profile"])
def test_every_item_needs_an_id(section: str) -> None:
    data = _draft()
    items: list[dict[str, Any]] = data[section]  # type: ignore[assignment]
    del items[0]["id"]
    with pytest.raises(ValidationError):
        Draft.model_validate(data)


def test_ids_are_unique_across_the_whole_draft() -> None:
    data = _draft()
    data["profile"][0]["id"] = "f1"  # type: ignore[index]
    with pytest.raises(ValidationError, match="unique"):
        Draft.model_validate(data)


def test_empty_id_is_rejected() -> None:
    data = _draft()
    data["facts"][0]["id"] = ""  # type: ignore[index]
    with pytest.raises(ValidationError):
        Draft.model_validate(data)


# --- fact time spans (AC-8: 「上周末」 is a range) ------------------------------


def _fact(**fields: object) -> dict[str, object]:
    return {
        "id": "f9",
        "subject": "老张",
        "predicate": "EXPERIENCED",
        "object": "露营",
        "confidence": "self_told",
        **fields,
    }


def test_fact_may_carry_valid_to() -> None:
    draft = Draft.model_validate(
        _draft(facts=[_fact(valid_at="2026-11-07", valid_to="2026-11-08")])
    )
    assert draft.facts[0].valid_to == PartialDate(2026, 11, 8)
    assert draft.model_dump(mode="json")["facts"][0]["valid_to"] == "2026-11-08"


def test_valid_to_defaults_to_none() -> None:
    assert Draft.model_validate(_draft()).facts[0].valid_to is None


def test_valid_to_must_not_be_earlier_than_valid_at() -> None:
    with pytest.raises(ValidationError, match="valid_to"):
        Draft.model_validate(_draft(facts=[_fact(valid_at="2026-11-08", valid_to="2026-11-07")]))


@pytest.mark.parametrize(
    ("valid_at", "valid_to"),
    [("2026-11-08", "2026-11-08"), ("2026-11-08", "2026-11"), ("2026-11", "2026-11-30")],
)
def test_valid_to_may_equal_or_overlap_valid_at(valid_at: str, valid_to: str) -> None:
    Draft.model_validate(_draft(facts=[_fact(valid_at=valid_at, valid_to=valid_to)]))


# --- person match states (AC-12) -------------------------------------------


def test_matched_requires_person_id() -> None:
    with pytest.raises(ValidationError, match="person_id"):
        Draft.model_validate(
            {"persons": [{"id": "p1", "mention": "老张", "match": "matched", "name": "张伟"}]}
        )


def test_matched_requires_display_name() -> None:
    with pytest.raises(ValidationError, match="name"):
        Draft.model_validate(
            {"persons": [{"id": "p1", "mention": "老张", "match": "matched", "person_id": "p-zw"}]}
        )


def test_ambiguous_requires_candidates() -> None:
    with pytest.raises(ValidationError, match="candidates"):
        Draft.model_validate({"persons": [{"id": "p1", "mention": "老张", "match": "ambiguous"}]})


def test_new_must_not_carry_person_id() -> None:
    with pytest.raises(ValidationError, match="person_id"):
        Draft.model_validate(
            {"persons": [{"id": "p1", "mention": "老张", "match": "new", "person_id": "p-1"}]}
        )


def test_mentions_are_unique() -> None:
    with pytest.raises(ValidationError, match="mentions"):
        Draft.model_validate(
            {
                "persons": [
                    {"id": "p1", "mention": "老张", "match": "new"},
                    {"id": "p2", "mention": "老张", "match": "new"},
                ]
            }
        )


def _ambiguous_draft() -> Draft:
    return Draft.model_validate(
        {
            "persons": [
                {
                    "id": "p1",
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
                    "id": "f1",
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
    person = chosen.persons[0]
    assert person.match is PersonMatch.MATCHED
    assert person.person_id == "p-zw"
    assert (person.id, person.name, person.note) == ("p1", "张伟", "同事")
    chosen.ensure_confirmable()


def test_confirmable_after_marking_new() -> None:
    chosen = _ambiguous_draft().choose("老张", person_id=None)
    assert chosen.persons[0].match is PersonMatch.NEW
    assert chosen.persons[0].id == "p1"
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
                {
                    "id": "f1",
                    "subject": "王五",
                    "predicate": "LIKES",
                    "object": "茶",
                    "confidence": "inferred",
                }
            ]
        },
        {
            "feelings": [
                {
                    "id": "e1",
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
                {
                    "id": "g1",
                    "person": "王五",
                    "field": "gender",
                    "value": "男",
                    "confidence": "inferred",
                }
            ]
        },
        {
            "relationships": [
                {"id": "r1", "pair": ["我", "王五"], "types": [], "confidence": "witnessed"}
            ]
        },
        {
            "relationships": [
                {
                    "id": "r1",
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
    with pytest.raises(ValidationError, match="unknown person mentions"):
        Draft.model_validate(_draft(**override))


def test_relationship_pair_must_be_two_different_people() -> None:
    with pytest.raises(ValidationError, match="two different"):
        Draft.model_validate(
            _draft(
                relationships=[
                    {"id": "r1", "pair": ["老张", "老张"], "types": [], "confidence": "witnessed"}
                ]
            )
        )


def test_feeling_level_must_match_dimension() -> None:
    bad = {
        "id": "e1",
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


# --- exported contract for the frontend (drift: tests/unit/test_contracts.py) ---


def test_json_schema_exposes_spec_field_names() -> None:
    schema = draft_json_schema()
    assert set(schema["properties"]) == {
        "persons",
        "facts",
        "relationships",
        "feelings",
        "profile",
        "questions",
    }
    assert set(schema["required"]) == set(schema["properties"])  # always emitted
    text = json.dumps(schema, ensure_ascii=False)
    for name in [
        "mention",
        "candidates",
        "conflict",
        "unverified",
        "introduced_by",
        "met_at",
        "valid_to",
        '"from"',
    ]:
        assert name in text


@pytest.mark.parametrize(
    "item",
    [
        "DraftPerson",
        "DraftFact",
        "DraftRelationship",
        "ClosenessFeeling",
        "AffinityFeeling",
        "TrustFeeling",
        "DraftProfileItem",
    ],
)
def test_json_schema_items_require_an_id(item: str) -> None:
    definition = draft_json_schema()["$defs"][item]
    assert "id" in definition["required"]
    assert definition["properties"]["id"]["type"] == "string"


def test_json_schema_person_carries_display_fields() -> None:
    props = draft_json_schema()["$defs"]["DraftPerson"]["properties"]
    assert {"name", "note"} <= set(props)


def test_json_schema_pair_is_two_strings_without_prefix_items() -> None:
    pair = draft_json_schema()["$defs"]["DraftRelationship"]["properties"]["pair"]
    assert "prefixItems" not in pair
    assert pair["type"] == "array"
    assert pair["items"]["type"] == "string"
    assert (pair["minItems"], pair["maxItems"]) == (2, 2)
