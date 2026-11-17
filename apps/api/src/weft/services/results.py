"""Service results: expected outcomes (not found, conflicts, ...) are values, not exceptions.

Routes map ``Err.reason`` to a status code; that mapping is the route layer's only job.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True, slots=True)
class Ok[T]:
    value: T


@dataclass(frozen=True, slots=True)
class Err:
    reason: str
    message: str = ""
    detail: dict[str, Any] = field(default_factory=dict)


type Result[T] = Ok[T] | Err

# reasons shared across services
NOT_FOUND = "not_found"


def not_found(what: str = "resource") -> Err:
    return Err(NOT_FOUND, f"{what} does not exist")


__all__ = ["NOT_FOUND", "Err", "Ok", "Result", "not_found"]
