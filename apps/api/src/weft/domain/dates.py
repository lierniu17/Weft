"""Dates with precision (年 / 月 / 日).

An Entry's occurred date, a Fact's valid_at and a Relationship's met_at may only be
known to the year or month ("2015 年读大学时认识小李"). ``PartialDate`` carries exactly
the parts that are known; its precision is implied by which parts are present.

Relative times ("上周末", "去年") are resolved by the LLM against the Entry's occurred
date; ``clamp_to_entry_precision`` then guarantees the result is never more precise
than the Entry itself (AC-8).
"""

from __future__ import annotations

import calendar
import re
from dataclasses import dataclass
from datetime import date
from enum import StrEnum
from functools import total_ordering
from typing import Any

from pydantic import GetCoreSchemaHandler, GetJsonSchemaHandler
from pydantic.json_schema import JsonSchemaValue
from pydantic_core import core_schema

ISO_PATTERN = r"^\d{4}(-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?)?$"
_ISO_RE = re.compile(ISO_PATTERN)


class Precision(StrEnum):
    YEAR = "year"
    MONTH = "month"
    DAY = "day"

    @property
    def level(self) -> int:
        return {Precision.YEAR: 0, Precision.MONTH: 1, Precision.DAY: 2}[self]


class FutureDateError(ValueError):
    """The date lies after "today" (AC-7: future dates are not selectable)."""


@total_ordering
@dataclass(frozen=True, slots=True)
class PartialDate:
    year: int
    month: int | None = None
    day: int | None = None

    def __post_init__(self) -> None:
        if not 1 <= self.year <= 9999:
            raise ValueError(f"year out of range: {self.year}")
        if self.day is not None and self.month is None:
            raise ValueError("a day requires a month")
        if self.month is not None and not 1 <= self.month <= 12:
            raise ValueError(f"month out of range: {self.month}")
        if self.day is not None:
            date(self.year, self.month or 1, self.day)  # raises ValueError if invalid

    # --- construction -----------------------------------------------------

    @classmethod
    def parse(cls, text: str) -> PartialDate:
        """Parse ``YYYY``, ``YYYY-MM`` or ``YYYY-MM-DD``."""
        if not isinstance(text, str) or not _ISO_RE.match(text):
            raise ValueError(f"not a YYYY[-MM[-DD]] date: {text!r}")
        parts = [int(p) for p in text.split("-")]
        return cls(*parts)

    @classmethod
    def from_date(cls, value: date) -> PartialDate:
        return cls(value.year, value.month, value.day)

    # --- properties -------------------------------------------------------

    @property
    def precision(self) -> Precision:
        if self.day is not None:
            return Precision.DAY
        if self.month is not None:
            return Precision.MONTH
        return Precision.YEAR

    def first_day(self) -> date:
        return date(self.year, self.month or 1, self.day or 1)

    def last_day(self) -> date:
        if self.day is not None:
            return self.first_day()
        month = self.month or 12
        return date(self.year, month, calendar.monthrange(self.year, month)[1])

    def contains(self, other: PartialDate) -> bool:
        """True if ``other``'s whole period lies within this one's."""
        return self.first_day() <= other.first_day() and other.last_day() <= self.last_day()

    def truncate(self, precision: Precision) -> PartialDate:
        if precision.level >= self.precision.level:
            return self
        if precision is Precision.YEAR:
            return PartialDate(self.year)
        return PartialDate(self.year, self.month)

    # --- validation -------------------------------------------------------

    def ensure_not_future(self, *, today: date) -> None:
        """Reject a date whose period starts after ``today``.

        "2026" or "2026-11" are acceptable on 2026-11-16 because the period has begun.
        """
        if self.first_day() > today:
            raise FutureDateError(f"{self.isoformat()} is in the future (today is {today})")

    # --- formatting -------------------------------------------------------

    def isoformat(self) -> str:
        out = f"{self.year:04d}"
        if self.month is not None:
            out += f"-{self.month:02d}"
        if self.day is not None:
            out += f"-{self.day:02d}"
        return out

    def display(self) -> str:
        """Chinese display text, e.g. ``2015 年 6 月``."""
        out = f"{self.year} 年"
        if self.month is not None:
            out += f" {self.month} 月"
        if self.day is not None:
            out += f" {self.day} 日"
        return out

    def __str__(self) -> str:
        return self.isoformat()

    # --- ordering ---------------------------------------------------------

    def _key(self) -> tuple[int, int, int]:
        # Coarser dates sort before finer dates within the same period.
        return (self.year, self.month or 0, self.day or 0)

    def __lt__(self, other: object) -> bool:
        if not isinstance(other, PartialDate):
            return NotImplemented
        return self._key() < other._key()

    # --- pydantic ---------------------------------------------------------

    @classmethod
    def __get_pydantic_core_schema__(
        cls, _source: Any, _handler: GetCoreSchemaHandler
    ) -> core_schema.CoreSchema:
        from_str = core_schema.no_info_after_validator_function(cls.parse, core_schema.str_schema())
        return core_schema.json_or_python_schema(
            json_schema=from_str,
            python_schema=core_schema.union_schema([core_schema.is_instance_schema(cls), from_str]),
            serialization=core_schema.plain_serializer_function_ser_schema(
                lambda v: v.isoformat(), when_used="always"
            ),
        )

    @classmethod
    def __get_pydantic_json_schema__(
        cls, _schema: core_schema.CoreSchema, _handler: GetJsonSchemaHandler
    ) -> JsonSchemaValue:
        return {
            "type": "string",
            "pattern": ISO_PATTERN,
            "description": "Date with precision: YYYY (year), YYYY-MM (month) or YYYY-MM-DD (day).",
            "examples": ["2015", "2015-06", "2026-11-16"],
        }


def clamp_to_entry_precision(value: PartialDate, *, entry: PartialDate) -> PartialDate:
    """Cut an LLM-resolved date down to at most the Entry's precision (AC-8).

    An Entry dated only "2015" can never yield "2015-07" for "那年夏天".
    The result is never made more precise than the LLM's value.
    """
    return value.truncate(entry.precision)


__all__ = [
    "ISO_PATTERN",
    "FutureDateError",
    "PartialDate",
    "Precision",
    "clamp_to_entry_precision",
]
