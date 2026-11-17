"""Entries: submission, occurred date with precision, daily quota (AC-6, AC-7, AC-40)."""

from __future__ import annotations

import asyncio
from datetime import UTC, datetime

import pytest

from tests.conftest import FakeClock
from tests.support.users import new_user
from weft.domain.dates import PartialDate, Precision
from weft.domain.draft import DraftStatus
from weft.domain.quota import LIMIT_REACHED_MESSAGE, QuotaKind
from weft.domain.tenancy import tenant_scope
from weft.infra import Infra
from weft.services import entries, usage
from weft.services.results import Err, Ok

pytestmark = pytest.mark.service


async def test_submitting_text_creates_an_entry_and_an_extracting_draft(infra: Infra) -> None:
    user = await new_user(infra)
    with tenant_scope(user.tenant):
        result = await entries.submit_entry(infra, text="今天和老张吃饭", occurred=None)
        assert isinstance(result, Ok)
        submitted = result.value
        assert submitted.entry.text == "今天和老张吃饭"
        assert submitted.draft.status is DraftStatus.EXTRACTING
        assert submitted.draft.entry_id == submitted.entry.id
        listed = await entries.list_entries(infra)
    assert [(e.id, d.status if d else None) for e, d in listed] == [
        (submitted.entry.id, DraftStatus.EXTRACTING)
    ]


@pytest.mark.parametrize("text", ["", "   ", "\n\t "])
async def test_blank_text_cannot_be_submitted(infra: Infra, text: str) -> None:
    user = await new_user(infra)
    with tenant_scope(user.tenant):
        result = await entries.submit_entry(infra, text=text, occurred=None)
        assert isinstance(result, Err) and result.reason == "blank_text"
        assert await entries.list_entries(infra) == []


async def test_occurred_date_defaults_to_today_in_beijing(infra: Infra, clock: FakeClock) -> None:
    clock.now = datetime(2026, 11, 16, 17, 30, tzinfo=UTC)  # 01:30 on 11-17 in Beijing
    user = await new_user(infra)
    with tenant_scope(user.tenant):
        result = await entries.submit_entry(infra, text="补记", occurred=None)
    assert isinstance(result, Ok)
    assert result.value.entry.occurred == PartialDate(2026, 11, 17)


@pytest.mark.parametrize(
    ("occurred", "precision"),
    [("2015", Precision.YEAR), ("2015-06", Precision.MONTH), ("2015-06-09", Precision.DAY)],
)
async def test_occurred_precision_is_saved(
    infra: Infra, occurred: str, precision: Precision
) -> None:
    user = await new_user(infra)
    with tenant_scope(user.tenant):
        result = await entries.submit_entry(
            infra, text="读大学时认识了小李", occurred=PartialDate.parse(occurred)
        )
        assert isinstance(result, Ok)
        [(entry, _)] = await entries.list_entries(infra)
    assert entry.occurred.isoformat() == occurred
    assert entry.occurred.precision is precision


@pytest.mark.parametrize("occurred", ["2026-11-17", "2026-12", "2027"])
async def test_future_dates_are_refused(infra: Infra, occurred: str) -> None:
    user = await new_user(infra)  # today is 2026-11-16 in Beijing
    with tenant_scope(user.tenant):
        result = await entries.submit_entry(
            infra, text="明天的事", occurred=PartialDate.parse(occurred)
        )
        assert isinstance(result, Err) and result.reason == "future_date"
        assert await entries.list_entries(infra) == []


async def test_entries_are_listed_latest_occurred_first(infra: Infra) -> None:
    user = await new_user(infra)
    with tenant_scope(user.tenant):
        for text, day in [("a", "2026-01-05"), ("b", "2026-11-16"), ("c", "2015")]:
            await entries.submit_entry(infra, text=text, occurred=PartialDate.parse(day))
        listed = await entries.list_entries(infra)
    assert [e.text for e, _ in listed] == ["b", "a", "c"]


async def test_entry_quota_refuses_past_the_configured_limit(infra: Infra) -> None:
    infra.settings = infra.settings.model_copy(update={"daily_entry_limit": 2})
    user = await new_user(infra)
    with tenant_scope(user.tenant):
        for i in range(2):
            assert isinstance(await entries.submit_entry(infra, text=f"第{i}条", occurred=None), Ok)
        refused = await entries.submit_entry(infra, text="第三条", occurred=None)
        assert isinstance(refused, Err) and refused.reason == "quota_exceeded"
        assert refused.message == LIMIT_REACHED_MESSAGE
        assert refused.detail["resets_at"] == "2026-11-17T00:00:00+08:00"
        assert len(await entries.list_entries(infra)) == 2
        report = await usage.today(infra)
    assert (report.entry.used, report.entry.limit, report.entry.remaining) == (2, 2, 0)
    assert report.ask.limit == 100  # default


async def test_quota_resets_at_beijing_midnight(infra: Infra, clock: FakeClock) -> None:
    infra.settings = infra.settings.model_copy(update={"daily_entry_limit": 1})
    clock.now = datetime(2026, 11, 16, 15, 59, tzinfo=UTC)  # 23:59 Beijing
    user = await new_user(infra)
    with tenant_scope(user.tenant):
        assert isinstance(await entries.submit_entry(infra, text="一", occurred=None), Ok)
        assert isinstance(await entries.submit_entry(infra, text="二", occurred=None), Err)
        clock.now = datetime(2026, 11, 16, 16, 0, tzinfo=UTC)  # 00:00 Beijing, next day
        assert isinstance(await entries.submit_entry(infra, text="三", occurred=None), Ok)
        assert (await usage.today(infra)).entry.used == 1


async def test_quota_counts_atomically_under_concurrent_submissions(infra: Infra) -> None:
    infra.settings = infra.settings.model_copy(update={"daily_entry_limit": 3})
    user = await new_user(infra)

    async def submit(i: int) -> bool:
        with tenant_scope(user.tenant):
            result = await entries.submit_entry(infra, text=f"并发{i}", occurred=None)
        return isinstance(result, Ok)

    outcomes = await asyncio.gather(*(submit(i) for i in range(8)))
    assert sum(outcomes) == 3
    with tenant_scope(user.tenant):
        assert len(await entries.list_entries(infra)) == 3
        assert (await usage.today(infra)).used(QuotaKind.ENTRY) == 3


async def test_quotas_are_per_user(infra: Infra) -> None:
    infra.settings = infra.settings.model_copy(update={"daily_entry_limit": 1})
    a, b = await new_user(infra), await new_user(infra)
    with tenant_scope(a.tenant):
        assert isinstance(await entries.submit_entry(infra, text="A", occurred=None), Ok)
    with tenant_scope(b.tenant):
        assert isinstance(await entries.submit_entry(infra, text="B", occurred=None), Ok)
