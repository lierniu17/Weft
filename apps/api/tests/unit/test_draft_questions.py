"""补充追问 rules (conversation-context AC-4, AC-6, AC-7): which questions are kept, which
patches are legal, and what an answer changes in the Draft."""

from __future__ import annotations

from datetime import date
from typing import Any

import pytest

from weft.domain.confidence import Confidence
from weft.domain.dates import PartialDate
from weft.domain.draft import (
    Draft,
    DraftPerson,
    DraftQuestion,
    PersonMatch,
    QuestionField,
    QuestionPatch,
)
from weft.domain.draft_questions import (
    QuestionOutdatedError,
    answer,
    parse_patch,
    parse_questions,
)
from weft.domain.taxonomy import BUILTIN

TODAY = date(2026, 11, 16)
ENTRY = PartialDate(2026, 11, 16)
ME = DraftPerson(id="p9", mention="我", match=PersonMatch.MATCHED, person_id="self", name="小明")


def draft(**extra: Any) -> Draft:
    data: dict[str, Any] = {
        "persons": [
            {"id": "p1", "mention": "小李", "match": "new"},
            {"id": "p2", "mention": "老张", "match": "new"},
        ],
        "facts": [
            {
                "id": "f1",
                "subject": "小李",
                "predicate": "EXPERIENCED",
                "object": "和我吃饭",
                "confidence": "witnessed",
                "valid_at": "2026-11-16",
            }
        ],
        **extra,
    }
    return Draft.model_validate(data)


def type_option(label: str, subtype: str = "同事") -> dict[str, Any]:
    return {
        "label": label,
        "patch": {"types": [{"category": "social", "subtype": subtype, "original": label}]},
    }


def rel_question(**over: Any) -> dict[str, Any]:
    return {
        "field": "relationship_type",
        "pair": ["我", "小李"],
        "prompt": "小李是你的同事还是同学？",
        "options": [type_option("同事"), type_option("同学", "同学")],
        **over,
    }


def date_question(**over: Any) -> dict[str, Any]:
    return {
        "field": "occurred",
        "prompt": "那是什么时候？",
        "options": [
            {"label": "上个月", "patch": {"occurred": "2026-10"}},
            {"label": "今年夏天", "patch": {"occurred": "2026-07"}},
        ],
        **over,
    }


def parse(raw: Any, d: Draft | None = None) -> list[DraftQuestion]:
    return parse_questions(raw, draft=d or draft(), taxonomy=BUILTIN, entry=ENTRY, today=TODAY)


# --- parse_patch ------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("field", "raw", "expected"),
    [
        (
            QuestionField.RELATIONSHIP_TYPE,
            {"types": [{"category": "social", "subtype": "同事", "original": "同事"}]},
            {"types": [{"category": "social", "subtype": "同事", "original": "同事"}]},
        ),
        (  # a synonym is normalized, the wording kept
            QuestionField.RELATIONSHIP_TYPE,
            {"types": [{"category": "social", "subtype": "哥们"}]},
            {"types": [{"category": "social", "subtype": "朋友", "original": "哥们"}]},
        ),
        (  # null keys of other fields do not count
            QuestionField.MET,
            {"met_at": "2019-05-03", "origin": " 读书会 ", "types": None},
            {"met_at": "2019-05-03", "origin": "读书会"},
        ),
        (QuestionField.OCCURRED, {"occurred": "2026-10"}, {"occurred": "2026-10"}),
    ],
)
def test_legal_patches_are_read(field: QuestionField, raw: Any, expected: Any) -> None:
    patch = parse_patch(field, raw, taxonomy=BUILTIN, entry=ENTRY, today=TODAY)
    assert patch is not None
    assert patch.model_dump(mode="json", exclude_none=True) == expected


def test_a_met_date_is_cut_to_the_entry_precision() -> None:
    patch = parse_patch(
        QuestionField.MET,
        {"met_at": "2015-07-01"},
        taxonomy=BUILTIN,
        entry=PartialDate(2026),
        today=TODAY,
    )
    assert patch is not None and patch.met_at == PartialDate(2015)


@pytest.mark.parametrize(
    ("field", "raw"),
    [
        (QuestionField.RELATIONSHIP_TYPE, {"occurred": "2026-10"}),  # another field
        (
            QuestionField.RELATIONSHIP_TYPE,
            {"types": [{"category": "social", "subtype": "同事"}], "origin": "公司"},
        ),
        (QuestionField.MET, {"types": [{"category": "social", "subtype": "同事"}]}),
        (QuestionField.OCCURRED, {"met_at": "2020"}),
        (QuestionField.RELATIONSHIP_TYPE, {"types": []}),
        (QuestionField.RELATIONSHIP_TYPE, {"types": [{"category": "nope", "subtype": "同事"}]}),
        (QuestionField.RELATIONSHIP_TYPE, {"types": [{"category": "social", "subtype": "其他"}]}),
        (QuestionField.OCCURRED, {"occurred": "2026-12"}),  # the future
        (QuestionField.OCCURRED, {"occurred": "前阵子"}),
        (QuestionField.MET, {"origin": "   "}),
        (QuestionField.MET, {}),
        (QuestionField.MET, None),
        (QuestionField.MET, "2019"),
    ],
)
def test_illegal_patches_are_refused(field: QuestionField, raw: Any) -> None:
    assert parse_patch(field, raw, taxonomy=BUILTIN, entry=ENTRY, today=TODAY) is None


