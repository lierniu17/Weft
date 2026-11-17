"""Confidence (可信度): how reliable a piece of information is, by its source.

Four levels, ordered 亲历 = 本人说 > 转述 > 推测 (AC-16). Witnessed and self-told
share a tier: when they conflict, either one counts as "not lower" than the other.
"""

from enum import StrEnum


class Confidence(StrEnum):
    WITNESSED = "witnessed"  # 亲历: I saw or experienced it myself
    SELF_TOLD = "self_told"  # 本人说: the person concerned said it
    HEARSAY = "hearsay"  # 转述: someone else told me
    INFERRED = "inferred"  # 推测: my guess, or inferred by the system

    @property
    def label(self) -> str:
        return _LABELS[self]

    @property
    def rank(self) -> int:
        """Comparable tier; higher is more reliable."""
        return _RANKS[self]


_LABELS = {
    Confidence.WITNESSED: "亲历",
    Confidence.SELF_TOLD: "本人说",
    Confidence.HEARSAY: "转述",
    Confidence.INFERRED: "推测",
}
_RANKS = {
    Confidence.WITNESSED: 2,
    Confidence.SELF_TOLD: 2,
    Confidence.HEARSAY: 1,
    Confidence.INFERRED: 0,
}


class ConflictAction(StrEnum):
    UPDATE = "update"  # the new value replaces the old; the old one is kept as history
    UNVERIFIED = "unverified"  # the new value is kept as 待核实 and does not replace the old


def resolve_conflict(*, old: Confidence, new: Confidence) -> ConflictAction:
    """Decide what a conflicting new single-valued item does to the existing one.

    The new value updates when its confidence is not lower than the old one's (AC-14);
    otherwise it becomes Unverified (AC-15).
    """
    return ConflictAction.UPDATE if new.rank >= old.rank else ConflictAction.UNVERIFIED


__all__ = ["Confidence", "ConflictAction", "resolve_conflict"]
