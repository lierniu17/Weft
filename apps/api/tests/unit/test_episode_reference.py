"""Graphiti resolves relative times against the episode reference: the day of writing when
the occurred date was read from the message (「上个月跳槽」 must not shift twice)."""

from __future__ import annotations

from datetime import UTC, date, datetime

from weft.domain.dates import PartialDate
from weft.domain.taxonomy import BUILTIN
from weft.extraction.pipeline import ExtractionInput, _episode

GROUP = "u_00000000000000000000000000000000"


def test_a_message_dated_from_its_text_is_referenced_to_the_day_of_writing() -> None:
    inp = ExtractionInput(
        text="小李上个月跳槽去了阿里",
        occurred=PartialDate(2026, 10),
        group_id=GROUP,
        taxonomy=BUILTIN,
        written_on=date(2026, 11, 18),
    )
    assert _episode(inp).valid_at == datetime(2026, 11, 18, tzinfo=UTC)


def test_an_entry_without_a_day_of_writing_is_referenced_to_its_occurred_date() -> None:
    inp = ExtractionInput(
        text="今天和老张吃饭", occurred=PartialDate(2026, 11, 16), group_id=GROUP, taxonomy=BUILTIN
    )
    assert _episode(inp).valid_at == datetime(2026, 11, 16, tzinfo=UTC)
