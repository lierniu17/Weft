"""按描述找人 (context-gaps AC-3): a person named by a description instead of a name.

「在市一院上班的那个邻居」「住在杭州的那个同学」「老张介绍的那个朋友」「在中信银行上班的那位」
name nobody, but say what the graph knows about them. ``description`` splits such a phrase
into what it says (a *trait*: where they work, live or studied, or who introduced them to
me), the trait's value, and the relation word after it (「邻居」; none for 「那个人」「那位」).
``matching`` then keeps the persons the graph's facts and relationships fit.

A description must end with a relation word, or with 「那个 / 那位 …」 followed by 「人」 or
by what is asked (「那位是谁」). 「在华为上班的那个老周」 names 老周 and is no description;
neither is 「我认识的人里……」.
"""

from __future__ import annotations

import re
from collections.abc import Collection, Iterable, Mapping
from dataclasses import dataclass, replace
from enum import StrEnum

MIN_CANDIDATES = 2
MAX_CANDIDATES = 4  # several matches are confirmed (指代确认) up to this many


class Trait(StrEnum):
    WORKS_AT = "WORKS_AT"
    LIVES_IN = "LIVES_IN"
    STUDIED_AT = "STUDIED_AT"
    INTRODUCED_BY = "INTRODUCED_BY"  # 「X 介绍的」「X 认识的」: X introduced me to them


_VALUE = r"[^，,。？?！!、；;：:\s的在]{1,20}?"
_PATTERNS: tuple[tuple[Trait, re.Pattern[str]], ...] = (
    (
        Trait.WORKS_AT,
        re.compile(
            rf"在(?P<value>{_VALUE})(?P<verb>上过班|工作过|干过|上班|工作|任职|做事|干活|当[^\s的，,。？?]{{1,6}})的"
        ),
    ),
    (
        Trait.STUDIED_AT,
        re.compile(
            rf"在(?P<value>{_VALUE})(?P<verb>上过学|读过书|念过书|上学|读书|念书|读大学|上大学|读研究生|读研)的"
        ),
    ),
    (Trait.STUDIED_AT, re.compile(rf"(?P<value>{_VALUE})(?P<verb>毕业)的")),
    (Trait.LIVES_IN, re.compile(rf"(?:住在|家住|家在|住)(?P<value>{_VALUE})(?P<verb>)的")),
    (
        Trait.INTRODUCED_BY,
        re.compile(r"(?P<value>[^，,。？?！!、；;：:\s]{1,20}?)(?P<verb>介绍认识的|介绍的|认识的)"),
    ),
)
_LEADS = ("那个", "那位", "这个", "这位")
# what may follow 「那个 / 那位」 when no relation word does: 「人」 or the question itself
_AFTER_LEAD = frozenset("人是叫姓，,？?。！!在现最后怎喜住干做多有过和跟")
_PAST = ("以前", "之前", "原来", "曾经")
_SELF = frozenset({"我", "本人", "自己"})
# a question about several persons (「……的同事有哪些」) lists them; it names no one
_SEVERAL = ("哪些", "几个", "几位", "多少", "都有", "有谁", "都是谁", "所有", "们")


@dataclass(frozen=True)
class Description:
    phrase: str  # the whole description as the question says it (「在市一院上班的那个邻居」)
    core: str  # the part that describes, up to its 「的」 (「在市一院上班的」)
    trait: Trait
    value: str  # 市一院 / 杭州 / 浙江大学 / 老张
    word: str | None  # the relation word (「邻居」); None for 「那个人」「那位」
    past: bool = False  # 「以前在百度上班的」「在百度上过班的」: former facts count too

    def anchored(self, anchor: str) -> Description:
        """An 「X 介绍的」 description whose X is only the end of ``value`` (「我想问老张」 →
        「老张」)."""
        cut = len(self.value) - len(anchor)
        return replace(self, phrase=self.phrase[cut:], core=self.core[cut:], value=anchor)

    def named(self, question: str, name: str) -> str:
        """``question`` asking about ``name`` instead: 「在腾讯上班的那个人喜欢什么？」 →
        「在腾讯上班的王浩喜欢什么？」."""
        return question.replace(self.phrase, f"{self.core}{name}", 1)


