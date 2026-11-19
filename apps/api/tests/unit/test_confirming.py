"""指代确认 decided in code (conversation-context AC-1): a confirmation the question itself
settles is not asked; a 「那事」 question about someone with several events is."""

from __future__ import annotations

import pytest

from weft.domain.answer import AnswerClarify, AnswerClarifyOption
from weft.domain.confirming import (
    EventFact,
    identified_option,
    identified_person,
    matter_events,
    matter_of,
)

pytestmark = pytest.mark.unit

TAO = AnswerClarifyOption(
    label="老周（周涛，大学同学）", question="周涛在哪工作？", person_id="tao"
)
JIANGUO = AnswerClarifyOption(
    label="老周（周建国，邻居）", question="周建国在哪工作？", person_id="jg"
)
LAOZHOU = AnswerClarify(question="你问的是哪位老周？", options=[TAO, JIANGUO])
GRAPH = {  # what the graph says about each: name, aliases, my relationship, where we met
    "tao": ["周涛", "老周", "同学", "大学同学", "浙江大学同班"],
    "jg": ["周建国", "老周", "邻居", "老家的老邻居", "老家"],
}


@pytest.mark.parametrize(
    ("question", "meant"),
    [
        ("我的大学同学老周现在在哪工作？", TAO),  # the label's relation
        ("老家的邻居老周喜欢干什么？", JIANGUO),  # the graph's relation and origin
        ("浙江大学同班的老周在哪？", TAO),  # where we met
        ("周建国那个老周在哪？", JIANGUO),  # the full name
    ],
)
def test_a_question_naming_who_it_means_needs_no_confirmation(
    question: str, meant: AnswerClarifyOption
) -> None:
    assert identified_option(question, LAOZHOU, GRAPH) == meant


@pytest.mark.parametrize(
    "question",
    [
        "老周喜欢什么？",  # only the shared alias
        "老周最近怎么样？",
        "我那个同学兼邻居老周在哪？",  # both fit: still a choice
    ],
)
def test_a_question_that_fits_several_or_none_still_confirms(question: str) -> None:
    assert identified_option(question, LAOZHOU, GRAPH) is None


def test_words_both_candidates_share_identify_nobody() -> None:
    neighbours = AnswerClarify(
        question="你问的是哪位邻居？",
        options=[
            AnswerClarifyOption(
                label="邻居（周建国）", question="周建国最近怎么样？", person_id="jg"
            ),
            AnswerClarifyOption(label="邻居（林芳）", question="林芳最近怎么样？", person_id="lf"),
        ],
    )
    graph = {"jg": GRAPH["jg"], "lf": ["林芳", "邻居", "搬家"]}
    assert identified_option("我那个邻居最近怎么样？", neighbours, graph) is None
    assert identified_option("搬家后认识的那个邻居最近怎么样？", neighbours, graph) is not None


def test_the_label_alone_is_enough_without_the_graph() -> None:
    assert identified_option("我的大学同学老周现在在哪工作？", LAOZHOU) == TAO


def test_an_event_named_in_the_question_is_that_event() -> None:
    events = AnswerClarify(
        question="你说的是郭佳哪件事？",
        options=[
            AnswerClarifyOption(label="升职（2026 年 6 月）", question="郭佳升职后来怎么样了？"),
            AnswerClarifyOption(label="买房（2026 年 10 月）", question="郭佳买房后来怎么样了？"),
        ],
    )
    assert identified_option("郭佳买房那事后来怎么样了？", events) == events.options[1]
    assert identified_option("郭佳那事后来怎么样了？", events) is None
    assert identified_option("郭佳 2026 年那事怎么样了？", events) is None  # dates are no names


@pytest.mark.parametrize(
    ("question", "meant"),
    [
        ("老家邻居老周那件事后来怎么样了？", "jg"),  # 老家, 邻居: only 周建国's
        ("大学同学老周那事怎么样了？", "tao"),
        ("周涛那个老周那事呢？", "tao"),  # the full name
        ("老周那件事后来怎么样了？", None),  # the shared alias alone
        ("我那个同学兼邻居老周那事呢？", None),  # both fit
    ],
)
def test_the_question_narrows_a_name_several_persons_answer_to(
    question: str, meant: str | None
) -> None:
    assert identified_person(question, GRAPH) == meant


def test_a_name_one_person_answers_to_needs_no_narrowing() -> None:
    assert identified_person("周建国那事呢？", {"jg": GRAPH["jg"]}) == "jg"
    assert identified_person("谁那事呢？", {}) is None


@pytest.mark.parametrize(
    ("question", "who"),
    [
        ("小李那件事后来怎么样了？", "小李"),
        ("唐亮那事后来怎么样了？", "唐亮"),
        ("郭佳那个事是什么时候的？", "郭佳"),
        ("老张和小李那事后来怎么样了？", "老张和小李"),
        ("老周那事儿咋样了", "老周"),
        ("老周喜欢什么？", None),
        ("那他老婆呢？", None),
        ("他的同事是谁？", None),
    ],
)
def test_a_matter_question_says_whose_matter(question: str, who: str | None) -> None:
    assert matter_of(question) == who


def fact(
    fid: str, predicate: str, subject: str, obj: str | None = None, *, ended: bool = False
) -> EventFact:
    return EventFact(fid, predicate, subject, obj, f"{subject} {predicate}", ended)


LI_FACTS = [
    fact("f1", "STUDIED_AT", "li"),
    fact("f2", "WORKS_AT", "li", ended=True),  # 字节跳动, until 2026-09
    fact("f3", "WORKS_AT", "li"),  # 阿里巴巴, from 2026-09: the same change
    fact("f4", "RELATED_EVENT", "zhang", "li"),  # 和老张闹掰
    fact("f5", "LIKES", "li"),
    fact("f6", "EXPERIENCED", "zhang"),  # someone else's
]


def test_events_are_life_events_events_between_persons_and_changes() -> None:
    assert [e.id for e in matter_events(LI_FACTS, {"li"})] == ["f2", "f4"]


def test_a_matter_of_two_persons_counts_only_what_involves_both() -> None:
    assert [e.id for e in matter_events(LI_FACTS, {"li", "zhang"})] == ["f4"]


def test_facts_shown_twice_count_once_and_nobody_has_no_events() -> None:
    assert len(matter_events([*LI_FACTS, *LI_FACTS], {"li"})) == 2
    assert matter_events(LI_FACTS, set()) == []
    assert matter_events([fact("x", "EXPERIENCED", "luo")], {"luo"}) != []
