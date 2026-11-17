"""Q&A quality eval: the question set is well-formed and the scorer computes per-kind
accuracy and the fabrication rate (AC-36, AC-38). Never calls an API."""

from __future__ import annotations

import json
from collections import Counter

import pytest

from weft.domain.answer import (
    Answer,
    AnswerKind,
    AnswerListItem,
    AnswerSegment,
    AnswerStat,
    Citation,
    PersonRef,
)
from weft.domain.confidence import Confidence
from weft.domain.dates import PartialDate
from weft.eval.qa_score import (
    KINDS,
    QUESTIONS_PATH,
    Question,
    grade,
    load_questions,
    score,
)

pytestmark = pytest.mark.unit

ALIASES = {"张伟": ("老张",), "王浩": ("小王",), "李明": ("小李",)}
ME = PersonRef(person_id="me", name="小明", is_self=True)
ZHANG = PersonRef(person_id="z", name="张伟")
WANG = PersonRef(person_id="w", name="王浩")
LI = PersonRef(person_id="l", name="李明")
CITE = Citation(
    index=1,
    entry_id="e1",
    entry_excerpt="原文",
    occurred_on=PartialDate(2026),
    confidence=Confidence.WITNESSED,
)


def answer(kind: AnswerKind, text: str, **kw: object) -> Answer:
    cited = kind is not AnswerKind.NO_ANSWER
    return Answer(
        kind=kind,
        segments=[AnswerSegment(text=text, citations=(1,) if cited else ())],
        citations=[CITE] if cited else [],
        persons=kw.pop("persons", []),  # type: ignore[arg-type]
        follow_ups=[],
        **kw,  # type: ignore[arg-type]
    )


def q(**kw: object) -> Question:
    return Question.model_validate({"id": "x", "question": "?", **kw})


# --- the dataset -------------------------------------------------------------------


def test_the_question_set_covers_six_kinds_and_ten_no_answer_questions() -> None:
    questions = load_questions(QUESTIONS_PATH)
    kinds = Counter(x.kind for x in questions)
    assert len({x.id for x in questions}) == len(questions)
    assert sum(n for k, n in kinds.items() if k != "no_answer") >= 30
    assert kinds["no_answer"] == 10
    assert all(kinds[k] >= 5 for k in KINDS if k != "no_answer")
    for x in questions:
        assert (x.kind == "no_answer") == x.gold.no_answer, x.id
        has_gold = x.gold.persons or x.gold.text or x.gold.path or x.gold.count is not None
        assert x.gold.no_answer or has_gold, x.id


def test_the_question_file_is_one_json_object_per_line() -> None:
    lines = QUESTIONS_PATH.read_text(encoding="utf-8").splitlines()
    assert all(json.loads(line)["question"].strip() for line in lines if line.strip())


# --- grading one answer --------------------------------------------------------------


def test_text_answers_need_every_expected_keyword_one_of_each_alternative() -> None:
    gold = q(kind="profile", gold={"text": ["急性子", "靠谱|可靠"]})
    assert grade(gold, answer(AnswerKind.TEXT, "老张是急性子，做事可靠。"), ALIASES).correct
    missing = grade(gold, answer(AnswerKind.TEXT, "老张是急性子。"), ALIASES)
    assert not missing.correct and "靠谱|可靠" in missing.reason


def test_persons_count_by_name_or_alias_in_any_part_of_the_answer() -> None:
    gold = q(kind="relationship", gold={"persons": ["张伟", "李明"]})
    by_text = answer(AnswerKind.TEXT, "老张和小李是室友。")
    by_chips = answer(AnswerKind.TEXT, "他俩是室友。", persons=[ZHANG, LI])
    assert grade(gold, by_text, ALIASES).correct and grade(gold, by_chips, ALIASES).correct