# --- parse_questions ------------------------------------------------------------------


def test_legal_questions_are_numbered() -> None:
    [rel, when] = parse([rel_question(), date_question()])
    assert (rel.id, rel.field, rel.pair, rel.answered) == (
        "q1",
        QuestionField.RELATIONSHIP_TYPE,
        ("我", "小李"),
        False,
    )
    assert (when.id, when.field, when.pair) == ("q2", QuestionField.OCCURRED, None)


@pytest.mark.parametrize(
    "bad",
    [
        rel_question(field="gender"),  # not whitelisted
        rel_question(pair=["我", "小美"]),  # nobody the Draft knows
        rel_question(pair=["小李", "小李"]),
        rel_question(pair=None),
        rel_question(prompt=""),
        rel_question(options=[type_option("同事")]),  # one option
        rel_question(  # the second option also changes the date: only one left
            options=[
                type_option("同事"),
                {"label": "同学", "patch": {"types": [], "occurred": "2026-10"}},
            ]
        ),
        rel_question(options=[type_option("同事"), type_option("同事")]),  # same label
        date_question(options=[{"label": "下个月", "patch": {"occurred": "2026-12"}}] * 2),
        "小李是谁",
    ],
)
def test_illegal_questions_are_dropped(bad: Any) -> None:
    assert parse([bad]) == []


def test_at_most_four_options_and_two_questions_one_per_field_and_pair() -> None:
    many = rel_question(
        options=[type_option(s, s) for s in ("同事", "同学", "朋友", "邻居", "室友")]
    )
    met = {
        "field": "met",
        "pair": ["老张", "我"],
        "prompt": "你和老张怎么认识的？",
        "options": [
            {"label": "同学", "patch": {"origin": "同学"}},
            {"label": "2019 年", "patch": {"met_at": "2019"}},
        ],
    }
    kept = parse([many, rel_question(pair=["小李", "我"]), met, date_question()])
    assert [(q.field, q.pair) for q in kept] == [
        (QuestionField.RELATIONSHIP_TYPE, ("我", "小李")),
        (QuestionField.MET, ("老张", "我")),
    ]
    assert len(kept[0].options) == 4


def test_what_the_draft_already_says_is_not_asked() -> None:
    known = draft(
        relationships=[
            {
                "id": "r1",
                "pair": ["小李", "我"],
                "types": [{"category": "social", "subtype": "同事", "original": "同事"}],
                "met_at": "2020",
                "confidence": "witnessed",
            }
        ],
        persons=[
            {"id": "p1", "mention": "小李", "match": "new"},
            {"id": "p2", "mention": "我", "match": "matched", "person_id": "self", "name": "小明"},
        ],
    )
    met = {
        "field": "met",
        "pair": ["我", "小李"],
        "prompt": "怎么认识的？",
        "options": [
            {"label": "同学", "patch": {"origin": "同学"}},
            {"label": "同事", "patch": {"origin": "同事"}},
        ],
    }
    assert parse([rel_question(), met], known) == []


def test_a_relationship_typed_only_as_other_may_still_be_asked() -> None:
    vague = draft(
        relationships=[
            {
                "id": "r1",
                "pair": ["我", "小李"],
                "types": [{"category": "social", "subtype": "其他", "original": "熟人"}],
                "confidence": "witnessed",
            }
        ],
        persons=[
            {"id": "p1", "mention": "小李", "match": "new"},
            {"id": "p2", "mention": "我", "match": "matched", "person_id": "self", "name": "小明"},
        ],
    )
    assert [q.field for q in parse([rel_question()], vague)] == [QuestionField.RELATIONSHIP_TYPE]


def test_not_a_list_is_no_questions() -> None:
    assert parse(None) == []
    assert parse({"field": "met"}) == []


# --- answer -------------------------------------------------------------------------------


def asked(*raw: dict[str, Any], **extra: Any) -> Draft:
    d = draft(**extra)
    return d.model_copy(update={"questions": parse(list(raw), d)})


def type_patch(subtype: str, original: str | None = None) -> QuestionPatch:
    return QuestionPatch.model_validate(
        {"types": [{"category": "social", "subtype": subtype, "original": original or subtype}]}
    )


