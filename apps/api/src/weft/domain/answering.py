"""From tool evidence and the model's final answer to the ``Answer`` contract (AC-37, AC-38).

During 问答 the model never sees ids: persons are ``P1`` …, pieces of evidence (a fact, a
relationship, a feeling, …) are ``E1`` … . Its final answer cites those handles; here
they are resolved against what the tools really returned:

* every cited evidence becomes one Citation per source Entry (原文, 发生日期, 可信度);
  unknown handles are dropped, so the model cannot invent a source or a person;
* 转述 / 推测 / 我的评价 claims say so in their text (「据转述」「推测」「你的评价」) if the
  model did not already;
* no evidence from any tool, or no claim citing any — 「图谱里没有相关信息」(AC-38);
* the persons the question asks about (its *subjects*) must exist and be what the answer
  is about: a subject nobody in the graph answers to, or an answer none of whose evidence
  concerns a (non-self) subject, is 「图谱里没有相关信息」— never 「没有老王，但老张……」.
"""

from __future__ import annotations

from collections.abc import Mapping, Sequence
from dataclasses import dataclass

from pydantic import BaseModel, ConfigDict, Field

from weft.domain.answer import (
    MAX_CLARIFY_OPTIONS,
    MIN_CLARIFY_OPTIONS,
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
from weft.domain.graph_write import humanize

NO_ANSWER_TEXT = "图谱里没有相关信息。"
MAX_FOLLOW_UPS = 3
MAX_EXCERPT = 300

HEARSAY_MARKERS = ("据", "听说", "听", "转述", "传言")
INFERRED_MARKERS = ("推测", "猜", "可能", "也许", "大概", "似乎")
OPINION_MARKERS = ("你的评价", "你评价", "你觉得", "你认为", "评价")


@dataclass(frozen=True)
class Source:
    entry_id: str
    excerpt: str
    occurred: PartialDate


@dataclass(frozen=True)
class Evidence:
    """One thing a tool returned that a claim can rest on, with the Entries behind it."""

    key: str
    confidence: Confidence
    sources: tuple[Source, ...]
    is_opinion: bool = False
    pair: tuple[PersonRef, PersonRef] | None = None
    about: frozenset[str] = frozenset()  # ids of the persons this evidence concerns


class _Final(BaseModel):
    model_config = ConfigDict(extra="ignore")


class FinalSegment(_Final):
    text: str
    evidence: list[str] = Field(default_factory=list, description="E… handles backing this text")


class FinalItem(_Final):
    person: str = Field(description="P… handle")
    subtitle: str | None = None
    evidence: list[str] = Field(default_factory=list)


class FinalOption(_Final):
    label: str = Field(description="候选：是谁（姓名和一句关系描述）或哪件事（一句话和时间）")
    question: str = Field(description="选了这个候选时要回答的完整问题（人名写全，不用代词）")
    person: str | None = Field(default=None, description="候选是某个人物时填他的 P 句柄")


class FinalAnswer(_Final):
    """What the model submits through the ``final_answer`` tool."""

    kind: AnswerKind
    subjects: list[str] = Field(
        default_factory=list,
        description="问题点名问到的人物，照问题原话写（如“老张”“我”）；没点名具体人物就留空",
    )
    segments: list[FinalSegment] = Field(default_factory=list)
    persons: list[str] = Field(default_factory=list, description="P… handles shown as chips")
    path: list[str] = Field(default_factory=list, description="kind=path: P… from first to last")
    items: list[FinalItem] = Field(default_factory=list, description="kind=list")
    stat_persons: list[str] = Field(default_factory=list, description="kind=stat: who is counted")
    follow_ups: list[str] = Field(default_factory=list)
    clarify_question: str | None = Field(
        default=None, description="kind=clarify：确认问题，如“你问的是哪位老周？”"
    )
    options: list[FinalOption] = Field(
        default_factory=list, description="kind=clarify：2 到 4 个候选"
    )
    used_history: bool = Field(
        default=False, description="理解这个问题时用到了上文（history）就填 true"
    )


MAX_CLARIFY_LABEL = 40
MAX_CLARIFY_QUESTION = 80
MAX_OPTION_QUESTION = 200


def clarification(final: FinalAnswer, persons: Mapping[str, PersonRef]) -> AnswerClarify | str:
    """The 指代确认 a ``clarify`` final answer asks (conversation-context AC-1), or why it
    cannot be used: a question and 2–4 distinct options, each with a label and a full
    question; an option about a person must name one the tools returned from this user's
    graph (``persons``: handle -> person), never 我."""
    question = (final.clarify_question or "").strip()
    if not question:
        return "clarify_question 不能为空"
    options: list[AnswerClarifyOption] = []
    for i, raw in enumerate(final.options, start=1):
        label, asked = raw.label.strip(), raw.question.strip()
        if not label or not asked:
            return f"第 {i} 个候选缺少 label 或 question"
        person_id: str | None = None
        if raw.person is not None and raw.person.strip():
            ref = persons.get(raw.person.strip())
            if ref is None or ref.is_self:
                return f"第 {i} 个候选的 person 不是工具结果里的 P 句柄：{raw.person}"
            person_id = ref.person_id
        if any(o.label == label[:MAX_CLARIFY_LABEL] or o.question == asked for o in options):
            return f"第 {i} 个候选和前面的重复了"
        options.append(
            AnswerClarifyOption(
                label=label[:MAX_CLARIFY_LABEL],
                question=asked[:MAX_OPTION_QUESTION],
                person_id=person_id,
            )
        )
    if not MIN_CLARIFY_OPTIONS <= len(options) <= MAX_CLARIFY_OPTIONS:
        return (
            f"候选要有 {MIN_CLARIFY_OPTIONS} 到 {MAX_CLARIFY_OPTIONS} 个，现在是 {len(options)} 个"
        )
    return AnswerClarify(question=question[:MAX_CLARIFY_QUESTION], options=options)


def clarify_answer(asked: AnswerClarify) -> Answer:
    """The ``Answer`` for a 指代确认: the question as text, the candidates, nothing cited."""
    return Answer(
        kind=AnswerKind.CLARIFY,
        segments=[AnswerSegment(text=asked.question)],
        citations=[],
        persons=[],
        follow_ups=[],
        clarify=asked,
    )


def _has(text: str, markers: tuple[str, ...]) -> bool:
    return any(m in text for m in markers)


def hedge(text: str, cited: list[Evidence]) -> str:
    """Say 转述 / 推测 / 你的评价 in the text when a cited evidence is one (AC-23, AC-37)."""
    if any(e.is_opinion for e in cited) and not _has(text, OPINION_MARKERS):
        return f"你的评价：{text}"
    confidences = {e.confidence for e in cited if not e.is_opinion}
    if Confidence.HEARSAY in confidences and not _has(text, HEARSAY_MARKERS):
        return f"据转述，{text}"
    if Confidence.INFERRED in confidences and not _has(text, INFERRED_MARKERS):
        return f"推测：{text}"
    return text


def no_answer(follow_ups: list[str] | None = None) -> Answer:
    return Answer(
        kind=AnswerKind.NO_ANSWER,
        segments=[AnswerSegment(text=NO_ANSWER_TEXT)],
        citations=[],
        persons=[],
        follow_ups=_follow_ups(follow_ups or []),
    )


def _follow_ups(values: list[str]) -> list[str]:
    return [v.strip() for v in values if v.strip()][:MAX_FOLLOW_UPS]


class _Citations:
    def __init__(self, evidence: Mapping[str, Evidence]) -> None:
        self._evidence = evidence
        self.items: list[Citation] = []
        self.cited: list[Evidence] = []
        self._index: dict[tuple[object, ...], int] = {}

    def cite(self, keys: list[str]) -> tuple[list[int], list[Evidence]]:
        indices: list[int] = []
        cited: list[Evidence] = []
        for key in dict.fromkeys(keys):
            ev = self._evidence.get(key)
            if ev is None:
                continue
            cited.append(ev)
            self.cited.append(ev)
            for src in ev.sources:
                ident = (src.entry_id, ev.confidence, ev.is_opinion, ev.pair)
                if ident not in self._index:
                    self._index[ident] = len(self.items) + 1
                    self.items.append(
                        Citation(
                            index=self._index[ident],
                            entry_id=src.entry_id,
                            entry_excerpt=(src.excerpt or "（空）")[:MAX_EXCERPT],
                            occurred_on=src.occurred,
                            confidence=ev.confidence,
                            pair=ev.pair,
                            is_opinion=ev.is_opinion,
                        )
                    )
                if self._index[ident] not in indices:
                    indices.append(self._index[ident])
        return indices, cited


Subjects = Mapping[str, Sequence[PersonRef]]


def unknown_subject(subjects: Subjects) -> bool:
    """A person the question names that nobody in the graph answers to."""
    return any(not refs for refs in subjects.values())


def answers_about_subjects(subjects: Subjects, cited: Sequence[Evidence]) -> bool:
    """Some cited evidence concerns one of the question's (non-self) subjects.

    「老张的女儿在哪上大学」 names 老张: an answer resting only on 小王's facts answers a
    different question. 「我」 as the subject constrains nothing (filters, counts, paths).
    """
    wanted = {r.person_id for refs in subjects.values() for r in refs if not r.is_self}
    return not wanted or any(wanted & ev.about for ev in cited)


def build_answer(
    final: FinalAnswer | None,
    evidence: Mapping[str, Evidence],
    persons: Mapping[str, PersonRef],
    subjects: Subjects | None = None,
) -> Answer:
    """``subjects``: each name the question asks about -> the persons it resolves to."""
    subjects = subjects or {}
    if (
        final is None
        or final.kind in (AnswerKind.NO_ANSWER, AnswerKind.CLARIFY)  # a 确认 is not built here
        or not evidence
        or unknown_subject(subjects)
    ):
        return no_answer(final.follow_ups if final else None)

    citations = _Citations(evidence)
    segments: list[AnswerSegment] = []
    for seg in final.segments:
        text = seg.text.strip()
        if not text:
            continue
        indices, cited = citations.cite(seg.evidence)
        # the model reads predicates like RELATED_EVENT; the user never does (style AC-9)
        text = humanize(text)
        segments.append(AnswerSegment(text=hedge(text, cited), citations=tuple(indices)))

    def refs(handles: list[str]) -> list[PersonRef]:
        return list({persons[h].person_id: persons[h] for h in handles if h in persons}.values())

    items: list[AnswerListItem] = []
    for item in final.items:
        ref = persons.get(item.person)
        if ref is None:
            continue
        indices, _ = citations.cite(item.evidence)
        items.append(
            AnswerListItem(
                person_id=ref.person_id,
                name=ref.name,
                is_self=ref.is_self,
                subtitle=humanize((item.subtitle or "").strip()) or None,
                citations=indices,
            )
        )
    if not citations.items or not answers_about_subjects(subjects, citations.cited):
        return no_answer(final.follow_ups)

    kind = final.kind
    path = refs(final.path) if kind is AnswerKind.PATH else []
    if kind is AnswerKind.PATH and len(path) < 2:
        kind = AnswerKind.TEXT
    stat_persons = refs(final.stat_persons or [i.person for i in final.items])
    # 我 may be in the path chain, never a related-person chip
    chips = [
        r
        for r in refs(
            final.persons + final.path + [i.person for i in final.items] + final.stat_persons
        )
        if not r.is_self
    ]
    return Answer(
        kind=kind,
        segments=segments or [AnswerSegment(text="见下方出处。")],
        citations=citations.items,
        persons=chips,
        path=path if kind is AnswerKind.PATH else None,
        items=items if kind is AnswerKind.LIST else None,
        stat=AnswerStat(count=len(stat_persons), persons=stat_persons)
        if kind is AnswerKind.STAT
        else None,
        follow_ups=_follow_ups(final.follow_ups),
    )


__all__ = [
    "NO_ANSWER_TEXT",
    "Evidence",
    "FinalAnswer",
    "FinalItem",
    "FinalOption",
    "FinalSegment",
    "Source",
    "Subjects",
    "answers_about_subjects",
    "build_answer",
    "clarification",
    "clarify_answer",
    "hedge",
    "no_answer",
    "unknown_subject",
]
