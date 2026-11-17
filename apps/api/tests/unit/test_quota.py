"""Daily usage limits on Beijing time (AC-40 logic part)."""

from datetime import UTC, date, datetime, timedelta, timezone

import pytest

from weft.domain.quota import QuotaKind, beijing_day, decide, next_reset

pytestmark = pytest.mark.unit


def test_day_boundary_is_beijing_midnight() -> None:
    # 2026-11-16 15:59:59 UTC == 23:59:59 Beijing -> still the 16th
    assert beijing_day(datetime(2026, 11, 16, 15, 59, 59, tzinfo=UTC)) == date(2026, 11, 16)
    # 16:00 UTC == 00:00 Beijing on the 17th
    assert beijing_day(datetime(2026, 11, 16, 16, 0, 0, tzinfo=UTC)) == date(2026, 11, 17)


def test_naive_datetimes_are_rejected() -> None:
    with pytest.raises(ValueError):
        beijing_day(datetime(2026, 11, 16, 12, 0))


def test_next_reset_is_the_coming_beijing_midnight() -> None:
    now = datetime(2026, 11, 16, 3, 0, tzinfo=UTC)  # 11:00 Beijing
    reset = next_reset(now)
    assert reset == datetime(2026, 11, 16, 16, 0, tzinfo=UTC)
    assert reset.utcoffset() == timedelta(hours=8)


def test_next_reset_exactly_at_midnight_is_the_following_midnight() -> None:
    now = datetime(2026, 11, 17, 0, 0, tzinfo=timezone(timedelta(hours=8)))
    assert next_reset(now) == datetime(2026, 11, 18, 0, 0, tzinfo=timezone(timedelta(hours=8)))


NOW = datetime(2026, 11, 16, 4, 0, tzinfo=UTC)


def test_allowed_below_limit() -> None:
    d = decide(QuotaKind.ENTRY, used_today=49, limit=50, now=NOW)
    assert d.allowed
    assert d.remaining == 1


def test_rejected_at_limit_with_reset_time() -> None:
    d = decide(QuotaKind.ENTRY, used_today=50, limit=50, now=NOW)
    assert not d.allowed
    assert d.remaining == 0
    assert d.resets_at == datetime(2026, 11, 16, 16, 0, tzinfo=UTC)
    assert d.message == "今日已达上限，明天 0 点重置"


def test_limit_is_configurable_bot10() -> None:
    assert not decide(QuotaKind.ENTRY, used_today=2, limit=2, now=NOW).allowed
    assert decide(QuotaKind.ASK, used_today=2, limit=100, now=NOW).allowed


def test_remaining_never_negative() -> None:
    assert decide(QuotaKind.ASK, used_today=120, limit=100, now=NOW).remaining == 0


def test_negative_inputs_are_rejected() -> None:
    with pytest.raises(ValueError):
        decide(QuotaKind.ASK, used_today=-1, limit=100, now=NOW)
    with pytest.raises(ValueError):
        decide(QuotaKind.ASK, used_today=0, limit=-1, now=NOW)
