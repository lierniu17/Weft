"""Confidence ordering and the conflict rule (AC-14, AC-15, AC-16)."""

import pytest

from weft.domain.confidence import Confidence, ConflictAction, resolve_conflict

pytestmark = pytest.mark.unit


def test_four_levels_have_chinese_labels() -> None:
    assert [c.label for c in Confidence] == ["亲历", "本人说", "转述", "推测"]


def test_witnessed_and_self_told_are_equal_rank() -> None:
    assert Confidence.WITNESSED.rank == Confidence.SELF_TOLD.rank


def test_ordering_witnessed_over_hearsay_over_inferred() -> None:
    assert Confidence.WITNESSED.rank > Confidence.HEARSAY.rank > Confidence.INFERRED.rank
    assert Confidence.SELF_TOLD.rank > Confidence.HEARSAY.rank


def test_json_values_are_stable_english_codes() -> None:
    assert [c.value for c in Confidence] == ["witnessed", "self_told", "hearsay", "inferred"]
    assert Confidence("hearsay") is Confidence.HEARSAY


@pytest.mark.parametrize(
    ("old", "new", "expected"),
    [
        # AC-14: not lower -> update
        (Confidence.SELF_TOLD, Confidence.SELF_TOLD, ConflictAction.UPDATE),
        (Confidence.SELF_TOLD, Confidence.WITNESSED, ConflictAction.UPDATE),
        (Confidence.WITNESSED, Confidence.SELF_TOLD, ConflictAction.UPDATE),  # AC-16 same tier
        (Confidence.HEARSAY, Confidence.SELF_TOLD, ConflictAction.UPDATE),
        (Confidence.INFERRED, Confidence.HEARSAY, ConflictAction.UPDATE),
        (Confidence.INFERRED, Confidence.INFERRED, ConflictAction.UPDATE),
        # AC-15: lower -> unverified (本人说在字节, 转述在阿里)
        (Confidence.SELF_TOLD, Confidence.HEARSAY, ConflictAction.UNVERIFIED),
        (Confidence.WITNESSED, Confidence.INFERRED, ConflictAction.UNVERIFIED),
        (Confidence.HEARSAY, Confidence.INFERRED, ConflictAction.UNVERIFIED),
    ],
)
def test_conflict_rule(old: Confidence, new: Confidence, expected: ConflictAction) -> None:
    assert resolve_conflict(old=old, new=new) is expected


def test_conflict_action_values_match_draft_contract() -> None:
    assert {a.value for a in ConflictAction} == {"update", "unverified"}
