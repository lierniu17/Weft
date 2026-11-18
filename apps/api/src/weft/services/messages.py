"""消息 (messages): one text box, routed by 意图 (ADR 0005, intent-routing spec AC-2..AC-7, AC-10).

``send`` recognizes the message (free) and hands it to the existing services:

* 记录 → an Entry and its 抽取中 Draft (``entries.submit_entry``), one entry counted;
* 提问 → an answer from the graph (``ask``), one ask counted, nothing recorded;
* 记录 + 提问 → both: the Draft from the new-information part first, then the answer to the
  question part — from the graph as it is, so never from that unconfirmed Draft (AC-5);
* 无关 → a short reply; nothing recorded, nothing asked, nothing counted (AC-6).

A part whose quota is used up (or whose Q&A fails) is reported as a ``Problem`` on the
message; the other part is still done (AC-7). Every message is stored, so the chat can be
rebuilt from ``list_messages`` (newest last).

``reroute`` handles a message the other way (改为记录 / 改为提问, AC-10).
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime

from weft.domain.answer import Answer
from weft.domain.dates import PartialDate
from weft.domain.draft import DraftStatus
from weft.domain.intent import Intent
from weft.domain.message import Part, Problem, reroute_refusal
from weft.infra import Infra
from weft.repositories.messages import MessageRepository, MessageWithEntry
from weft.repositories.records import DraftRecord, EntryRecord, MessageRecord
from weft.services import ask, drafts, entries, intent
from weft.services._uow import tenant
from weft.services.results import Err, Ok, Result, not_found

MAX_MESSAGE_LENGTH = entries.MAX_ENTRY_LENGTH
DEFAULT_PAGE_SIZE = 50
MAX_PAGE_SIZE = 200
UNCONFIRMED = (DraftStatus.EXTRACTING, DraftStatus.PENDING, DraftStatus.FAILED)


@dataclass(frozen=True)
class MessageView:
    message: MessageRecord
    entry: EntryRecord | None
    draft: DraftRecord | None


@dataclass(frozen=True)
class Handled:
    view: MessageView
    new_draft_id: uuid.UUID | None = None  # an 抽取中 Draft the caller must extract


@dataclass(frozen=True)
class Page:
    messages: list[MessageView]
    has_more: bool  # older messages exist


def _view(row: MessageWithEntry) -> MessageView:
    message, entry, draft = row
    return MessageView(message=message, entry=entry, draft=draft)


def _problem(part: Part, err: Err) -> Problem:
    resets_at = err.detail.get("resets_at")
    return Problem(
        part=part,
        error=err.reason,
        message=err.message,
        resets_at=datetime.fromisoformat(resets_at) if isinstance(resets_at, str) else None,
    )


async def _record(
    infra: Infra, text: str, occurred: PartialDate | None
) -> Result[entries.Submitted]:
    return await entries.submit_entry(infra, text=text, occurred=occurred, dated_from_text=True)


async def _ask(infra: Infra, question: str) -> Result[Answer]:
    refused = ask.check_question(question) or await ask.charge(infra)
    if refused is not None:
        return refused
    asked = await ask.answer(infra, question)
    return asked if isinstance(asked, Err) else Ok(asked.value.answer)


async def _load(infra: Infra, message: MessageRecord) -> MessageView:
    async with infra.sql() as session:
        return _view(await MessageRepository(session, tenant()).with_entry(message))


async def _update(infra: Infra, message_id: uuid.UUID, **values: object) -> MessageView:
    async with infra.sql.begin() as session:
        repo = MessageRepository(session, tenant())
        updated = await repo.update_handling(message_id, **values)
        assert updated is not None  # the message is the caller's own and messages are not deleted
        return _view(await repo.with_entry(updated))


async def send(infra: Infra, text: str) -> Result[Handled]:
    body = text.strip()
    if not body:
        return Err("blank_text", "消息不能为空")
    if len(body) > MAX_MESSAGE_LENGTH:
        return Err("text_too_long", f"消息不能超过 {MAX_MESSAGE_LENGTH} 字")

    seen = await intent.recognize(infra, body)  # free (AC-2)
    problems: list[Problem] = []
    submitted: entries.Submitted | None = None
    if seen.intent in (Intent.RECORD, Intent.RECORD_ASK):
        recorded = await _record(infra, seen.record_text or body, seen.occurred)
        if isinstance(recorded, Err):
            problems.append(_problem("record", recorded))
        else:
            submitted = recorded.value

    async with infra.sql.begin() as session:
        message = await MessageRepository(session, tenant()).create(
            text=body,
            intent=seen.intent,
            recognized_intent=seen.intent,
            confidence=seen.confidence,
            uncertain=seen.uncertain,
            occurred=seen.occurred,
            record_text=seen.record_text if seen.intent is Intent.RECORD_ASK else None,
            question=seen.question if seen.intent is Intent.RECORD_ASK else None,
            entry_id=submitted.entry.id if submitted else None,
            reply=seen.reply if seen.intent is Intent.CHITCHAT else None,
            problems=tuple(problems),
        )
    new_draft_id = submitted.draft.id if submitted else None

    if seen.intent in (Intent.ASK, Intent.RECORD_ASK):
        answered = await _ask(infra, seen.question or body)
        if isinstance(answered, Err):
            problems.append(_problem("ask", answered))
            view = await _update(infra, message.id, problems=tuple(problems))
        else:
            view = await _update(infra, message.id, answer=answered.value)
        return Ok(Handled(view, new_draft_id))
    return Ok(Handled(await _load(infra, message), new_draft_id))


async def reroute(infra: Infra, message_id: uuid.UUID, target: Intent) -> Result[Handled]:
    """改为记录 / 改为提问 (AC-10): handle the message the other way, counting the new kind.

    Nothing already counted is given back. 改为提问 discards the message's Draft if it is
    not confirmed yet — after the answer is in, so a failed answer changes nothing.
    """
    async with infra.sql() as session:
        repo = MessageRepository(session, tenant())
        message = await repo.get(message_id)
        if message is None:
            return not_found("message")
        _, _, draft = await repo.with_entry(message)
    refusal = reroute_refusal(message.intent, target, draft.status if draft else None)
    if refusal is not None:
        return Err(refusal.reason, refusal.message)

    if target is Intent.RECORD:
        recorded = await _record(infra, message.text, message.occurred)
        if isinstance(recorded, Err):
            return recorded
        view = await _update(
            infra,
            message.id,
            intent=Intent.RECORD,
            entry_id=recorded.value.entry.id,
            answer=None,
            reply=None,
            problems=(),
        )
        return Ok(Handled(view, recorded.value.draft.id))

    answered = await _ask(infra, message.text)
    if isinstance(answered, Err):
        return answered
    if draft is not None and draft.status in UNCONFIRMED:
        await drafts.discard_draft(infra, draft.id)  # confirmed meanwhile: it simply stays
    view = await _update(
        infra, message.id, intent=Intent.ASK, answer=answered.value, reply=None, problems=()
    )
    return Ok(Handled(view))


async def list_messages(
    infra: Infra, *, before: uuid.UUID | None = None, limit: int = DEFAULT_PAGE_SIZE
) -> Result[Page]:
    """The latest ``limit`` messages older than ``before`` (if given), oldest first."""
    limit = max(1, min(limit, MAX_PAGE_SIZE))
    async with infra.sql() as session:
        page = await MessageRepository(session, tenant()).page(before=before, limit=limit)
    if page is None:
        return not_found("message")
    rows, has_more = page
    return Ok(Page(messages=[_view(r) for r in rows], has_more=has_more))


__all__ = [
    "DEFAULT_PAGE_SIZE",
    "MAX_MESSAGE_LENGTH",
    "MAX_PAGE_SIZE",
    "Handled",
    "MessageView",
    "Page",
    "list_messages",
    "reroute",
    "send",
]
