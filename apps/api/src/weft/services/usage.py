"""Daily usage (用量): remaining entries and asks for today, Beijing day (AC-40)."""

from __future__ import annotations

from dataclasses import dataclass

from weft.domain.quota import QuotaDecision, QuotaKind, beijing_day, decide
from weft.infra import Infra
from weft.repositories.usage import UsageRepository
from weft.services._uow import tenant


def limit_for(infra: Infra, kind: QuotaKind) -> int:
    s = infra.settings
    return s.daily_entry_limit if kind is QuotaKind.ENTRY else s.daily_ask_limit


@dataclass(frozen=True)
class UsageReport:
    entry: QuotaDecision
    ask: QuotaDecision

    def used(self, kind: QuotaKind) -> int:
        return (self.entry if kind is QuotaKind.ENTRY else self.ask).used


async def today(infra: Infra) -> UsageReport:
    now = infra.clock()
    day = beijing_day(now)
    async with infra.sql() as session:
        repo = UsageRepository(session, tenant())
        decisions = {
            kind: decide(
                kind, used_today=await repo.count(kind, day), limit=limit_for(infra, kind), now=now
            )
            for kind in QuotaKind
        }
    return UsageReport(entry=decisions[QuotaKind.ENTRY], ask=decisions[QuotaKind.ASK])


__all__ = ["UsageReport", "limit_for", "today"]
