"""按描述找人 (context-gaps AC-3): parsing a description out of a question, and which
persons the graph's facts and relationships say it fits."""

from __future__ import annotations

import pytest

from weft.domain.describing import (
    Description,
    KnownFact,
    Trait,
    anchors,
    description,
    matching,
    may_describe,
)
from weft.domain.taxonomy import RELATION_WORDS

pytestmark = pytest.mark.unit


def parse(text: str) -> Description | None:
    return description(text, RELATION_WORDS)


@pytest.mark.parametrize(
    ("question", "phrase", "trait", "value", "word"),
    [
        (
            "在市一院上班的那个邻居叫什么？",
            "在市一院上班的那个邻居",
            Trait.WORKS_AT,
            "市一院",
            "邻居",
        ),
        ("在腾讯工作的朋友喜欢什么？", "在腾讯工作的朋友", Trait.WORKS_AT, "腾讯", "朋友"),
        ("在市一院当护士的那位是谁？", "在市一院当护士的那位", Trait.WORKS_AT, "市一院", None),
        ("住在杭州的那个同学喜欢什么？", "住在杭州的那个同学", Trait.LIVES_IN, "杭州", "同学"),
        (
            "在浙江大学读书的那个人是谁？",
            "在浙江大学读书的那个人",
            Trait.STUDIED_AT,
            "浙江大学",
            None,
        ),
        ("浙大毕业的那个同事叫什么？", "浙大毕业的那个同事", Trait.STUDIED_AT, "浙大", "同事"),
        ("老张介绍的那个朋友在哪工作？", "老张介绍的那个朋友", Trait.INTRODUCED_BY, "老张", "朋友"),
        ("老张认识的那个人喜欢什么？", "老张认识的那个人", Trait.INTRODUCED_BY, "老张", None),
    ],
)
def test_a_description_is_split_into_trait_value_and_relation_word(
    question: str, phrase: str, trait: Trait, value: str, word: str | None
) -> None:
    d = parse(question)
    assert d is not None
    assert (d.phrase, d.trait, d.value, d.word, d.past) == (phrase, trait, value, word, False)


@pytest.mark.parametrize(
    "question",
    [
        "在华为上班的那个老周喜欢什么？",  # a name follows: no description
        "我认识的人里谁在腾讯工作？",
        "我认识的人里有几个在字节跳动上班？",
        "在字节跳动上班的同事有哪些？",  # several asked for: a list, not one person
        "老周住在哪？",
        "我和老周是怎么认识的？",
        "大学同学老周以前在哪上学？",
        "陈静住在哪里？",
        "我认识的那个朋友叫什么？",  # 我 introduces nobody to me
    ],
)
def test_questions_without_a_description(question: str) -> None:
    assert parse(question) is None


def test_a_former_job_is_a_past_description() -> None:
    for question in ("以前在百度上班的那个合伙人是谁？", "在百度上过班的那个人是谁？"):
        d = parse(question)
        assert d is not None and d.past and d.value == "百度", question
    d = parse("以前在百度上班的那个合伙人是谁？")
    assert d is not None and d.phrase == "以前在百度上班的那个合伙人"


def test_a_relation_word_of_the_users_own_counts() -> None:
    d = description("在健身房上班的那个健身教练叫什么？", {*RELATION_WORDS, "健身教练"})
    assert d is not None and d.word == "健身教练"


def test_naming_the_person_instead_keeps_the_description() -> None:
    d = parse("在腾讯上班的那个人喜欢什么？")
    assert d is not None
    assert d.named("在腾讯上班的那个人喜欢什么？", "王浩") == "在腾讯上班的王浩喜欢什么？"


def test_the_introducer_is_found_at_the_end_of_what_precedes() -> None:
    d = parse("我想问老张介绍的那个朋友喜欢什么")
    assert d is not None and d.value == "我想问老张"
    assert anchors("我想问老张")[:2] == ["我想问老张", "想问老张"]
    assert "老张" in anchors("我想问老张")
    narrowed = d.anchored("老张")
    assert (narrowed.phrase, narrowed.core, narrowed.value) == (
        "老张介绍的那个朋友",
        "老张介绍的",
        "老张",
    )


# --- matching ---------------------------------------------------------------------------

FACTS = [
    KnownFact("lin", "WORKS_AT", "市一院"),
    KnownFact("lin", "LIKES", "露营"),
    KnownFact("zhou", "LIKES", "下象棋"),
    KnownFact("wang", "WORKS_AT", "腾讯"),
    KnownFact("liu", "WORKS_AT", "腾讯"),
    KnownFact("zheng", "WORKS_AT", "百度", current=False),
    KnownFact("chen", "LIVES_IN", "杭州"),
    KnownFact("chen", "STUDIED_AT", "浙江大学", current=False),
]
PEOPLE = ["lin", "zhou", "wang", "liu", "zheng", "chen"]


def fits(question: str, *, relatives=None, introduced_by=None, introducers=()) -> list[str]:
    d = parse(question)
    assert d is not None
    return matching(
        d,
        PEOPLE,
        FACTS,
        relatives=relatives,
        introduced_by=introduced_by or {},
        introducers=introducers,
    )


def test_one_neighbour_works_at_the_hospital() -> None:
    assert fits("在市一院上班的那个邻居叫什么？", relatives={"lin", "zhou"}) == ["lin"]


def test_several_or_none_fit() -> None:
    assert fits("在腾讯上班的那个人喜欢什么？") == ["wang", "liu"]
    assert fits("在腾讯上班的那个朋友叫什么？", relatives={"wang"}) == ["wang"]
    assert fits("在京东上班的那个邻居叫什么？", relatives={"lin", "zhou"}) == []
    assert fits("在腾讯上班的那个邻居叫什么？", relatives={"lin", "zhou"}) == []


def test_a_former_job_needs_a_past_description_a_school_never() -> None:
    assert fits("在百度上班的那个人是谁？") == []
    assert fits("以前在百度上班的那个人是谁？") == ["zheng"]
    assert fits("在浙江大学读书的那个人是谁？") == ["chen"]


def test_a_place_contained_either_way_fits() -> None:
    assert fits("住在杭州的那个人是谁？") == ["chen"]  # the fact says 杭州
    assert fits("在市一院急诊科上班的那个人是谁？") == ["lin"]  # the fact says 市一院
    assert fits("在浙大读书的那个人是谁？") == []  # an abbreviation is not the same words


def test_who_introduced_me_to_them() -> None:
    introduced = {"wang": {"zhang"}, "du": {"ting"}}
    assert fits(
        "老张介绍的那个朋友在哪工作？", introduced_by=introduced, introducers={"zhang"}
    ) == ["wang"]
    assert fits("老张介绍的那个朋友在哪工作？", introduced_by=introduced, introducers={"x"}) == []


def test_a_question_without_any_trait_is_ruled_out_cheaply() -> None:
    assert may_describe("在市一院上班的那个邻居叫什么？")
    assert may_describe("老张介绍的那个朋友在哪工作？")
    assert not may_describe("老张喜欢什么？")
    assert not may_describe("我老婆的闺蜜是做什么的？")