def _tail(rest: str, words: Iterable[str]) -> tuple[int, str | None] | None:
    """How much of ``rest`` (the text after the trait's 「的」) still belongs to the
    description, and its relation word; ``None`` if it does not end like a description."""
    lead = next((x for x in _LEADS if rest.startswith(x)), "")
    after = rest[len(lead) :]
    for word in sorted({w for w in words if len(w) >= 2}, key=len, reverse=True):
        if after.startswith(word):
            return len(lead) + len(word), word
    if not lead:
        return None
    if after.startswith("人"):
        return len(lead) + 1, None
    if not after or after[0] in _AFTER_LEAD:
        return len(lead), None
    return None


def may_describe(text: str) -> bool:
    """Whether ``text`` has a trait at all (cheap: no relation words needed yet)."""
    return any(pattern.search(text) for _, pattern in _PATTERNS)


def description(text: str, words: Iterable[str]) -> Description | None:
    """The first description in ``text`` (see the module doc), with ``words`` the relation
    words it may end with (the vocabulary's and the user's own wordings); ``None`` if none."""
    if any(m in text for m in _SEVERAL):
        return None
    wanted = list(words)
    found: list[tuple[int, Description]] = []
    for trait, pattern in _PATTERNS:
        for m in pattern.finditer(text):
            value = m.group("value").strip()
            if not value or value in _SELF:
                continue
            tail = _tail(text[m.end() :], wanted)
            if tail is None:
                continue
            length, word = tail
            before = text[: m.start()]
            start = m.start()
            if before.endswith(_PAST):
                start = max(before.rfind(p) for p in _PAST)
            past = "过" in m.group("verb") or start < m.start()
            if trait is Trait.INTRODUCED_BY:
                start = m.start("value")
            d = Description(
                phrase=text[start : m.end() + length],
                core=text[start : m.end()],
                trait=trait,
                value=value,
                word=word,
                past=past,
            )
            found.append((start, d))
    if not found:
        return None
    return min(found, key=lambda x: x[0])[1]


def anchors(value: str) -> list[str]:
    """The endings of an 「X 介绍的」 value that may name X, longest first (「我想问老张」:
    「我想问老张」, 「想问老张」, …, 「张」)."""
    return [value[i:] for i in range(len(value))]


@dataclass(frozen=True)
class KnownFact:
    """A fact of the graph, as far as descriptions care."""

    person_id: str
    predicate: str
    object: str
    current: bool = True


def _fits(value: str, obj: str) -> bool:
    obj = obj.strip()
    return bool(obj) and (value in obj or (len(obj) >= 2 and obj in value))


def matching(
    d: Description,
    persons: Iterable[str],
    facts: Iterable[KnownFact],
    *,
    relatives: Collection[str] | None,
    introduced_by: Mapping[str, Collection[str]],
    introducers: Collection[str] = (),
) -> list[str]:
    """The persons (ids, in ``persons``' order; Self must not be among them) ``d`` fits.

    ``relatives``: who is ``d.word`` of me (``None`` when ``d`` has no relation word).
    A work / home / school trait needs a fact of that kind whose object contains the value
    (or is contained in it): a current one, or any for a past description; a school is
    any one. 「X 介绍的」 needs ``introduced_by[person]`` (who introduced me to them) to
    meet ``introducers`` (whom X stands for)."""
    facts = list(facts)
    out: list[str] = []
    for pid in persons:
        if relatives is not None and pid not in relatives:
            continue
        if d.trait is Trait.INTRODUCED_BY:
            if not set(introduced_by.get(pid, ())) & set(introducers):
                continue
        elif not any(
            f.person_id == pid
            and f.predicate == d.trait.value
            and (f.current or d.past or d.trait is Trait.STUDIED_AT)
            and _fits(d.value, f.object)
            for f in facts
        ):
            continue
        out.append(pid)
    return out


__all__ = [
    "MAX_CANDIDATES",
    "MIN_CANDIDATES",
    "Description",
    "KnownFact",
    "Trait",
    "anchors",
    "description",
    "matching",
    "may_describe",
]
