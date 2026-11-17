"""PartialDate: a date with year / month / day precision (AC-7, AC-8)."""

from datetime import date

import pytest
from pydantic import BaseModel, ValidationError

from weft.domain.dates import (
    FutureDateError,
    PartialDate,
    Precision,
    clamp_to_entry_precision,
)

pytestmark = pytest.mark.unit

TODAY = date(2026, 11, 16)


def test_precision_follows_given_parts() -> None:
    assert PartialDate(2015).precision is Precision.YEAR
    assert PartialDate(2015, 6).precision is Precision.MONTH
    assert PartialDate(2015, 6, 5).precision is Precision.DAY


@pytest.mark.parametrize(
    ("text", "expected"),
    [
        ("2015", PartialDate(2015)),
        ("2015-06", PartialDate(2015, 6)),
        ("2015-06-05", PartialDate(2015, 6, 5)),
    ],
)
def test_parse_and_format_iso(text: str, expected: PartialDate) -> None:
    assert PartialDate.parse(text) == expected
    assert expected.isoformat() == text


@pytest.mark.parametrize(
    "bad", ["2015-13", "2015-02-30", "15", "2015/06", "2015-6", "", "2015-06-05T00:00"]
)
def test_rejects_invalid_dates(bad: str) -> None:
    with pytest.raises(ValueError):
        PartialDate.parse(bad)


def test_day_requires_month() -> None:
    with pytest.raises(ValueError):
        PartialDate(2015, None, 5)


def test_display_in_chinese() -> None:
    assert PartialDate(2015).display() == "2015 年"
    assert PartialDate(2015, 6).display() == "2015 年 6 月"
    assert PartialDate(2026, 11, 16).display() == "2026 年 11 月 16 日"


def test_from_date_has_day_precision() -> None:
    assert PartialDate.from_date(TODAY) == PartialDate(2026, 11, 16)


def test_period_bounds() -> None:
    assert PartialDate(2024, 2).first_day() == date(2024, 2, 1)
    assert PartialDate(2024, 2).last_day() == date(2024, 2, 29)
    assert PartialDate(2015).last_day() == date(2015, 12, 31)


# --- AC-7: no future dates, relative to an injected "today" -----------------


@pytest.mark.parametrize(
    "ok", [PartialDate(2026, 11, 16), PartialDate(2026, 11), PartialDate(2026), PartialDate(2015)]
)
def test_not_future_accepts_today_and_current_periods(ok: PartialDate) -> None:
    ok.ensure_not_future(today=TODAY)


@pytest.mark.parametrize(
    "future", [PartialDate(2026, 11, 17), PartialDate(2026, 12), PartialDate(2027)]
)
def test_not_future_rejects_future(future: PartialDate) -> None:
    with pytest.raises(FutureDateError):
        future.ensure_not_future(today=TODAY)


# --- ordering ---------------------------------------------------------------


def test_ordering_is_chronological_and_coarser_first_within_period() -> None:
    dates = [PartialDate(2016), PartialDate(2015, 6, 5), PartialDate(2015, 6), PartialDate(2015)]
    assert sorted(dates) == [
        PartialDate(2015),
        PartialDate(2015, 6),
        PartialDate(2015, 6, 5),
        PartialDate(2016),
    ]


def test_contains() -> None:
    assert PartialDate(2015).contains(PartialDate(2015, 7, 1))
    assert PartialDate(2015, 7).contains(PartialDate(2015, 7))
    assert not PartialDate(2015, 7).contains(PartialDate(2015))
    assert not PartialDate(2015).contains(PartialDate(2016, 1))


# --- AC-8: an LLM-returned date never exceeds the entry's precision ---------


def test_clamp_year_precision_entry_never_yields_month_or_day() -> None:
    entry = PartialDate(2015)
    # LLM resolved "那年夏天" to July -> keep only the year
    assert clamp_to_entry_precision(PartialDate(2015, 7, 15), entry=entry) == PartialDate(2015)
    assert clamp_to_entry_precision(PartialDate(2015, 7), entry=entry) == PartialDate(2015)


def test_clamp_month_precision_entry_drops_day() -> None:
    assert clamp_to_entry_precision(
        PartialDate(2020, 3, 9), entry=PartialDate(2020, 3)
    ) == PartialDate(2020, 3)


def test_clamp_day_precision_entry_keeps_llm_value() -> None:
    entry = PartialDate(2026, 11, 16)
    # "上周末" -> 2026-11-14
    assert clamp_to_entry_precision(PartialDate(2026, 11, 14), entry=entry) == PartialDate(
        2026, 11, 14
    )
    # "去年" -> 2025
    assert clamp_to_entry_precision(PartialDate(2025), entry=entry) == PartialDate(2025)


def test_clamp_never_increases_precision() -> None:
    assert clamp_to_entry_precision(PartialDate(2014), entry=PartialDate(2015, 3)) == PartialDate(
        2014
    )


# --- pydantic integration (used by Draft and API models) --------------------


class _Holder(BaseModel):
    at: PartialDate | None = None


def test_pydantic_round_trip_as_iso_string() -> None:
    held = _Holder.model_validate({"at": "2015-06"})
    assert held.at == PartialDate(2015, 6)
    assert held.model_dump(mode="json") == {"at": "2015-06"}


def test_pydantic_rejects_invalid_string() -> None:
    with pytest.raises(ValidationError):
        _Holder.model_validate({"at": "2015-13"})


def test_pydantic_json_schema_is_patterned_string() -> None:
    schema = _Holder.model_json_schema()
    variants = schema["properties"]["at"]["anyOf"]
    string_variant = next(v for v in variants if v.get("type") == "string")
    assert "pattern" in string_variant
