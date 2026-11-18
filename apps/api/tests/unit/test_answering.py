"""Building the Answer from the model's final answer and the tools' evidence (AC-37, AC-38).

The model only ever sees short handles: persons ``P1`` …, evidence ``E1`` … . Whatever it
cites is resolved here against what the tools actually returned, so it cannot invent a
person, an Entry or a Confidence.
"""

from __future__ import annotations

import pytest

from weft.domain.answer import AnswerKind, PersonRef
from weft.domain.answering import (
    NO_ANSWER_TEXT,
    Evidence,
    FinalAnswer,
    Source,
    build_answer,
    hedge,
)
from weft.domain.confidence import Confidence
from weft.domain.dates import PartialDate

pytestmark = pytest.mark.unit

ME = PersonRef(person_id="id-me", name="小明", is_self=True)
ZHANG = PersonRef(person_id="id-zhang", name="张伟")
LI = PersonRef(person_id="id-li", name="李明")
WANG = PersonRef(person_id="id-wang", name="王浩")
PERSONS = {"P1": ME, "P2": ZHANG, "P3": LI, "P4": WANG}

ROOMMATES = Source(
    "entry-1",
    "听小王说，老张和小李以前是大学室友，今年九月因为借钱的事闹掰了。",
    PartialDate(2026, 10, 8),
)
HIRED = Source("entry-2", "2018 年入职字节跳动，认识了同组的张伟。", PartialDate(2026, 3, 12))
EVIDENCE = {
    "E1": Evidence("E1", Confidence.HEARSAY, (ROOMMATES,), pair=(ZHANG, LI)),
    "E2": Evidence("E2", Confidence.WITNESSED, (HIRED,)),
    "E3": Evidence("E3", Confidence.WITNESSED, (HIRED,), is_opinion=True),
}


def final(**kw: object) -> FinalAnswer:
    return FinalAnswer.model_validate({"kind": "text", **kw})


def test_every_claim_cites_the_entries_behind_its_evidence() -> None:
    answer = build_answer(
        final(
            segments=[
                {
                    "text": "据小王说，老张和小李是大学室友，后来因为借钱闹掰了。",
                    "evidence": ["E1"],
                },
                {"text": "老张 2018 年起在字节跳动工作。", "evidence": ["E2", "E99"]},
            ],
            persons=["P2", "P3", "P77"],
            follow_ups=["他俩什么时候认识的？"],
        ),
        EVIDENCE,
        PERSONS,
    )
    assert answer.kind is AnswerKind.TEXT
    assert [s.citations for s in answer.segments] == [(1,), (2,)]
    first, second = answer.citations
    assert (first.entry_id, first.confidence, first.pair) == (
        "entry-1",
        Confidence.HEARSAY,
        (ZHANG, LI),
    )
    assert first.entry_excerpt == ROOMMATES.excerpt and first.occurred_on == PartialDate(
        2026, 10, 8
    )
    assert (second.entry_id, second.confidence) == ("entry-2", Confidence.WITNESSED)
    assert answer.persons == [ZHANG, LI]  # unknown handles are dropped
    assert answer.follow_ups == ["他俩什么时候认识的？"]


def test_a_claim_citing_nothing_real_carries_no_citation() -> None:
    answer = build_answer(
        final(
            segments=[
                {"text": "老张在字节。", "evidence": ["E2"]},
                {"text": "他很高。", "evidence": ["E42"]},
            ]
        ),
        EVIDENCE,
        PERSONS,
    )
    assert [s.citations for s in answer.segments] == [(1,), ()]


@pytest.mark.parametrize(
    ("text", "evidence", "expected"),
    [
        ("老张和小李闹掰了。", "E1", "据转述，老张和小李闹掰了。"),
        ("据小王说，老张和小李闹掰了。", "E1", "据小王说，老张和小李闹掰了。"),
        ("听说老张和小李闹掰了。", "E1", "听说老张和小李闹掰了。"),
        ("老张很靠谱。", "E3", "你的评价：老张很靠谱。"),
        ("你评价老张很靠谱。", "E3", "你评价老张很靠谱。"),
        ("老张在字节。", "E2", "老张在字节。"),
    ],
)
def test_hearsay_inference_and_opinions_are_said_so_in_the_text(
    text: str, evidence: str, expected: str
) -> None:
    assert hedge(text, [EVIDENCE[evidence]]) == expected


def test_an_inferred_claim_is_marked_as_a_guess() -> None:
    guess = Evidence("E9", Confidence.INFERRED, (HIRED,))
    assert hedge("小李对我冷淡了。", [guess]) == "推测：小李对我冷淡了。"
    assert hedge("小李可能对我冷淡了。", [guess]) == "小李可能对我冷淡了。"


def test_no_evidence_at_all_means_no_answer_whatever_the_model_says() -> None:
    answer = build_answer(
        final(segments=[{"text": "老王喜欢滑雪。", "evidence": []}], persons=["P2"]), {}, PERSONS
    )
    assert answer.kind is AnswerKind.NO_ANSWER
    assert [s.text for s in answer.segments] == [NO_ANSWER_TEXT]
    assert answer.citations == [] and answer.persons == []


def test_an_answer_whose_claims_cite_nothing_becomes_no_answer() -> None:
    answer = build_answer(final(segments=[{"text": "老王喜欢滑雪。"}]), EVIDENCE, PERSONS)
    assert answer.kind is AnswerKind.NO_ANSWER


