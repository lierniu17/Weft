"""Feelings (感受): one direction per pair, three dimensions, every change kept (AC-30).

The current level of a dimension is its latest record by occurred date (then by when it
was written); the full list is its history.
"""

from __future__ import annotations

from dataclasses import dataclass

from weft.repositories.records import FeelingRecord

DIMENSIONS = ("closeness", "affinity", "trust")


@dataclass(frozen=True)
class DimensionView:
    dimension: str
    current: FeelingRecord
    history: list[FeelingRecord]  # oldest first


def by_direction(
    feelings: list[FeelingRecord], from_id: str, to_id: str
) -> dict[str, DimensionView]:
    """Recorded dimensions of ``from_id``'s feelings about ``to_id``; unrecorded ones absent."""
    out: dict[str, DimensionView] = {}
    for dimension in DIMENSIONS:
        history = sorted(
            (
                f
                for f in feelings
                if f.from_id == from_id and f.to_id == to_id and f.dimension == dimension
            ),
            key=lambda f: (f.occurred_at.first_day(), f.created_at),
        )
        if history:
            out[dimension] = DimensionView(dimension, history[-1], history)
    return out


__all__ = ["DIMENSIONS", "DimensionView", "by_direction"]
