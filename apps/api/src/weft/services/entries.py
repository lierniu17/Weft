"""Entries (记录): submit (AC-6, AC-7, AC-40), list (AC-9), detail."""

from __future__ import annotations

import uuid
from dataclasses import dataclass

from weft.domain.dates import FutureDateError, PartialDate
from weft.domain.quota import LIMIT_REACHED_MESSAGE, QuotaKind, beijing_day, next_reset
from weft.infra import Infra
from weft.repositories.entries import DraftRepository, EntryRepository
from weft.repositories.records import DraftRecord, EntryRecord, FactRecord, PersonRecord
from weft.repositories.usage import UsageRepository
from weft.services._uow import graph, tenant
from weft.services.results import Err, Ok, Result, not_found
from weft.services.usage import limit_for

MAX_ENTRY_LENGTH = 5000


@dataclass(frozen=True)
class Submitted:
    entry: EntryRecord
    draft: DraftRecord


@dataclass(frozen=True)
class LearnedAlias:
    alias: str
    person_id: str
    name: str


@dataclass(frozen=True)
class EntryDetail:
    entry: EntryRecord
    draft: DraftRecord | None
    persons: list[PersonRecord]  # what the confirmed Entry put in the graph
    facts: list[FactRecord]
    learned_aliases: list[LearnedAlias]  # only those this Entry's confirmation added (AC-13)


async def submit_entry(
    infra: Infra, *, text: str, occurred: PartialDate | None, dated_from_text: bool = False
) -> Result[Submitted]:
    """Store the Entry and an 抽取中 Draft and count one entry against today's quota.

    Extraction itself runs afterwards (``drafts.run_extraction``), as a background job.
    ``dated_from_text``: the occurred date was read from the text itself (a message), so
    the text's relative times are relative to today; the Entry remembers today for that.
    """
    body = text.strip()
    if not body:
        return Err("blank_text", "记录内容不能为空")
    if len(body) > MAX_ENTRY_LENGTH:
        return Err("text_too_long", f"记录不能超过 {MAX_ENTRY_LENGTH} 字")
    today = infra.today()
    occurred = occurred or PartialDate.from_date(today)
    try:
        occurred.ensure_not_future(today=today)
    except FutureDateError:
        return Err("future_date", "发生日期不能晚于今天")

    now = infra.clock()
    scope = tenant()
    async with infra.sql() as session, session.begin():
        quota = UsageRepository(session, scope)
        kind = QuotaKind.ENTRY
        if not await quota.increment_if_below(kind, beijing_day(now), limit=limit_for(infra, kind)):
            return Err(
                "quota_exceeded",
                LIMIT_REACHED_MESSAGE,
                {"kind": kind.value, "resets_at": next_reset(now).isoformat()},
            )
        entry = await EntryRepository(session, scope).create(
            text=body, occurred=occurred, kind="user", written_on=today if dated_from_text else None
        )
        draft = await DraftRepository(session, scope).create_extracting(entry.id)
    return Ok(Submitted(entry=entry, draft=draft))


async def list_entries(infra: Infra) -> list[tuple[EntryRecord, DraftRecord | None]]:
    async with infra.sql() as session:
        return await EntryRepository(session, tenant()).list_with_drafts()


async def get_entry(infra: Infra, entry_id: uuid.UUID) -> Result[EntryDetail]:
    scope = tenant()
    async with infra.sql() as session:
        entry = await EntryRepository(session, scope).get(entry_id)
        if entry is None:
            return not_found("entry")
        draft = await DraftRepository(session, scope).get_by_entry(entry_id)
    g = graph(infra)
    persons, facts = await g.produced_by(str(entry_id))
    learned = [
        LearnedAlias(alias=alias, person_id=p.id, name=p.name)
        for alias, p in await g.learned_aliases(str(entry_id))
    ]
    return Ok(
        EntryDetail(entry=entry, draft=draft, persons=persons, facts=facts, learned_aliases=learned)
    )


__all__ = ["EntryDetail", "LearnedAlias", "Submitted", "get_entry", "list_entries", "submit_entry"]
