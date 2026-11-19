"""Relation phrases (关系说法) as the persons a question asks about: 「我老婆」「闺蜜」
「老张的老婆」「我老婆的闺蜜」 name nobody by name, but point to someone through the graph's
relationships. ``relation_phrase`` splits such a phrase into who it is relative to (its
*anchor*: 「我」, a name, another relation phrase, a pronoun, or nothing) and the relation
word; ``related`` follows the relation word from the anchor along the relationships.

A phrase is only a relation phrase when it ends with a relation word: the vocabulary's
subtypes and their common wordings (``taxonomy.RELATION_WORDS``) plus the wordings the
user's own relationships use (「健身教练」). 「王老师」 ends with one, but 「王」 is no
anchor (it names no one exactly) — that is left to the caller, which treats an unresolved
anchor as an unknown name.
"""

from __future__ import annotations

from collections.abc import Collection, Iterable
from dataclasses import dataclass

from weft.domain.taxonomy import DIRECTIONAL_SUBTYPES, subtype_of

_LEADING = ("那个", "这个", "那位", "这位")
_INVERSE = {"父母": "子女", "子女": "父母"}


@dataclass(frozen=True)
class RelationPhrase:
    anchor: str  # "" when the phrase is the relation word alone (「闺蜜」)
    word: str  # the relation word (「老婆」)


@dataclass(frozen=True)
class Tie:
    """One type of a relationship between persons ``a`` and ``b`` (ids)."""

    a: str
    b: str
    subtype: str
    original: str


def relation_phrase(text: str, words: Iterable[str]) -> RelationPhrase | None:
    """``text`` as an anchor and the longest relation word among ``words`` it ends with
    (「老张的老婆」 -> 老张 + 老婆; 「我的老同学」 -> 我 + 同学; 「那个闺蜜」 -> "" + 闺蜜);
    ``None`` if it ends with none."""
    phrase = text.strip()
    for lead in _LEADING:
        phrase = phrase.removeprefix(lead)
    for word in sorted({w for w in words if len(w) >= 2}, key=len, reverse=True):
        if not phrase.endswith(word):
            continue
        anchor = phrase[: -len(word)]
        if anchor.endswith("的老"):  # 「老张的老同学」
            anchor = anchor[:-1]
        return RelationPhrase(anchor=anchor.removesuffix("的").strip(), word=word)
    return None


def _said(tie: Tie, word: str, anchor: str, other: str) -> bool:
    """The tie's own wording is ``word`` (「闺蜜」; 「同组同事」「老家的老邻居」 for 同事,
    邻居); a wording that goes through someone else (「老婆的闺蜜」 for 闺蜜) is not. A
    parent / child wording may be either side's (「爸爸」, 「女儿」): it must also read in
    the subtype's direction (my 爸爸 is 陈建国, not 王秀英 — her tie says 妈妈)."""
    original = tie.original.strip()
    if tie.subtype in DIRECTIONAL_SUBTYPES:
        return original == word and _typed(tie, word, anchor, other)
    if original == word:
        return True
    through = original.rpartition("的")[0]
    return original.endswith(word) and not (through and subtype_of(through.strip()))


def _typed(tie: Tie, word: str, anchor: str, other: str) -> bool:
    """``other`` is ``anchor``'s ``word`` by the tie's subtype (老婆, 老公: 配偶)."""
    wanted = subtype_of(word)
    if wanted is None:
        return False
    if tie.subtype in DIRECTIONAL_SUBTYPES and wanted in _INVERSE:
        # 「A 是 B 的 父母」 reads pair[0] -> pair[1]
        return (tie.a == other and tie.subtype == wanted) or (
            tie.a == anchor and tie.subtype == _INVERSE[wanted]
        )
    return wanted == tie.subtype


def related(anchors: Collection[str], word: str, ties: Iterable[Tie]) -> set[str]:
    """The persons who are ``word`` (「老婆」「闺蜜」「同事」) of any of ``anchors`` (ids).

    A relationship worded that way wins (刘婷's 「闺蜜」 is 杜鹃, not every friend of hers);
    only if none is, the word's subtype decides (老张's 「老婆」 is whoever is his 配偶)."""
    pairs = [
        (tie, anchor, other)
        for tie in ties
        for anchor, other in ((tie.a, tie.b), (tie.b, tie.a))
        if anchor in anchors and other not in anchors
    ]
    said = {other for tie, anchor, other in pairs if _said(tie, word, anchor, other)}
    if said:
        return said
    return {other for tie, anchor, other in pairs if _typed(tie, word, anchor, other)}


def related_any(anchors: Collection[str], word: str, ties: Iterable[Tie]) -> set[str]:
    """The persons who are ``word`` of any of ``anchors`` either way: worded so, or of the
    word's subtype (for a description, 「那个朋友」 is any friend: 杜鹃, worded 「老婆的闺蜜」 but
    typed 朋友, too — unlike ``related``, where a worded tie wins)."""
    return {
        other
        for tie in ties
        for anchor, other in ((tie.a, tie.b), (tie.b, tie.a))
        if anchor in anchors
        and other not in anchors
        and (_said(tie, word, anchor, other) or _typed(tie, word, anchor, other))
    }


__all__ = ["RelationPhrase", "Tie", "related", "related_any", "relation_phrase"]
