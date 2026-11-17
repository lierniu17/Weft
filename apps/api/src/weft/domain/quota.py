"""Daily usage limits (用量): entries and asks per user per Beijing-time day (AC-40).

The counter itself lives in Postgres (keyed by user id, kind and ``beijing_day``);
this module only decides, given today's count, whether one more is allowed.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from enum import StrEnum
from zoneinfo import ZoneInfo

BEIJING = ZoneInfo("Asia/Shanghai")
LIMIT_REACHED_MESSAGE = "今日已达上限，明天 0 点重置"


class QuotaKind(StrEnum):
    ENTRY = "entry"  # 录入
    ASK = "ask"  # 问答


def _require_aware(now: datetime) -> None:
    if now.tzinfo is None or now.utcoffset() is None:
        raise ValueError("quota decisions need a timezone-aware datetime")


def beijing_day(now: datetime) -> date:
    """The Beijing-time calendar day that ``now`` falls in; counters are keyed by it."""
    _require_aware(now)
    return now.astimezone(BEIJING).date()


def next_reset(now: datetime) -> datetime:
    """The next Beijing midnight strictly after ``now`` (in Beijing time)."""
    tomorrow = beijing_day(now) + timedelta(days=1)
    return datetime.combine(tomorrow, time.min, tzinfo=BEIJING)


@dataclass(frozen=True, slots=True)
class QuotaDecision:
    kind: QuotaKind
    allowed: bool
    used: int
    limit: int
    remaining: int
    resets_at: datetime

    @property
    def message(self) -> str | None:
        return None if self.allowed else LIMIT_REACHED_MESSAGE


def decide(kind: QuotaKind, *, used_today: int, limit: int, now: datetime) -> QuotaDecision:
    """May the user make one more ``kind`` request today, having made ``used_today``?"""
    if used_today < 0 or limit < 0:
        raise ValueError("used_today and limit must be non-negative")
    return QuotaDecision(
        kind=kind,
        allowed=used_today < limit,
        used=used_today,
        limit=limit,
        remaining=max(limit - used_today, 0),
        resets_at=next_reset(now),
    )


__all__ = [
    "BEIJING",
    "LIMIT_REACHED_MESSAGE",
    "QuotaDecision",
    "QuotaKind",
    "beijing_day",
    "decide",
    "next_reset",
]
