"""Message rules (AC-7, AC-10): problems survive a round trip; who may be re-routed where."""

from __future__ import annotations

from datetime import datetime

import pytest

from weft.domain.draft import DraftStatus
from weft.domain.intent import Intent
from weft.domain.message import (
    ALREADY_CONFIRMED,
    NOT_REROUTABLE,
    Problem,
    reroute_refusal,
)
from weft.domain.quota import BEIJING

pytestmark = pytest.mark.unit


def test_a_problem_round_trips_through_json() -> None:
    quota = Problem(
        "record",
        "quota_exceeded",
        "今日已达上限，明天 0 点重置",
        datetime(2026, 11, 17, tzinfo=BEIJING),
    )
    failed = Problem("ask", "ask_failed", "问答暂时不可用，请稍后再试")
    for p in (quota, failed):
        assert Problem.from_json(p.to_json()) == p
    assert quota.to_json()["resets_at"] == "2026-11-17T00:00:00+08:00"
    assert "resets_at" not in failed.to_json()


@pytest.mark.parametrize(
    ("current", "target", "status"),
    [
        (Intent.RECORD, Intent.ASK, DraftStatus.PENDING),  # the draft is discarded first
        (Intent.RECORD, Intent.ASK, DraftStatus.EXTRACTING),
        (Intent.RECORD, Intent.ASK, DraftStatus.FAILED),
        (Intent.RECORD, Intent.ASK, DraftStatus.DISCARDED),
        (Intent.RECORD, Intent.ASK, None),  # the record never happened (quota)
        (Intent.ASK, Intent.RECORD, None),
        (Intent.CHITCHAT, Intent.RECORD, None),  # 记下来
        (Intent.CHITCHAT, Intent.ASK, None),  # 帮我查
    ],
)
def test_allowed_reroutes(current: Intent, target: Intent, status: DraftStatus | None) -> None:
    assert reroute_refusal(current, target, status) is None


@pytest.mark.parametrize(
    ("current", "target", "status", "reason"),
    [
        (Intent.RECORD, Intent.ASK, DraftStatus.CONFIRMED, ALREADY_CONFIRMED),
        (Intent.RECORD_ASK, Intent.ASK, DraftStatus.PENDING, NOT_REROUTABLE),
        (Intent.RECORD_ASK, Intent.RECORD, None, NOT_REROUTABLE),
        (Intent.RECORD, Intent.RECORD, DraftStatus.PENDING, NOT_REROUTABLE),
        (Intent.ASK, Intent.ASK, None, NOT_REROUTABLE),
        (Intent.CHITCHAT, Intent.CHITCHAT, None, NOT_REROUTABLE),
        (Intent.ASK, Intent.RECORD_ASK, None, NOT_REROUTABLE),
    ],
)
def test_refused_reroutes(
    current: Intent, target: Intent, status: DraftStatus | None, reason: str
) -> None:
    refusal = reroute_refusal(current, target, status)
    assert refusal is not None and refusal.reason == reason and refusal.message
