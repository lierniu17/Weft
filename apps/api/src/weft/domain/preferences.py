"""User preferences (graph-viz AC-18): account-level settings that follow the user across
devices. For now only the graph's appearance: 清蓝 (light, default) or 星空 (starfield)."""

from __future__ import annotations

from dataclasses import dataclass
from enum import StrEnum


class GraphTheme(StrEnum):
    LIGHT = "light"  # 清蓝
    STARFIELD = "starfield"  # 星空


@dataclass(frozen=True)
class Preferences:
    graph_theme: GraphTheme = GraphTheme.LIGHT


DEFAULT_PREFERENCES = Preferences()

__all__ = ["DEFAULT_PREFERENCES", "GraphTheme", "Preferences"]
