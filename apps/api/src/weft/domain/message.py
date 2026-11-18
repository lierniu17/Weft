"""消息 (Message) rules: what a handled message can report, and when it may be re-routed.

A message is handled according to its 意图 (ADR 0005). A part that cannot be done — the
day's quota of that kind is used up (AC-7), Q&A is unavailable — is a ``Problem`` the chat
shows next to the message; the other part is still done.

改为记录 / 改为提问 (AC-10): only a message handled as 记录 or 提问 (or 无关) can be
re-routed, only to the other kind, and never a 记录 already confirmed into the graph.

反问 (intent-clarify AC-4): the next message is sent with the pending 反问 as context only
if the user's latest message is 拿不准, not resolved, not itself an answer to a 反问, still
handled as 无关, and at most the answer window old.
"""

from __future__ import annotations

from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import TYPE_CHECKING, Any, Literal

from weft.domain.draft import DraftStatus
from weft.domain.intent import Intent

if TYPE_CHECKING:
    from weft.repositories.records import MessageRecord

Part = Literal["record", "ask"]

NOT_REROUTABLE = "not_reroutable"
ALREADY_CONFIRMED = "already_confirmed"


@dataclass(frozen=True, slots=True)
class Problem:
    part: Part
    error: str  # quota_exceeded | ask_failed | question_too_long | ...
    message: str
    resets_at: datetime | None = None  # quota_exceeded: next Beijing midnight

    def to_json(self) -> dict[str, Any]:
        out: dict[str, Any] = {"part": self.part, "error": self.error, "message": self.message}
        if self.resets_at is not None:
            out["resets_at"] = self.resets_at.isoformat()
        return out

    @classmethod
    def from_json(cls, data: dict[str, Any]) -> Problem:
        resets_at = data.get("resets_at")
        return cls(
            part=data["part"],
            error=data["error"],
            message=data["message"],
            resets_at=datetime.fromisoformat(resets_at) if resets_at else None,
        )


@dataclass(frozen=True, slots=True)
class Refusal:
    reason: str
    message: str


def reroute_refusal(
    current: Intent, target: Intent, draft_status: DraftStatus | None
) -> Refusal | None:
    """Why the message handled as ``current`` cannot be re-handled as ``target``, if it can't.

    ``draft_status`` is the status of the message's Draft, if it has one.
    """
    if target not in (Intent.RECORD, Intent.ASK):
        return Refusal(NOT_REROUTABLE, "只能改为记录或改为提问")
    if current is Intent.RECORD_ASK:
        return Refusal(NOT_REROUTABLE, "这条消息已经既记录又回答了")
    if current is target:
        label = "记录" if target is Intent.RECORD else "提问"
        return Refusal(NOT_REROUTABLE, f"这条消息已经按{label}处理了")
    if target is Intent.ASK and draft_status is DraftStatus.CONFIRMED:
        return Refusal(ALREADY_CONFIRMED, "这条记录已经确认进图谱，不能改为提问")
    return None


def awaits_answer(latest: MessageRecord | None, *, now: datetime, window: timedelta) -> bool:
    """Whether the user's ``latest`` message is a 反问 still open to a typed answer."""
    return (
        latest is not None
        and latest.uncertain
        and latest.intent is Intent.CHITCHAT
        and latest.clarification_resolved_at is None
        and latest.clarification_of is None  # only one round: an answer is never asked back
        and now - latest.created_at <= window
    )


__all__ = [
    "ALREADY_CONFIRMED",
    "NOT_REROUTABLE",
    "Part",
    "Problem",
    "Refusal",
    "awaits_answer",
    "reroute_refusal",
]
