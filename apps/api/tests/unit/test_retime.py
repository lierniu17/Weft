"""Changing a Draft's occurred date re-times only the dates anchored on it (AC-8, AC-9)."""

from __future__ import annotations

from typing import Any

import pytest

from weft.domain.dates import PartialDate
from weft.domain.draft import Draft, retime

pytestmark = pytest.mark.unit


def draft(facts: list[dict[str, Any]] | None = None, met_at: str | None = None) -> Draft:
    relationship = {
        "id": "r1",
        "pair": ["我", "小李"],
        "types": [{"category": "social", "subtype": "同学", "original": "同学"}],
        "met_at": met_at,
        "confidence": "witnessed",
    }
    return Draft.model_validate(
        {
            "persons": [
                {
                    "id": "p1",
                    "mention": "我",
                    "match": "matched",
                    "person_id": "self",
                    "name": "陈明",
                },
                {"id": "p2", "mention": "小李", "match": "new"},
            ],
            "facts": [
                {
                    "id": f"f{i}",
                    "subject": "小李",
                    "predicate": "EXPERIENCED",
                    "object": f"事{i}",
                    "confidence": "witnessed",
                    **f,
                }
                for i, f in enumerate(facts or [], start=1)
            ],
            "relationships": [relationship] if met_at else [],
        }
    )


def dates(content: Draft) -> list[tuple[str | None, str | None]]:
    return [
        (str(f.valid_at) if f.valid_at else None, str(f.valid_to) if f.valid_to else None)
        for f in content.facts
    ]


def test_the_event_dated_on_the_old_occurred_date_moves_to_the_new_one() -> None:
    content = draft(met_at="2015")
    moved = retime(content, old=PartialDate(2015), new=PartialDate(2016))
    assert moved.relationships[0].met_at == PartialDate(2016)


def test_dates_relative_to_the_day_of_writing_stay() -> None:
    content = draft(
        [
            {"valid_at": "2026-11-14", "valid_to": "2026-11-15"},  # 上周末 = the event
            {"valid_at": "2025"},  # 他说去年在杭州买了房
            {},  # no time
        ]
    )
    moved = retime(content, old=PartialDate(2026, 11, 14), new=PartialDate(2026, 11, 7))
    assert dates(moved) == [("2026-11-07", "2026-11-15"), ("2025", None), (None, None)]


def test_every_date_is_cut_to_a_coarser_new_precision() -> None:
    content = draft([{"valid_at": "2026-11-14"}, {"valid_at": "2026-10-03"}])
    moved = retime(content, old=PartialDate(2026, 11, 14), new=PartialDate(2026))
    assert dates(moved) == [("2026", None), ("2026", None)]


def test_a_span_ending_before_its_moved_start_loses_its_end() -> None:
    content = draft([{"valid_at": "2026-11-14", "valid_to": "2026-11-15"}])
    moved = retime(content, old=PartialDate(2026, 11, 14), new=PartialDate(2026, 11, 16))
    assert dates(moved) == [("2026-11-16", None)]


def test_nothing_but_time_fields_changes() -> None:
    content = draft([{"valid_at": "2015", "object": "加入社团"}], met_at="2015")
    moved = retime(content, old=PartialDate(2015), new=PartialDate(2016, 9))
    assert [f.object for f in moved.facts] == ["加入社团"]
    assert moved.persons == content.persons
    assert moved.relationships[0].types == content.relationships[0].types
    assert moved.facts[0].valid_at == PartialDate(2016, 9)
    assert retime(content, old=PartialDate(2015), new=PartialDate(2015)) == content