def test_exact_person_lists_reject_extra_and_missing_persons() -> None:
    gold = q(kind="filter", gold={"persons": ["张伟", "王浩"], "persons_exact": True})

    def listed(*refs: PersonRef) -> Answer:
        items = [AnswerListItem(person_id=r.person_id, name=r.name, citations=[1]) for r in refs]
        return answer(AnswerKind.LIST, "有：", items=items)

    assert grade(gold, listed(ZHANG, WANG), ALIASES).correct
    assert not grade(gold, listed(ZHANG, WANG, LI), ALIASES).correct
    assert not grade(gold, listed(ZHANG), ALIASES).correct


def test_paths_must_follow_the_expected_chain() -> None:
    gold = q(kind="path", gold={"path": ["我", "张伟", "王浩"]})
    good = answer(AnswerKind.PATH, "通过老张。", path=[ME, ZHANG, WANG])
    wrong = answer(AnswerKind.PATH, "通过小李。", path=[ME, LI, WANG])
    by_text = answer(AnswerKind.TEXT, "你是通过老张认识小王的。")
    assert grade(gold, good, ALIASES).correct
    assert not grade(gold, wrong, ALIASES).correct
    assert grade(gold, by_text, ALIASES).correct  # chain named in order in the text


def test_counts_come_from_the_stat_or_the_text() -> None:
    gold = q(kind="count", gold={"count": 2})
    stat = answer(AnswerKind.STAT, "有 2 个。", stat=AnswerStat(count=2, persons=[ZHANG, WANG]))
    assert grade(gold, stat, ALIASES).correct
    assert grade(gold, answer(AnswerKind.TEXT, "一共 2 个人。"), ALIASES).correct
    assert not grade(gold, answer(AnswerKind.TEXT, "一共 3 个人。"), ALIASES).correct


def test_answering_a_no_answer_question_is_a_fabrication() -> None:
    gold = q(kind="no_answer", gold={"no_answer": True})
    assert grade(gold, answer(AnswerKind.NO_ANSWER, "图谱里没有相关信息。"), ALIASES).correct
    made_up = grade(gold, answer(AnswerKind.TEXT, "老王喜欢滑雪。"), ALIASES)
    assert not made_up.correct and made_up.fabricated


def test_no_answer_to_an_answerable_question_is_wrong_but_not_fabricated() -> None:
    gold = q(kind="profile", gold={"text": ["急性子"]})
    result = grade(gold, answer(AnswerKind.NO_ANSWER, "图谱里没有相关信息。"), ALIASES)
    assert not result.correct and not result.fabricated


# --- the report -----------------------------------------------------------------------


def test_the_report_has_per_kind_accuracy_and_the_fabrication_rate() -> None:
    questions = [
        q(id="p1", kind="profile", gold={"text": ["急性子"]}),
        q(id="p2", kind="profile", gold={"text": ["靠谱"]}),
        q(id="n1", kind="no_answer", gold={"no_answer": True}),
        q(id="n2", kind="no_answer", gold={"no_answer": True}),
    ]
    answers = {
        "p1": answer(AnswerKind.TEXT, "急性子"),
        "p2": answer(AnswerKind.TEXT, "不清楚"),
        "n1": answer(AnswerKind.NO_ANSWER, "没有"),
        "n2": answer(AnswerKind.TEXT, "编的"),
    }
    report = score(questions, answers, ALIASES, errors={})
    assert report["per_kind"]["profile"] == {"total": 2, "correct": 1, "accuracy": 0.5}
    assert report["fabrication_rate"] == 0.5
    assert report["fabricated"] == ["n2"]
    assert report["accuracy"] == 0.5
    assert report["passed"] is False  # fabrication must be 0


def test_a_question_that_errored_counts_as_wrong() -> None:
    questions = [q(id="p1", kind="profile", gold={"text": ["急性子"]})]
    report = score(questions, {}, ALIASES, errors={"p1": "LLMHTTPError"})
    assert report["per_kind"]["profile"]["correct"] == 0
    assert report["errors"] == {"p1": "LLMHTTPError"}
