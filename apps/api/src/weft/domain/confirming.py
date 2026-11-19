"""指代确认 decided in code (conversation-context AC-1): when a confirmation is not needed,
and when one is.

* ``identified_option`` — the question already says which candidate it means: it contains
  an identity word (「大学同学」「老家」「邻居」, a full name, an alias) that exactly one
  candidate has and the others do not. Then there is nothing to confirm: that candidate's
  question is answered (「我的大学同学老周」 is 周涛, not a choice between two 老周).
* ``identified_person`` — the same, for a name several persons answer to before anything
  is asked (「老家邻居老周那件事」: 周建国, whose events are then counted).
* ``matter_of`` / ``matter_events`` — a question about 「X 那(件)事」 names no event; when
  what the tools returned holds two or more events about X, the answer must be a
  confirmation listing them, not a guess at one.
"""

from __future__ import annotations

import re
from collections.abc import Collection, Iterable, Mapping
from dataclasses import dataclass

from weft.domain.answer import AnswerClarify, AnswerClarifyOption

MIN_WORD = 2  # a one-character word (「周」「老」) identifies nobody
_SPLIT = re.compile(r"[\s（）()【】\[\]，,、;；:：/·。.!?！？\"“”'‘’]+")
_MATTER = re.compile(r"^(?P<who>.+?)(?:那|这)(?:件|个|档子|档)?事(?:儿|情)?")

EVENT_PREDICATES = frozenset({"EXPERIENCED", "RELATED_EVENT"})
CHANGE_PREDICATES = frozenset({"WORKS_AT", "LIVES_IN"})  # an ended one is a change (跳槽, 搬家)


def words(text: str) -> set[str]:
    """The identity words in a label or graph text: split at punctuation and spaces, without
    numbers (dates) or single characters."""
    return {w for w in _SPLIT.split(text) if len(w) >= MIN_WORD and not w.isdigit() and w != "年"}


def _picked(question: str, own: list[set[str]]) -> int | None:
    """The index of the one word set the question tells apart from the others: words
    several sets share are dropped, and the question must contain one of the remaining
    words of exactly one set."""
    picked = []
    for i, found in enumerate(own):
        others = set().union(*(w for j, w in enumerate(own) if j != i))
        if any(w in question for w in found - others):
            picked.append(i)
    return picked[0] if len(picked) == 1 else None


def identified_option(
    question: str,
    asked: AnswerClarify,
    descriptors: Mapping[str, Iterable[str]] | None = None,
) -> AnswerClarifyOption | None:
    """The one candidate of ``asked`` the question itself identifies, if exactly one.

    A candidate's identity words are those of its label (「老周（周涛，大学同学）」:
    老周, 周涛, 大学同学) plus ``descriptors[person_id]`` (from the graph: name, aliases,
    the relationship with me and where we met). Words several candidates share (老周, or
    邻居 when both are neighbours) tell nobody apart and are dropped. The question picks a
    candidate when it contains one of its remaining words; exactly one must be picked."""
    descriptors = descriptors or {}
    own: list[set[str]] = []
    for option in asked.options:
        found = words(option.label)
        if option.person_id is not None:
            for text in descriptors.get(option.person_id, ()):
                found |= words(text)
        own.append(found)
    i = _picked(question, own)
    return None if i is None else asked.options[i]


def identified_person(question: str, descriptors: Mapping[str, Iterable[str]]) -> str | None:
    """Which of several persons a name stands for (``descriptors``: person id -> what the
    graph says about them, as for ``identified_option``) the question itself says, if it
    says exactly one: 「老家邻居老周」 is 周建国, not 周涛. ``None`` if it fits several or none."""
    ids = list(descriptors)
    if len(ids) < 2:
        return ids[0] if ids else None
    own = [set().union(*(words(t) for t in descriptors[pid])) for pid in ids]
    i = _picked(question, own)
    return None if i is None else ids[i]


def matter_of(question: str) -> str | None:
    """The words before 「那事」 when the question asks about 「X 那(件 / 个)事」 without
    saying which event (「小李那件事后来怎么样了？」 -> 「小李」); ``None`` otherwise."""
    m = _MATTER.search(question.strip())
    if m is None:
        return None
    who = m.group("who").strip()
    return who or None


@dataclass(frozen=True)
class EventFact:
    """A fact the tools returned, as far as 「那事」 cares."""

    id: str
    predicate: str
    subject_id: str
    object_id: str | None
    text: str
    ended: bool = False


def matter_events(facts: Iterable[EventFact], about: Collection[str]) -> list[EventFact]:
    """The events among ``facts`` that involve every person in ``about`` (ids): life
    events (EXPERIENCED), events between persons (RELATED_EVENT), and a job or home that
    ended (a change: 跳槽, 搬家 — one per person and kind). Empty if ``about`` is."""
    if not about:
        return []
    out: list[EventFact] = []
    changes: set[tuple[str, str]] = set()
    seen: set[str] = set()
    for f in facts:
        if f.id in seen:
            continue
        seen.add(f.id)
        involved = {f.subject_id, *([f.object_id] if f.object_id else [])}
        if not set(about) <= involved:
            continue
        if f.predicate in EVENT_PREDICATES:
            out.append(f)
        elif f.predicate in CHANGE_PREDICATES and f.ended:
            key = (f.subject_id, f.predicate)
            if key not in changes:
                changes.add(key)
                out.append(f)
    return out


__all__ = [
    "EventFact",
    "identified_option",
    "identified_person",
    "matter_events",
    "matter_of",
    "words",
]
