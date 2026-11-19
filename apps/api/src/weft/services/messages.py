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

反问 (intent-clarify spec): a 拿不准 message keeps the 反问 recognition wrote (free, AC-1,
AC-7). Then either

* an option is clicked (``clarify``): 记下 records the original text, 查 answers the
  option's question; the 反问 is resolved (AC-3); or
* the next message is typed while the 反问 is open (``awaits_answer``): it is recognized
  together with it. If it answers, the merged meaning is handled on the answer message and
  the 反问 is resolved; a second 拿不准 only gets 「记下来 / 帮我查」, which act on 原话 +
  回答 (AC-4, AC-5). If it does not answer, it is an ordinary message and the 反问 only
  takes clicks from then on (AC-6).

A 反问 whose handling hit a used-up quota stays unresolved (AC-7).

指代确认 (conversation-context spec): 问答 may answer a question with a 指代确认 instead
(several persons or events fit). It is kept like a 反问 (``clarify`` with source ask, no
answer yet); the ask counted when the question was sent covers it and whatever settles it
(AC-2, AC-3):

* clicking an option answers the option's question, counting nothing more;
* a message typed while it is open (same waiting rule) is recognized with the question,
  the confirmation and its candidates; if it says which one, the merged question is
  answered on that message — free, and never confirmed a second time. Otherwise it is an
  ordinary message.

上文 (AC-9, AC-10): every recognition and every answer is given the user's latest answered
questions (``history``: at most 3, within the window). A message whose answer was read with
them records which (``history_used_of``); ``reanswer`` answers it again without them
(「不接上文」), counting one ask.
"""

from __future__ import annotations

import uuid
from dataclasses import dataclass
from datetime import datetime, timedelta

from weft.domain.answer import Answer, AnswerClarify, AnswerKind
from weft.domain.conversation import MAX_HISTORY_TURNS, HistoryTurn, select_history, turn_of
from weft.domain.dates import PartialDate
from weft.domain.draft import DraftStatus
from weft.domain.intent import (
    UNCERTAIN_REPLY,
    Clarification,
    ClarifyContext,
    ClarifyOption,
    ClarifySource,
    Intent,
    Recognition,
)
from weft.domain.message import Part, Problem, awaits_answer, reroute_refusal
from weft.domain.quota import LIMIT_REACHED_MESSAGE, next_reset
from weft.infra import Infra
from weft.repositories.messages import MessageRepository, MessageWithEntry
from weft.repositories.records import DraftRecord, EntryRecord, MessageRecord
from weft.services import ask, drafts, entries, intent, usage
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
    # 上文 the answer was read with: (message id, its question), oldest first (AC-10)
    follows: tuple[tuple[uuid.UUID, str], ...] = ()


@dataclass(frozen=True)
class Handled:
    view: MessageView
    new_draft_id: uuid.UUID | None = None  # an 抽取中 Draft the caller must extract


@dataclass(frozen=True)
class Page:
    messages: list[MessageView]
    has_more: bool  # older messages exist


def _view(row: MessageWithEntry, questions: dict[uuid.UUID, str] | None = None) -> MessageView:
    message, entry, draft = row
    known = questions or {}
    follows = tuple((i, known[i]) for i in message.history_used_of if i in known)
    return MessageView(message=message, entry=entry, draft=draft, follows=follows)


async def _views(repo: MessageRepository, rows: list[MessageWithEntry]) -> list[MessageView]:
    """The rows as views, with the questions their answers followed on (AC-10, AC-11)."""
    questions = await repo.questions([i for m, _, _ in rows for i in m.history_used_of])
    return [_view(r, questions) for r in rows]


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


@dataclass(frozen=True)
class _Answered:
    """How a question was handled: an answer, or a 指代确认 waiting for the user."""

    answer: Answer | None
    clarify: Clarification | None
    history_used_of: tuple[uuid.UUID, ...]

    def handling(self, *, replace_clarify: bool = False) -> dict[str, object]:
        """The message's new handling columns. A 反问 already on the message stays (it was
        settled) unless ``replace_clarify`` or a 指代确认 takes its place."""
        out: dict[str, object] = {"answer": self.answer, "history_used_of": self.history_used_of}
        if self.clarify is not None or replace_clarify:
            out["clarify"] = self.clarify
        return out


def _confirmation(asked: AnswerClarify) -> Clarification:
    """问答's 指代确认, kept like a 反问 (source ask): every option 查 its question."""
    return Clarification(
        question=asked.question,
        options=tuple(
            ClarifyOption(o.label, Intent.ASK, o.question, o.person_id) for o in asked.options
        ),
        source=ClarifySource.ASK,
    )