def test_the_model_saying_no_answer_is_kept_without_citations() -> None:
    answer = build_answer(
        FinalAnswer.model_validate(
            {"kind": "no_answer", "segments": [{"text": "不知道", "evidence": ["E1"]}]}
        ),
        EVIDENCE,
        PERSONS,
    )
    assert answer.kind is AnswerKind.NO_ANSWER and answer.citations == []


def test_a_path_answer_lists_the_chain_of_known_persons() -> None:
    answer = build_answer(
        FinalAnswer.model_validate(
            {
                "kind": "path",
                "segments": [{"text": "你是通过老张认识小王的。", "evidence": ["E2"]}],
                "path": ["P1", "P2", "P4"],
            }
        ),
        EVIDENCE,
        PERSONS,
    )
    assert answer.kind is AnswerKind.PATH
    assert answer.path == [ME, ZHANG, WANG]


def test_self_is_never_a_related_person_chip() -> None:
    """我 stays in the path chain (「我 → 老张 → 小王」) but is not a chip of its own."""
    answer = build_answer(
        FinalAnswer.model_validate(
            {
                "kind": "path",
                "segments": [{"text": "你是通过老张认识小王的。", "evidence": ["E2"]}],
                "path": ["P1", "P2", "P4"],
                "persons": ["P1", "P2"],
            }
        ),
        EVIDENCE,
        PERSONS,
    )
    assert answer.path == [ME, ZHANG, WANG]
    assert answer.persons == [ZHANG, WANG]


def test_a_path_with_fewer_than_two_known_persons_falls_back_to_text() -> None:
    answer = build_answer(
        FinalAnswer.model_validate(
            {
                "kind": "path",
                "segments": [{"text": "老张。", "evidence": ["E2"]}],
                "path": ["P2", "P9"],
            }
        ),
        EVIDENCE,
        PERSONS,
    )
    assert answer.kind is AnswerKind.TEXT and answer.path is None


def test_list_items_and_stat_counts_come_from_known_persons() -> None:
    listed = build_answer(
        FinalAnswer.model_validate(
            {
                "kind": "list",
                "segments": [{"text": "喜欢露营的有：", "evidence": []}],
                "items": [
                    {"person": "P4", "subtitle": "喜欢露营", "evidence": ["E2"]},
                    {"person": "P66", "evidence": ["E2"]},
                ],
            }
        ),
        EVIDENCE,
        PERSONS,
    )
    assert listed.kind is AnswerKind.LIST
    assert [(i.name, i.subtitle, i.citations) for i in listed.items or []] == [
        ("王浩", "喜欢露营", [1])
    ]

    stat = build_answer(
        FinalAnswer.model_validate(
            {
                "kind": "stat",
                "segments": [{"text": "有 2 个。", "evidence": ["E2"]}],
                "stat_persons": ["P2", "P3", "P99"],
            }
        ),
        EVIDENCE,
        PERSONS,
    )
    assert stat.stat is not None
    assert (stat.stat.count, stat.stat.persons) == (2, [ZHANG, LI])


# --- the question's subject must be the one answered about (AC-38) -------------------------

ABOUT_ZHANG = Evidence("E4", Confidence.WITNESSED, (HIRED,), about=frozenset({ZHANG.person_id}))
ABOUT_WANG = Evidence("E5", Confidence.SELF_TOLD, (HIRED,), about=frozenset({WANG.person_id}))
NEAR_NAMES = {**EVIDENCE, "E4": ABOUT_ZHANG, "E5": ABOUT_WANG}
NEAR_NAME_ANSWER = final(
    segments=[
        {"text": "图谱里没有老王。老张性格急性子。", "evidence": ["E4"]},
        {"text": "小王喜欢露营。", "evidence": ["E5"]},
    ],
    persons=["P2", "P4"],
)


def test_a_subject_nobody_in_the_graph_answers_to_means_no_answer() -> None:
    answer = build_answer(NEAR_NAME_ANSWER, NEAR_NAMES, PERSONS, subjects={"老王": ()})
    assert answer.kind is AnswerKind.NO_ANSWER
    assert [s.text for s in answer.segments] == [NO_ANSWER_TEXT] and answer.persons == []


def test_an_answer_about_someone_other_than_the_subject_becomes_no_answer() -> None:
    answer = build_answer(
        final(segments=[{"text": "小王喜欢露营。", "evidence": ["E5"]}], persons=["P4"]),
        NEAR_NAMES,
        PERSONS,
        subjects={"老张": (ZHANG,)},
    )
    assert answer.kind is AnswerKind.NO_ANSWER


def test_an_answer_citing_the_resolved_subject_is_kept() -> None:
    answer = build_answer(NEAR_NAME_ANSWER, NEAR_NAMES, PERSONS, subjects={"老张": (ZHANG,)})
    assert answer.kind is AnswerKind.TEXT and len(answer.citations) == 2


def test_self_as_the_subject_does_not_require_evidence_about_me() -> None:
    answer = build_answer(
        final(segments=[{"text": "老张在字节跳动工作。", "evidence": ["E4"]}]),
        NEAR_NAMES,
        PERSONS,
        subjects={"我": (ME,)},
    )
    assert answer.kind is AnswerKind.TEXT
