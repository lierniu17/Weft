"""补充追问 (Draft questions, conversation-context AC-4, AC-6, AC-7): pure rules.

* ``parse_questions`` checks what the enrichment model proposed: only the whitelisted
  fields (relationship type, how / when two people met, a too vague occurred date), about
  persons the Draft knows, with 2–4 options whose ``patch`` is a legal change of that field
  only. Invalid options are dropped, a question left with fewer than 2 is dropped, and so
  is one about something the Draft already has (a relationship type, a met date / way).
  At most ``MAX_QUESTIONS`` remain, numbered ``q1``, ``q2``.
* ``parse_patch`` is the check for one patch: an option's, or the one the model made of a
  typed answer.
* ``answer`` applies a patch to the Draft as it is now (with the user's edits): it touches
  only the asked relationship's types or met fields, or moves the occurred date (re-timing
  the dates anchored on it, as a manual edit of 发生日期 does), and marks the question
  answered.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date
from typing import Any

from weft.domain.confidence import Confidence
from weft.domain.dates import PartialDate, clamp_to_entry_precision
from weft.domain.draft import (
    PATCH_KEYS,
    Draft,
    DraftPerson,
    DraftQuestion,
    DraftQuestionOption,
    DraftRelationship,
    DraftRelationshipType,
    QuestionField,
    QuestionPatch,
    retime,
)
from weft.domain.taxonomy import OTHER, Category, Taxonomy

MAX_QUESTIONS = 2
MAX_OPTIONS = 4
MIN_OPTIONS = 2
MAX_PROMPT = 80
MAX_LABEL = 30
MAX_ORIGIN = 200
SELF_MENTION = "我"


class QuestionOutdatedError(ValueError):
    """The question no longer fits the Draft (e.g. a person it asks about was removed)."""


# --- one patch ---------------------------------------------------------------------


def _types(raw: Any, taxonomy: Taxonomy) -> list[DraftRelationshipType] | None:
    if not isinstance(raw, list) or not raw:
        return None
    out: list[DraftRelationshipType] = []
    for item in raw:
        if not isinstance(item, dict):
            return None
        try:
            category = Category(str(item.get("category")))
        except ValueError:
            return None
        subtype = item.get("subtype")
        original = item.get("original")
        if not isinstance(subtype, str) or not subtype.strip():
            return None
        if original is not None and not isinstance(original, str):
            return None
        t = taxonomy.normalize(category, subtype, original=original or subtype)
        if t.subtype == OTHER and t.original.strip() in ("", OTHER):
            return None
        typed = DraftRelationshipType(category=t.category, subtype=t.subtype, original=t.original)
        if typed not in out:
            out.append(typed)
    return out


def _date(raw: Any) -> PartialDate | None:
    if not isinstance(raw, str):
        return None
    try:
        return PartialDate.parse(raw.strip())
    except ValueError:
        return None


def parse_patch(
    field: QuestionField, raw: Any, *, taxonomy: Taxonomy, entry: PartialDate, today: date
) -> QuestionPatch | None:
    """``raw`` as a legal change of ``field`` only, or ``None``.

    Keys of other fields make the patch illegal (keys set to null are ignored). Types must
    fit the user's vocabulary (a synonym is normalized; 「其他」 needs its own wording);
    dates must parse and not lie in the future; a met date is cut to the Entry's precision.
    """
    if not isinstance(raw, dict):
        return None
    given = {k: v for k, v in raw.items() if v is not None}
    if not given or not set(given) <= PATCH_KEYS[field]:
        return None
    values: dict[str, Any] = {}
    if "types" in given:
        types = _types(given["types"], taxonomy)
        if types is None:
            return None
        values["types"] = types
    for key in ("met_at", "occurred"):
        if key in given:
            day = _date(given[key])
            if day is None or day.first_day() > today:
                return None
            values[key] = clamp_to_entry_precision(day, entry=entry) if key == "met_at" else day
    if "origin" in given:
        origin = given["origin"]
        if not isinstance(origin, str) or not origin.strip() or len(origin) > MAX_ORIGIN:
            return None
        values["origin"] = origin.strip()
    return QuestionPatch(**values)


# --- the model's questions -----------------------------------------------------------


def _relationship(draft: Draft, pair: tuple[str, str]) -> DraftRelationship | None:
    wanted = frozenset(pair)
    return next((r for r in draft.relationships if frozenset(r.pair) == wanted), None)


def _already_known(draft: Draft, field: QuestionField, pair: tuple[str, str] | None) -> bool:
    if pair is None:
        return False
    rel = _relationship(draft, pair)
    if rel is None:
        return False
    if field is QuestionField.RELATIONSHIP_TYPE:
        return any(t.subtype != OTHER for t in rel.types)
    return rel.met_at is not None or rel.origin is not None


def _pair(raw: Any, draft: Draft) -> tuple[str, str] | None:
    if not isinstance(raw, list) or len(raw) != 2 or not all(isinstance(m, str) for m in raw):
        return None
    a, b = raw[0].strip(), raw[1].strip()
    known = {p.mention for p in draft.persons} | {SELF_MENTION}
    if a == b or a not in known or b not in known:
        return None
    return (a, b)


def _question(
    raw: Any, *, draft: Draft, taxonomy: Taxonomy, entry: PartialDate, today: date, qid: str
) -> DraftQuestion | None:
    if not isinstance(raw, dict):
        return None
    try:
        field = QuestionField(str(raw.get("field")))
    except ValueError:
        return None
    prompt = raw.get("prompt")
    if not isinstance(prompt, str) or not prompt.strip() or len(prompt.strip()) > MAX_PROMPT:
        return None
    pair = None
    if field is not QuestionField.OCCURRED:
        pair = _pair(raw.get("pair"), draft)
        if pair is None or _already_known(draft, field, pair):
            return None
    options: list[DraftQuestionOption] = []
    raw_options = raw.get("options")
    for item in raw_options if isinstance(raw_options, list) else []:
        if not isinstance(item, dict):
            continue
        label = item.get("label")
        if not isinstance(label, str) or not label.strip() or len(label.strip()) > MAX_LABEL:
            continue
        patch = parse_patch(field, item.get("patch"), taxonomy=taxonomy, entry=entry, today=today)
        if patch is None or any(o.label == label.strip() for o in options):
            continue
        options.append(DraftQuestionOption(label=label.strip(), patch=patch))
    if len(options) < MIN_OPTIONS:
        return None
    return DraftQuestion(
        id=qid, field=field, pair=pair, prompt=prompt.strip(), options=options[:MAX_OPTIONS]
    )


def parse_questions(
    raw: Any, *, draft: Draft, taxonomy: Taxonomy, entry: PartialDate, today: date
) -> list[DraftQuestion]:
    """The valid questions among the model's ``raw`` ones (see the module doc)."""
    out: list[DraftQuestion] = []
    seen: set[tuple[QuestionField, frozenset[str]]] = set()
    for item in raw if isinstance(raw, list) else []:
        if len(out) == MAX_QUESTIONS:
            break
        q = _question(
            item, draft=draft, taxonomy=taxonomy, entry=entry, today=today, qid=f"q{len(out) + 1}"
        )
        if q is None:
            continue
        key = (q.field, frozenset(q.pair or ()))
        if key in seen:
            continue
        seen.add(key)
        out.append(q)
    return out


