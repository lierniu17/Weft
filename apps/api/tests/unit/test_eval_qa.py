"""Q&A quality eval: the question set is well-formed and the scorer computes per-kind
accuracy and the fabrication rate (AC-36, AC-38). Never calls an API."""

from __future__ import annotations

import json
from collections import Counter

import pytest

from weft.domain.answer import (
    Answer,
    AnswerClarify,
    AnswerClarifyOption,
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
    questions = [x for x in load_questions(QUESTIONS_PATH) if x.split is None]
    kinds = Counter(x.kind for x in questions)
    assert len(questions) == 43  # the original set, never changed (AC-12: no regression)
    assert sum(n for k, n in kinds.items() if k != "no_answer") >= 30
    assert kinds["no_answer"] == 10
    assert all(
        kinds[k] >= 5 for k in KINDS if k not in ("no_answer", "confirm", "follow_up", "describe")
    )
    for x in questions:
        assert (x.kind == "no_answer") == x.gold.no_answer, x.id
        has_gold = x.gold.persons or x.gold.text or x.gold.path or x.gold.count is not None
        assert x.gold.no_answer or has_gold, x.id


def test_the_conversation_questions_are_split_into_dev_and_heldout() -> None:
    """AC-12: about 20 new questions — 同名指代, 一人多事, 连续追问 (2 and 3 rounds, timed
    out, a new topic) — each in dev (prompt iteration) or held-out (judged)."""
    everything = load_questions(QUESTIONS_PATH)
    assert len({x.id for x in everything}) == len(everything)
    new = [x for x in everything if x.split is not None]
    assert 20 <= len(new) <= 80  # dev (incl. earlier held-out sets) + held-out
    assert {x.kind for x in new} == {"confirm", "follow_up", "describe"}
    for split in ("dev", "heldout"):
        part = [x for x in new if x.split == split]
        assert any(x.gold.clarify for x in part), split
        assert any(x.kind == "confirm" and not x.gold.clarify for x in part), split
        assert any(x.kind == "follow_up" for x in part), split
    follow_ups = [x for x in new if x.kind == "follow_up"]
    assert all(x.history for x in follow_ups)
    assert {len(x.history) for x in follow_ups} >= {1, 2}  # 2 and 3 rounds
    assert any(x.history_minutes_ago > 30 for x in follow_ups)  # timed out
    assert any(x.gold.used_history is False and not x.gold.no_answer for x in follow_ups)
    assert all(x.gold.clarify or x.gold.no_answer or x.gold.text or x.gold.persons for x in new)
    assert not [
        x.id for x in everything if x.split is None and x.kind != "no_answer" and x.gold.no_answer
    ]


def test_the_describe_questions_cover_one_several_and_no_match() -> None:
    """context-gaps AC-5: describe-a-person questions in dev and held-out, each with
    questions answered by one person, confirmed among several, and matching nobody."""
    described = [x for x in load_questions(QUESTIONS_PATH) if x.kind == "describe"]
    for split in ("dev", "heldout"):
        part = [x for x in described if x.split == split]
        assert any(x.gold.persons and not x.gold.clarify for x in part), split
        assert any(x.gold.clarify and len(x.gold.persons) >= 2 for x in part), split
        assert any(x.gold.no_answer for x in part), split


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


# --- 对话上下文 (AC-12) ---------------------------------------------------------------------


def confirmation(*labels: str) -> Answer:
    return Answer(
        kind=AnswerKind.CLARIFY,
        segments=[AnswerSegment(text="你问的是哪位？")],
        citations=[],
        persons=[],
        follow_ups=[],
        clarify=AnswerClarify(
            question="你问的是哪位？",
            options=[AnswerClarifyOption(label=label, question=f"{label}？") for label in labels],
        ),
    )


def test_a_confirmation_question_needs_a_candidate_for_each_expected_one() -> None:
    gold = q(kind="confirm", gold={"clarify": True, "persons": ["周涛", "周建国"]})
    assert grade(gold, confirmation("老周（周涛）", "老周（周建国）"), ALIASES).correct
    one = grade(gold, confirmation("老周（周涛）", "老周（某人）"), ALIASES)
    assert not one.correct and "周建国" in one.reason
    direct = grade(gold, answer(AnswerKind.TEXT, "周涛喜欢钓鱼"), ALIASES)
    assert not direct.correct and "without confirming" in direct.reason
    events = q(kind="confirm", gold={"clarify": True, "text": ["升职", "买房"]})
    assert grade(events, confirmation("升职（6 月）", "买房（10 月）"), ALIASES).correct


def test_confirming_when_the_answer_is_clear_is_wrong() -> None:
    gold = q(kind="confirm", gold={"text": ["钓鱼"]})
    result = grade(gold, confirmation("老周（周涛）", "老周（周建国）"), ALIASES)
    assert not result.correct and "asked to confirm" in result.reason


def test_a_follow_up_checks_whether_the_history_was_used_and_who_it_is_about() -> None:
    gold = q(kind="follow_up", gold={"text": ["中学"], "used_history": True})
    good = answer(AnswerKind.TEXT, "黄丽是中学老师。")
    assert grade(gold, good, ALIASES, used_history=True).correct
    assert not grade(gold, good, ALIASES, used_history=False).correct
    topic = q(kind="follow_up", gold={"text": ["杭州"], "not_persons": ["张伟"]})
    assert grade(topic, answer(AnswerKind.TEXT, "陈静住在杭州。"), ALIASES).correct
    assert not grade(topic, answer(AnswerKind.TEXT, "陈静住在杭州，老张也在。"), ALIASES).correct


def test_the_report_has_confirm_false_confirm_and_follow_up_rates_per_split() -> None:
    questions = [
        q(id="c1", kind="confirm", split="dev", gold={"clarify": True, "persons": ["张伟"]}),
        q(id="c2", kind="confirm", split="heldout", gold={"clarify": True, "persons": ["张伟"]}),
        q(id="s1", kind="confirm", split="heldout", gold={"text": ["急性子"]}),
        q(
            id="f1",
            kind="follow_up",
            split="heldout",
            history=["老张呢？"],
            gold={"text": ["靠谱"]},
        ),
        q(id="p1", kind="profile", gold={"text": ["急性子"]}),
    ]
    answers = {
        "c1": confirmation("老张（张伟）", "老张（某人）"),
        "c2": answer(AnswerKind.TEXT, "急性子"),
        "s1": confirmation("老张（张伟）", "老张（某人）"),
        "f1": answer(AnswerKind.TEXT, "靠谱"),
        "p1": answer(AnswerKind.TEXT, "急性子"),
    }
    report = score(questions, answers, ALIASES, errors={}, used_history={"f1": True})
    assert report["confirm_rate"] == 0.5
    assert report["false_confirm_rate"] == pytest.approx(1 / 3)
    assert report["false_confirmed"] == ["s1"]
    assert report["follow_up_accuracy"] == 1.0
    assert report["passed"] is False
    splits = report["splits"]
    assert set(splits) == {"base", "dev", "heldout"}
    assert splits["dev"]["confirm_rate"] == 1.0 and splits["heldout"]["confirm_rate"] == 0.0
    assert splits["base"]["confirm_rate"] is None and splits["base"]["passed"] is True


def test_a_question_that_errored_counts_as_wrong() -> None:
    questions = [q(id="p1", kind="profile", gold={"text": ["急性子"]})]
    report = score(questions, {}, ALIASES, errors={"p1": "LLMHTTPError"})
    assert report["per_kind"]["profile"]["correct"] == 0
    assert report["errors"] == {"p1": "LLMHTTPError"}
