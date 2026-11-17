"""Grading Q&A answers against the gold set in ``eval/qa/questions.jsonl`` (AC-36, AC-38).

A question's gold says what a right answer must contain:

* ``no_answer`` — the answer must be 「图谱里没有相关信息」; any other answer is a
  fabrication (编造, must be 0 over the set);
* ``persons`` — canonical names that must appear (structured persons, list items, path,
  stat, or by name / alias in the text); with ``persons_exact`` the structured persons
  (list items, else stat, else chips) must be exactly these;
* ``text`` — keywords that must all appear in the text; ``"A|B"`` accepts either;
* ``path`` — the chain of persons in order (``"我"`` is Self), as the path or in the text;
* ``count`` — the number, as the stat or in the text.
"""

from __future__ import annotations

import json
from collections.abc import Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

from weft.domain.answer import Answer, AnswerKind, PersonRef
from weft.settings import API_DIR

QUESTIONS_PATH = API_DIR / "eval" / "qa" / "questions.jsonl"
KINDS = ("profile", "relationship", "path", "filter", "time", "count", "no_answer")
Kind = Literal["profile", "relationship", "path", "filter", "time", "count", "no_answer"]
SELF_NAME = "我"
ACCURACY_THRESHOLD = 0.8  # per kind; reported, the hard gate is fabrication = 0


class Gold(BaseModel):
    model_config = ConfigDict(extra="forbid")
    no_answer: bool = False
    persons: list[str] = Field(default_factory=list)
    persons_exact: bool = False
    text: list[str] = Field(default_factory=list)
    path: list[str] = Field(default_factory=list)
    count: int | None = None


class Question(BaseModel):
    model_config = ConfigDict(extra="forbid")
    id: str
    kind: Kind = "profile"
    question: str
    gold: Gold = Field(default_factory=Gold)


@dataclass(frozen=True)
class Graded:
    correct: bool
    fabricated: bool = False
    reason: str = ""


def load_questions(path: Path = QUESTIONS_PATH) -> list[Question]:
    lines = path.read_text(encoding="utf-8").splitlines()
    return [Question.model_validate_json(line) for line in lines if line.strip()]


def _text(answer: Answer) -> str:
    parts = [s.text for s in answer.segments]
    parts += [f"{i.name} {i.subtitle or ''}" for i in answer.items or []]
    return " ".join(parts)


def _structured(answer: Answer) -> list[PersonRef]:
    if answer.items is not None:
        return [
            PersonRef(person_id=i.person_id, name=i.name, is_self=i.is_self) for i in answer.items
        ]
    if answer.stat is not None:
        return list(answer.stat.persons)
    return list(answer.persons)


def _names(refs: list[PersonRef]) -> set[str]:
    return {SELF_NAME if r.is_self else r.name for r in refs}


def _mentioned(name: str, text: str, aliases: Mapping[str, tuple[str, ...]]) -> bool:
    return any(n in text for n in (name, *aliases.get(name, ())))


def _first_position(name: str, text: str, aliases: Mapping[str, tuple[str, ...]]) -> int:
    hits = [text.find(n) for n in (name, *aliases.get(name, ())) if n in text]
    return min(hits) if hits else -1


def grade(q: Question, answer: Answer, aliases: Mapping[str, tuple[str, ...]]) -> Graded:
    gold = q.gold
    answered = answer.kind is not AnswerKind.NO_ANSWER
    if gold.no_answer:
        if answered:
            return Graded(False, fabricated=True, reason="answered a question the graph cannot")
        return Graded(True)
    if not answered:
        return Graded(False, reason="said 图谱里没有相关信息")

    text = _text(answer)
    for keyword in gold.text:
        if not any(k in text for k in keyword.split("|")):
            return Graded(False, reason=f"missing {keyword}")

    every_ref = [*answer.persons, *(answer.path or []), *_structured(answer)]
    if answer.stat is not None:
        every_ref += answer.stat.persons
    found = _names(every_ref)
    for name in gold.persons:
        if name not in found and not _mentioned(name, text, aliases):
            return Graded(False, reason=f"missing person {name}")
    if gold.persons_exact:
        listed = _names(_structured(answer)) - {SELF_NAME}
        if listed != set(gold.persons):
            extra, missing = sorted(listed - set(gold.persons)), sorted(set(gold.persons) - listed)
            return Graded(False, reason=f"persons differ: extra {extra}, missing {missing}")

    if gold.path:
        if answer.path:
            chain = [SELF_NAME if p.is_self else p.name for p in answer.path]
            if chain != gold.path:
                return Graded(False, reason=f"path {chain} != {gold.path}")
        else:
            inner = gold.path[1:-1] if len(gold.path) > 2 else gold.path
            positions = [_first_position(n, text, aliases) for n in inner]
            if any(p < 0 for p in positions) or positions != sorted(positions):
                return Graded(False, reason=f"path {gold.path} not in the text")

    if gold.count is not None:
        counted = answer.stat.count if answer.stat is not None else None
        if counted != gold.count and str(gold.count) not in text:
            return Graded(False, reason=f"count {counted} != {gold.count}")
    return Graded(True)


def score(
    questions: list[Question],
    answers: Mapping[str, Answer],
    aliases: Mapping[str, tuple[str, ...]],
    *,
    errors: Mapping[str, str],
) -> dict[str, Any]:
    per_kind: dict[str, dict[str, Any]] = {}
    details: list[dict[str, Any]] = []
    fabricated: list[str] = []
    for q in questions:
        a = answers.get(q.id)
        result = (
            grade(q, a, aliases)
            if a is not None
            else Graded(False, reason=f"error: {errors.get(q.id, 'no answer')}")
        )
        bucket = per_kind.setdefault(q.kind, {"total": 0, "correct": 0})
        bucket["total"] += 1
        bucket["correct"] += int(result.correct)
        if result.fabricated:
            fabricated.append(q.id)
        details.append(
            {
                "id": q.id,
                "kind": q.kind,
                "question": q.question,
                "correct": result.correct,
                "reason": result.reason,
                "answer": None if a is None else "".join(s.text for s in a.segments),
            }
        )
    for bucket in per_kind.values():
        bucket["accuracy"] = bucket["correct"] / bucket["total"]
    no_answer_total = per_kind.get("no_answer", {}).get("total", 0)
    answerable = [q for q in questions if q.kind != "no_answer"]
    correct = sum(1 for d in details if d["correct"] and d["kind"] != "no_answer")
    report: dict[str, Any] = {
        "questions": len(questions),
        "accuracy": correct / len(answerable) if answerable else 0.0,
        "per_kind": {k: per_kind[k] for k in KINDS if k in per_kind},
        "fabrication_rate": len(fabricated) / no_answer_total if no_answer_total else 0.0,
        "fabricated": fabricated,
        "errors": dict(errors),
        "accuracy_threshold_per_kind": ACCURACY_THRESHOLD,
        "details": details,
    }
    report["passed"] = report["fabrication_rate"] == 0 and all(
        b["accuracy"] >= ACCURACY_THRESHOLD for b in per_kind.values()
    )
    return report


def to_json(report: dict[str, Any]) -> str:
    return json.dumps(report, ensure_ascii=False, indent=2)


__all__ = [
    "KINDS",
    "QUESTIONS_PATH",
    "Gold",
    "Graded",
    "Question",
    "grade",
    "load_questions",
    "score",
    "to_json",
]