# --- answering -------------------------------------------------------------------------


@dataclass(frozen=True)
class Answered:
    draft: Draft
    occurred: PartialDate | None = None  # the Entry's new 发生日期, for an occurred answer


def _new_relationship_id(draft: Draft) -> str:
    taken = set(draft.item_ids())
    n = len(draft.relationships) + 1
    while f"r{n}" in taken:
        n += 1
    return f"r{n}"


def answer(
    draft: Draft,
    question_id: str,
    patch: QuestionPatch,
    *,
    answer_text: str,
    entry: PartialDate,
    self_person: DraftPerson | None = None,
) -> Answered:
    """``draft`` with ``patch`` applied for the question ``question_id``, marked answered.

    Raises ``KeyError`` for an unknown question and ``QuestionOutdatedError`` when the
    patch does not fit the question or the Draft any more. ``self_person`` is added to the
    Draft's persons when the answer creates a relationship with 我 and 我 is not listed.
    """
    question = next((q for q in draft.questions if q.id == question_id), None)
    if question is None:
        raise KeyError(question_id)
    if not patch.set_keys() or not patch.set_keys() <= PATCH_KEYS[question.field]:
        raise QuestionOutdatedError("the answer changes another field than the question's")

    data = draft.model_dump(mode="python", by_alias=True)
    occurred: PartialDate | None = None
    if question.field is QuestionField.OCCURRED:
        assert patch.occurred is not None
        occurred = patch.occurred
        if occurred != entry:
            data = retime(draft, old=entry, new=occurred).model_dump(mode="python", by_alias=True)
    else:
        assert question.pair is not None
        mentions = {p.mention for p in draft.persons}
        for mention in question.pair:
            if mention in mentions:
                continue
            if mention == SELF_MENTION and self_person is not None:
                data["persons"].append(self_person.model_dump(mode="python", by_alias=True))
                mentions.add(mention)
                continue
            raise QuestionOutdatedError(f"{mention} is no longer in the draft")
        rel = _relationship(draft, question.pair)
        if question.field is QuestionField.RELATIONSHIP_TYPE:
            change: dict[str, Any] = {"pair": question.pair, "types": patch.types}
        else:
            change = {k: getattr(patch, k) for k in ("met_at", "origin") if k in patch.set_keys()}
        if rel is None:
            new = DraftRelationship(
                **{"pair": question.pair, **change},
                id=_new_relationship_id(draft),
                confidence=Confidence.WITNESSED,  # the user said it themselves
            )
            data["relationships"].append(new.model_dump(mode="python", by_alias=True))
        else:
            data["relationships"] = [
                r.model_copy(update=change).model_dump(mode="python", by_alias=True)
                if r.id == rel.id
                else r.model_dump(mode="python", by_alias=True)
                for r in draft.relationships
            ]
    data["questions"] = [
        q.model_copy(update={"answered": True, "answer": answer_text}).model_dump(
            mode="python", by_alias=True
        )
        if q.id == question_id
        else q.model_dump(mode="python", by_alias=True)
        for q in draft.questions
    ]
    try:
        return Answered(Draft.model_validate(data), occurred)
    except ValueError as exc:
        raise QuestionOutdatedError(str(exc)) from exc


__all__ = [
    "MAX_QUESTIONS",
    "Answered",
    "QuestionOutdatedError",
    "answer",
    "parse_patch",
    "parse_questions",
]