def test_an_answer_creates_the_relationship_with_me_and_adds_me() -> None:
    result = answer(
        asked(rel_question()),
        "q1",
        type_patch("同事"),
        answer_text="同事",
        entry=ENTRY,
        self_person=ME,
    )
    d = result.draft
    assert result.occurred is None
    assert [p.mention for p in d.persons] == ["小李", "老张", "我"]
    [rel] = d.relationships
    assert (rel.id, rel.pair, rel.confidence) == ("r1", ("我", "小李"), Confidence.WITNESSED)
    assert [t.subtype for t in rel.types] == ["同事"]
    [q] = d.questions
    assert (q.answered, q.answer) == (True, "同事")
    assert d.facts == draft().facts


def test_an_answer_replaces_only_the_asked_relationships_types() -> None:
    existing = {
        "id": "r1",
        "pair": ["小李", "我"],
        "types": [{"category": "social", "subtype": "其他", "original": "熟人"}],
        "origin": "饭局",
        "status": "active",
        "confidence": "hearsay",
    }
    other = {
        "id": "r2",
        "pair": ["小李", "老张"],
        "types": [{"category": "social", "subtype": "朋友", "original": "朋友"}],
        "confidence": "witnessed",
    }
    persons = [
        {"id": "p1", "mention": "小李", "match": "new"},
        {"id": "p2", "mention": "老张", "match": "new"},
        {"id": "p3", "mention": "我", "match": "matched", "person_id": "self", "name": "小明"},
    ]
    before = asked(rel_question(), relationships=[existing, other], persons=persons)

    after = answer(before, "q1", type_patch("同学"), answer_text="同学", entry=ENTRY).draft

    rel, untouched = after.relationships
    assert rel.pair == ("我", "小李")  # as asked, so a directional type reads right
    assert [t.subtype for t in rel.types] == ["同学"]
    assert (rel.origin, rel.status, rel.confidence) == (
        "饭局",
        before.relationships[0].status,
        Confidence.HEARSAY,
    )
    assert untouched == before.relationships[1]
    assert after.persons == before.persons


def test_a_met_answer_sets_only_what_it_says() -> None:
    met = {
        "field": "met",
        "pair": ["我", "小李"],
        "prompt": "怎么认识的？",
        "options": [
            {"label": "同学", "patch": {"origin": "同学"}},
            {"label": "同事", "patch": {"origin": "同事"}},
        ],
    }
    d = answer(
        asked(met),
        "q1",
        QuestionPatch(origin="读书会"),
        answer_text="读书会上",
        entry=ENTRY,
        self_person=ME,
    ).draft
    [rel] = d.relationships
    assert (rel.origin, rel.met_at, rel.types) == ("读书会", None, [])


def test_an_occurred_answer_retimes_the_dates_anchored_on_the_old_date() -> None:
    result = answer(
        asked(date_question()),
        "q1",
        QuestionPatch(occurred=PartialDate(2026, 10)),
        answer_text="上个月",
        entry=ENTRY,
    )
    assert result.occurred == PartialDate(2026, 10)
    assert result.draft.facts[0].valid_at == PartialDate(2026, 10)
    assert result.draft.questions[0].answered


def test_a_patch_of_another_field_or_a_vanished_person_is_outdated() -> None:
    d = asked(rel_question())
    with pytest.raises(QuestionOutdatedError):
        answer(
            d,
            "q1",
            QuestionPatch(occurred=PartialDate(2026, 10)),
            answer_text="x",
            entry=ENTRY,
            self_person=ME,
        )
    without_me = asked(rel_question(pair=["老张", "小李"]))
    gone = without_me.model_copy(update={"persons": without_me.persons[:1]})
    with pytest.raises(QuestionOutdatedError):
        answer(gone, "q1", type_patch("同事"), answer_text="同事", entry=ENTRY)
    with pytest.raises(QuestionOutdatedError):  # 我 is needed but not given
        answer(d, "q1", type_patch("同事"), answer_text="同事", entry=ENTRY)
    with pytest.raises(KeyError):
        answer(d, "q5", type_patch("同事"), answer_text="同事", entry=ENTRY)


def test_question_ids_are_unique_and_patches_fit_their_field() -> None:
    q = parse([rel_question()])[0].model_dump(mode="json")
    with pytest.raises(ValueError):
        draft(questions=[q, q])
    wrong = {**q, "options": [{"label": "上个月", "patch": {"occurred": "2026-10"}}] * 2}
    with pytest.raises(ValueError):
        DraftQuestion.model_validate(wrong)
    with pytest.raises(ValueError):
        DraftQuestion.model_validate({**q, "field": "occurred"})  # an occurred one has no pair
