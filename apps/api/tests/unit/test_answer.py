"""Answer (回答结构) contract: spec 「实现决策 → 问答」, AC-23, AC-36, AC-37, AC-38."""

import json
from typing import Any

import pytest
from pydantic import ValidationError

from weft.domain.answer import Answer, AnswerKind, answer_json_schema
from weft.domain.confidence import Confidence
from weft.domain.dates import PartialDate

pytestmark = pytest.mark.unit

ZW = {"person_id": "zw", "name": "张伟"}
LM = {"person_id": "lm", "name": "李明"}
WF = {"person_id": "wf", "name": "王芳"}
ME = {"person_id": "self", "name": "陈明", "is_self": True}


def _citation(index: int, **fields: object) -> dict[str, object]:
    return {
        "index": index,
        "entry_id": f"e{index}",
        "entry_excerpt": "读大学时和老张、小李住一个宿舍。",
        "occurred_on": "2012",
        "confidence": "witnessed",
        **fields,
    }


def _text_answer(**overrides: object) -> dict[str, Any]:
    base: dict[str, Any] = {
        "kind": "text",
        "segments": [
            {"text": "他们是大学室友", "citations": [1]},
            {"text": "。据老张说，去年因为借钱的事闹掰了", "citations": [2]},
            {"text": "，目前关系紧张。"},
        ],
        "citations": [
            _citation(1),
            _citation(
                2,
                occurred_on="2026-11-16",
                confidence="hearsay",
                told_by="老张",
                pair=[ZW, LM],
            ),
        ],
        "persons": [ZW, LM],
        "follow_ups": ["他俩什么时候认识的？"],
    }
    base.update(overrides)
    return base


def test_text_answer_parses() -> None:
    answer = Answer.model_validate(_text_answer())
    assert answer.kind is AnswerKind.TEXT
    assert answer.segments[0].citations == (1,)
    assert answer.segments[2].citations == ()
    second = answer.citations[1]
    assert second.occurred_on == PartialDate(2026, 11, 16)
    assert second.confidence is Confidence.HEARSAY
    assert second.told_by == "老张"
    assert second.pair is not None
    assert second.pair[1].name == "李明"
    assert answer.citations[0].is_opinion is False
    assert answer.persons[0].is_self is False


def test_json_round_trip() -> None:
    answer = Answer.model_validate(_text_answer())
    dumped = answer.model_dump(mode="json")
    assert dumped["citations"][0]["occurred_on"] == "2012"
    assert dumped["citations"][1]["pair"][0] == {
        "person_id": "zw",
        "name": "张伟",
        "is_self": False,
    }
    assert Answer.model_validate(dumped) == answer


def test_opinion_citation_is_marked() -> None:
    """AC-23: an answer quoting 我的评价 says so; the citation carries the marker."""
    answer = Answer.model_validate(
        _text_answer(citations=[_citation(1), _citation(2, is_opinion=True)])
    )
    assert answer.citations[1].is_opinion is True


def test_path_answer_needs_a_chain_of_at_least_two() -> None:
    ok = _text_answer(kind="path", path=[ME, ZW, WF])
    assert [p.name for p in Answer.model_validate(ok).path or []] == ["陈明", "张伟", "王芳"]
    with pytest.raises(ValidationError, match="path"):
        Answer.model_validate(_text_answer(kind="path"))
    with pytest.raises(ValidationError, match="path"):
        Answer.model_validate(_text_answer(kind="path", path=[ME]))


def test_list_answer_needs_items_whose_citations_resolve() -> None:
    items = [
        {**LM, "subtitle": "同学", "citations": [1]},
        {**WF, "subtitle": "客户", "citations": [2]},
    ]
    answer = Answer.model_validate(_text_answer(kind="list", items=items))
    assert answer.items is not None
    assert answer.items[0].subtitle == "同学"
    with pytest.raises(ValidationError, match="items"):
        Answer.model_validate(_text_answer(kind="list"))
    bad = [{**LM, "citations": [9]}]
    with pytest.raises(ValidationError, match="unknown citation"):
        Answer.model_validate(_text_answer(kind="list", items=bad))


def test_stat_answer_count_matches_its_persons() -> None:
    answer = Answer.model_validate(
        _text_answer(kind="stat", stat={"count": 2, "persons": [ZW, LM]})
    )
    assert answer.stat is not None and answer.stat.count == 2
    with pytest.raises(ValidationError, match="stat"):
        Answer.model_validate(_text_answer(kind="stat"))
    with pytest.raises(ValidationError, match="count"):
        Answer.model_validate(_text_answer(kind="stat", stat={"count": 3, "persons": [ZW, LM]}))


def test_no_answer_cites_nothing() -> None:
    """AC-38: 图谱里没有相关信息 — nothing to cite, nothing made up."""
    empty = {
        "kind": "no_answer",
        "segments": [{"text": "图谱里没有相关信息：没有张伟配偶的记录。"}],
        "citations": [],
        "persons": [],
        "follow_ups": [],
    }
    assert Answer.model_validate(empty).kind is AnswerKind.NO_ANSWER
    with pytest.raises(ValidationError, match="no_answer"):
        Answer.model_validate({**empty, "citations": [_citation(1)]})


def test_segment_citations_must_resolve() -> None:
    segments = [{"text": "他们是大学室友", "citations": [3]}]
    with pytest.raises(ValidationError, match="unknown citation"):
        Answer.model_validate(_text_answer(segments=segments))


def test_citation_indices_are_unique_and_start_at_one() -> None:
    with pytest.raises(ValidationError, match="unique"):
        Answer.model_validate(_text_answer(citations=[_citation(1), _citation(1)]))
    with pytest.raises(ValidationError):
        Answer.model_validate(_text_answer(citations=[_citation(0), _citation(1), _citation(2)]))


def test_citation_date_is_a_partial_date() -> None:
    with pytest.raises(ValidationError):
        Answer.model_validate(_text_answer(citations=[_citation(1, occurred_on="2012/06")]))


def test_unknown_fields_are_rejected() -> None:
    with pytest.raises(ValidationError):
        Answer.model_validate(_text_answer(group_id="someone-else"))


# --- exported contract -----------------------------------------------------


def test_json_schema_mirrors_the_web_answer_shape() -> None:
    schema = answer_json_schema()
    assert schema["title"] == "Answer"
    assert set(schema["properties"]) == {
        "kind",
        "segments",
        "citations",
        "persons",
        "path",
        "items",
        "stat",
        "follow_ups",
    }
    assert set(schema["required"]) == {"kind", "segments", "citations", "persons", "follow_ups"}
    defs = schema["$defs"]
    assert defs["AnswerKind"]["enum"] == ["text", "path", "list", "stat", "no_answer"]
    assert set(defs["Citation"]["required"]) == {
        "index",
        "entry_id",
        "entry_excerpt",
        "occurred_on",
        "confidence",
    }
    assert set(defs["PersonRef"]["required"]) == {"person_id", "name"}
    assert set(defs["AnswerListItem"]["required"]) == {"person_id", "name", "citations"}
    assert set(defs["AnswerSegment"]["required"]) == {"text"}


def test_json_schema_citation_pair_is_two_person_refs() -> None:
    pair = answer_json_schema()["$defs"]["Citation"]["properties"]["pair"]
    text = json.dumps(pair)
    assert "prefixItems" not in text
    array = next(s for s in pair["anyOf"] if s.get("type") == "array")
    assert array["items"] == {"$ref": "#/$defs/PersonRef"}
    assert (array["minItems"], array["maxItems"]) == (2, 2)