async def _ask(
    infra: Infra,
    question: str,
    *,
    history: list[HistoryTurn] | None = None,
    charged: bool = True,
    allow_clarify: bool = True,
) -> Result[_Answered]:
    """Answer ``question`` with the 上文 ``history``. ``charged=False``: the ask that started
    it was counted already (an answer to a 指代确认, AC-2, AC-3)."""
    refused = ask.check_question(question) or (await ask.charge(infra) if charged else None)
    if refused is not None:
        return refused
    turns = history or []
    asked = await ask.answer(infra, question, history=turns, allow_clarify=allow_clarify)
    if isinstance(asked, Err):
        return asked
    used = tuple(t.message_id for t in turns) if asked.value.used_history else ()
    answer = asked.value.answer
    if answer.kind is AnswerKind.CLARIFY and answer.clarify is not None:
        return Ok(_Answered(None, _confirmation(answer.clarify), used))
    return Ok(_Answered(answer, None, used))


async def _history(infra: Infra) -> list[HistoryTurn]:
    """The 上文 for a question asked now (AC-9)."""
    async with infra.sql() as session:
        recent, now = await MessageRepository(session, tenant()).answered(MAX_HISTORY_TURNS)
    turns = [t for t in (turn_of(m) for m in recent) if t is not None]
    window = timedelta(minutes=infra.settings.history_window_minutes)
    return select_history(turns, now=now, window=window)


async def _load(infra: Infra, message: MessageRecord) -> MessageView:
    async with infra.sql() as session:
        repo = MessageRepository(session, tenant())
        [view] = await _views(repo, [await repo.with_entry(message)])
        return view


async def _update(infra: Infra, message_id: uuid.UUID, **values: object) -> MessageView:
    async with infra.sql.begin() as session:
        repo = MessageRepository(session, tenant())
        updated = await repo.update_handling(message_id, **values)
        assert updated is not None  # the message is the caller's own and messages are not deleted
        [view] = await _views(repo, [await repo.with_entry(updated)])
        return view


async def _pending(infra: Infra) -> MessageRecord | None:
    """The user's latest message if its 反问 still takes a typed answer (AC-4)."""
    async with infra.sql() as session:
        latest, now = await MessageRepository(session, tenant()).latest()
    window = timedelta(minutes=infra.settings.clarify_answer_window_minutes)
    return latest if awaits_answer(latest, now=now, window=window) else None


def _context(pending: MessageRecord) -> ClarifyContext:
    clarify = pending.clarify
    if clarify is not None and clarify.source is ClarifySource.ASK:
        return ClarifyContext(
            original=pending.question or pending.text,
            clarify_question=clarify.question,
            source=ClarifySource.ASK,
            options=tuple((o.label, o.question or "") for o in clarify.options),
        )
    asked = clarify.question if clarify else UNCERTAIN_REPLY
    return ClarifyContext(original=pending.text, clarify_question=asked)


def _confirms(pending: MessageRecord | None) -> bool:
    """``pending`` waits on 问答's 指代确认 (not on intent recognition's 反问)."""
    return (
        pending is not None
        and pending.clarify is not None
        and pending.clarify.source is ClarifySource.ASK
    )


def _settled(seen: Recognition) -> Recognition:
    """A typed answer to a 指代确认 is a question: still unsure who is meant, it is asked as
    it reads (原问题 + 回答) — answered by the existing rules, never confirmed again (AC-3)."""
    if not seen.uncertain or seen.question is None:
        return seen
    return Recognition(
        Intent.ASK,
        seen.confidence,
        False,
        seen.occurred,
        question=seen.question,
        answers_clarification=True,
    )


def _stored_parts(seen: Recognition) -> tuple[str | None, str | None]:
    """``record_text`` / ``question`` kept on the message: the two parts of a 记录 + 提问,
    and for an answer to a 反问 the merged texts (what 记下来 / 帮我查 act on, AC-5)."""
    if seen.answers_clarification or seen.intent is Intent.RECORD_ASK:
        return seen.record_text, seen.question
    return None, None


async def send(infra: Infra, text: str) -> Result[Handled]:
    body = text.strip()
    if not body:
        return Err("blank_text", "消息不能为空")
    if len(body) > MAX_MESSAGE_LENGTH:
        return Err("text_too_long", f"消息不能超过 {MAX_MESSAGE_LENGTH} 字")

    pending = await _pending(infra)
    context = None if pending is None else _context(pending)
    history = await _history(infra)
    seen = await intent.recognize(infra, body, context, history)  # free (AC-2; 反问, AC-7)
    answered = pending if pending is not None and seen.answers_clarification else None
    confirmed = answered is not None and _confirms(answered)
    if confirmed:
        seen = _settled(seen)
    problems: list[Problem] = []
    submitted: entries.Submitted | None = None
    if seen.intent in (Intent.RECORD, Intent.RECORD_ASK):
        recorded = await _record(infra, seen.record_text or body, seen.occurred)
        if isinstance(recorded, Err):
            problems.append(_problem("record", recorded))
        else:
            submitted = recorded.value

    record_text, question = _stored_parts(seen)
    async with infra.sql.begin() as session:
        message = await MessageRepository(session, tenant()).create(
            text=body,
            intent=seen.intent,
            recognized_intent=seen.intent,
            confidence=seen.confidence,
            uncertain=seen.uncertain,
            occurred=seen.occurred,
            record_text=record_text,
            question=question,
            entry_id=submitted.entry.id if submitted else None,
            reply=seen.reply if seen.intent is Intent.CHITCHAT else None,
            problems=tuple(problems),
            clarify=seen.clarify if seen.uncertain and answered is None else None,
            clarification_of=None if answered is None else answered.id,
        )
    new_draft_id = submitted.draft.id if submitted else None

    view: MessageView | None = None
    if seen.intent in (Intent.ASK, Intent.RECORD_ASK):
        asked = await _ask(
            infra,
            seen.question or body,
            history=history,
            charged=not confirmed,  # the confirmed question was counted already (AC-3)
            allow_clarify=answered is None,  # one round of asking back only
        )
        if isinstance(asked, Err):
            problems.append(_problem("ask", asked))
            view = await _update(infra, message.id, problems=tuple(problems))
        else:
            view = await _update(infra, message.id, **asked.value.handling())
    if answered is not None and not problems:
        await _update(infra, answered.id, clarification_resolved_at=infra.clock())
    return Ok(Handled(view or await _load(infra, message), new_draft_id))


async def _both_quotas_left(infra: Infra) -> Err | None:
    """Room in both quotas, checked before a 记录 + 提问 option does either part (AC-7)."""
    report = await usage.today(infra)
    for decision in (report.entry, report.ask):
        if not decision.allowed:
            return Err(
                "quota_exceeded",
                LIMIT_REACHED_MESSAGE,
                {"kind": decision.kind.value, "resets_at": next_reset(infra.clock()).isoformat()},
            )
    return None


async def clarify(infra: Infra, message_id: uuid.UUID, option: int) -> Result[Handled]:
    """Click option ``option`` of the message's 反问 (AC-3): 记下 records the original text
    (not the option's rewording), 查 answers the option's question; the 反问 is resolved.

    Counted like any 记录 / 提问 (AC-7). A used-up quota refuses the click and changes
    nothing, so the 反问 stays open.
    """
    async with infra.sql() as session:
        message = await MessageRepository(session, tenant()).get(message_id)
    if message is None:
        return not_found("message")
    if message.clarify is None:
        return Err("no_clarification", "这条消息没有反问")
    if message.clarification_resolved_at is not None:
        return Err("already_resolved", "这个反问已经处理过了")
    if not 0 <= option < len(message.clarify.options):
        return Err("no_such_option", "没有这个候选")
    if message.clarify.source is ClarifySource.ASK:
        return await _confirm(infra, message, message.clarify.options[option])
    chosen = message.clarify.options[option]
    question = chosen.question or message.text
    if chosen.intent is Intent.RECORD_ASK:
        refused = ask.check_question(question) or await _both_quotas_left(infra)
        if refused is not None:
            return refused

    submitted: entries.Submitted | None = None
    if chosen.intent in (Intent.RECORD, Intent.RECORD_ASK):
        recorded = await _record(infra, message.text, message.occurred)
        if isinstance(recorded, Err):
            return recorded
        submitted = recorded.value
    answer: Answer | None = None
    used: tuple[uuid.UUID, ...] = ()
    problems: tuple[Problem, ...] = ()
    if chosen.intent in (Intent.ASK, Intent.RECORD_ASK):
        # one round of asking back: the 反问 was it, so no 指代确认 after it
        asked = await _ask(infra, question, history=await _history(infra), allow_clarify=False)
        if isinstance(asked, Err):
            if submitted is None:
                return asked
            problems = (_problem("ask", asked),)  # the 记录 part is done: keep it
        else:
            answer = asked.value.answer
            used = asked.value.history_used_of
    view = await _update(
        infra,
        message.id,
        intent=chosen.intent,
        entry_id=submitted.entry.id if submitted else None,
        answer=answer,
        history_used_of=used,
        reply=None,
        problems=problems,
        record_text=message.text if chosen.intent is Intent.RECORD_ASK else None,
        question=None if chosen.intent is Intent.RECORD else question,
        clarification_resolved_at=infra.clock(),
    )
    return Ok(Handled(view, submitted.draft.id if submitted else None))


async def _confirm(infra: Infra, message: MessageRecord, chosen: ClarifyOption) -> Result[Handled]:
    """Click a candidate of 问答's 指代确认 (AC-2): answer its question, counting nothing
    (the question's ask covers it), without asking back again; the 确认 is resolved."""
    question = chosen.question or message.question or message.text
    asked = await _ask(infra, question, charged=False, allow_clarify=False)
    if isinstance(asked, Err):
        return asked
    view = await _update(
        infra,
        message.id,
        answer=asked.value.answer,
        question=question,
        problems=(),
        clarification_resolved_at=infra.clock(),
    )
    return Ok(Handled(view))


async def reanswer(infra: Infra, message_id: uuid.UUID) -> Result[Handled]:
    """「不接上文」(AC-10): answer the message's question again on its own, without the 上文
    its answer was read with, counting one ask; the new answer (or 指代确认) replaces it."""
    async with infra.sql() as session:
        message = await MessageRepository(session, tenant()).get(message_id)
    if message is None:
        return not_found("message")
    if message.intent not in (Intent.ASK, Intent.RECORD_ASK) or not message.history_used_of:
        return Err("no_history", "这条回答没有接上文")
    asked = await _ask(
        infra, message.question or message.text, allow_clarify=message.clarification_of is None
    )
    if isinstance(asked, Err):
        return asked
    confirming = asked.value.clarify is not None
    view = await _update(
        infra,
        message.id,
        **asked.value.handling(replace_clarify=True),
        problems=tuple(p for p in message.problems if p.part != "ask"),
        clarification_resolved_at=None if confirming else message.clarification_resolved_at,
    )
    return Ok(Handled(view))


async def reroute(infra: Infra, message_id: uuid.UUID, target: Intent) -> Result[Handled]:
    """改为记录 / 改为提问 (AC-10): handle the message the other way, counting the new kind.

    Nothing already counted is given back. 改为提问 discards the message's Draft if it is
    not confirmed yet — after the answer is in, so a failed answer changes nothing. An answer
    to a 反问 is handled by its merged text (原话 + 回答, intent-clarify AC-5); an open 反问
    is resolved by it.
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
    asked_back = message.uncertain or _confirms(message)
    settled: dict[str, object] = (
        {"clarification_resolved_at": infra.clock()}
        if asked_back and message.clarification_resolved_at is None
        else {}
    )

    if target is Intent.RECORD:
        recorded = await _record(infra, message.record_text or message.text, message.occurred)
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
            **settled,
        )
        return Ok(Handled(view, recorded.value.draft.id))

    answered = await _ask(infra, message.question or message.text)
    if isinstance(answered, Err):
        return answered
    if draft is not None and draft.status in UNCONFIRMED:
        await drafts.discard_draft(infra, draft.id)  # confirmed meanwhile: it simply stays
    if answered.value.clarify is not None:  # a fresh 指代确认 replaces whatever was asked back
        settled = {"clarification_resolved_at": None}
    view = await _update(
        infra,
        message.id,
        intent=Intent.ASK,
        **answered.value.handling(),
        reply=None,
        problems=(),
        **settled,
    )
    return Ok(Handled(view))


async def list_messages(
    infra: Infra, *, before: uuid.UUID | None = None, limit: int = DEFAULT_PAGE_SIZE
) -> Result[Page]:
    """The latest ``limit`` messages older than ``before`` (if given), oldest first."""
    limit = max(1, min(limit, MAX_PAGE_SIZE))
    async with infra.sql() as session:
        repo = MessageRepository(session, tenant())
        page = await repo.page(before=before, limit=limit)
        if page is None:
            return not_found("message")
        rows, has_more = page
        views = await _views(repo, rows)
    return Ok(Page(messages=views, has_more=has_more))


__all__ = [
    "DEFAULT_PAGE_SIZE",
    "MAX_MESSAGE_LENGTH",
    "MAX_PAGE_SIZE",
    "Handled",
    "MessageView",
    "Page",
    "clarify",
    "list_messages",
    "reanswer",
    "reroute",
    "send",
]
