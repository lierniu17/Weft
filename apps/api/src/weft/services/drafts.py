"""Drafts (草稿): extraction job, edits, confirmation, discard, retry (AC-6, AC-10..AC-19)."""

from __future__ import annotations

import logging
import uuid
from dataclasses import dataclass

from neo4j.exceptions import ConstraintError

from weft.domain.confidence import Confidence, ConflictAction, resolve_conflict
from weft.domain.dates import PartialDate
from weft.domain.draft import (
    Candidate,
    Draft,
    DraftFact,
    DraftPerson,
    DraftProfileItem,
    DraftRelationship,
    DraftRelationshipType,
    DraftStatus,
    FactConflict,
    PersonMatch,
)
from weft.domain.graph_write import (
    OPINION,
    PREDICATE_TARGETS,
    SINGLE_VALUED,
    AliasAdd,
    EpisodeWrite,
    FactInvalidated,
    FactRestated,
    GraphWrite,
    IdentitySet,
    NewFact,
    NewFeeling,
    NewPerson,
    RelationshipUpsert,
    fact_sentence,
)
from weft.domain.taxonomy import OTHER, Category, RelationshipType, Taxonomy
from weft.extraction.matching import MatchDecision, match_person
from weft.extraction.pipeline import ExtractionInput, RawExtraction, extract
from weft.infra import Infra
from weft.repositories.entries import DraftRepository, EntryRepository
from weft.repositories.graph import GraphRepository
from weft.repositories.records import (
    DraftRecord,
    EntryRecord,
    FactRecord,
    PersonRecord,
    RelationshipRecord,
    RelationshipTypeRecord,
)
from weft.services import embeddings
from weft.services._uow import graph, tenant
from weft.services.results import Err, Ok, Result, not_found
from weft.services.taxonomy import taxonomy_in

logger = logging.getLogger(__name__)

SELF_ID = "self"  # how a Draft refers to Self (spec 「录入与草稿流程」 补充约定)
EXTRACTION_FAILED = "抽取失败，请重试"

NOT_PENDING = "not_pending"


def _not_pending(status: DraftStatus) -> Err:
    return Err(NOT_PENDING, f"draft is {status.value}", {"status": status.value})


# --- reading ---------------------------------------------------------------------


async def get_draft(infra: Infra, draft_id: uuid.UUID) -> Result[DraftRecord]:
    async with infra.sql() as session:
        draft = await DraftRepository(session, tenant()).get(draft_id)
    return not_found("draft") if draft is None else Ok(draft)


# --- extraction ------------------------------------------------------------------


def _describe(exc: BaseException) -> str:
    detail = str(exc).strip().splitlines()[0] if str(exc).strip() else ""
    return f"{EXTRACTION_FAILED}（{type(exc).__name__}{': ' + detail[:300] if detail else ''}）"


async def run_extraction(infra: Infra, draft_id: uuid.UUID) -> Result[DraftRecord]:
    """Extract an 抽取中 Draft: 待确认 on success, 抽取失败 on any LLM failure (AC-6, AC-18).

    The Entry text is never touched, so a failed extraction can be retried.
    """
    scope = tenant()
    async with infra.sql() as session:
        drafts = DraftRepository(session, scope)
        draft = await drafts.get(draft_id)
        if draft is None:
            return not_found("draft")
        if draft.status is not DraftStatus.EXTRACTING:
            return Err("not_extracting", f"draft is {draft.status.value}")
        entry = await EntryRepository(session, scope).get(draft.entry_id)
        taxonomy = await taxonomy_in(session)
    assert entry is not None  # drafts cascade with their entry

    try:
        content = await draft_for(infra, entry, taxonomy)
    except Exception as exc:  # any provider / parsing failure -> 抽取失败 (AC-18)
        logger.warning("extraction of draft %s failed: %r", draft_id, exc)
        async with infra.sql.begin() as session:
            failed = await DraftRepository(session, scope).transition(
                draft_id,
                from_statuses=[DraftStatus.EXTRACTING],
                to=DraftStatus.FAILED,
                error=_describe(exc),
            )
        return await _current_or(infra, draft_id, failed)

    async with infra.sql.begin() as session:
        pending = await DraftRepository(session, scope).transition(
            draft_id,
            from_statuses=[DraftStatus.EXTRACTING],
            to=DraftStatus.PENDING,
            content=content,
        )
    return await _current_or(infra, draft_id, pending)


async def draft_for(infra: Infra, entry: EntryRecord, taxonomy: Taxonomy) -> Draft:
    """Extract ``entry`` against the session's graph into Draft content (writes nothing).

    The whole extraction step of a Draft; also what the extraction quality eval runs.
    Raises on any LLM failure.
    """
    g = graph(infra)
    persons = await g.list_persons()
    raw = await extract(
        infra.llm,
        ExtractionInput(
            text=entry.text, occurred=entry.occurred, group_id=g.tenant.group_id, taxonomy=taxonomy
        ),
    )
    return await _draft_from(infra, g, raw, entry, persons)


async def _current_or(
    infra: Infra, draft_id: uuid.UUID, record: DraftRecord | None
) -> Result[DraftRecord]:
    """The transition's result, or the draft as it is now (e.g. discarded meanwhile)."""
    return Ok(record) if record is not None else await get_draft(infra, draft_id)


async def retry_extraction(infra: Infra, draft_id: uuid.UUID) -> Result[DraftRecord]:
    """抽取失败 -> 抽取中; the caller then runs ``run_extraction`` again (AC-18)."""
    async with infra.sql.begin() as session:
        drafts = DraftRepository(session, tenant())
        moved = await drafts.transition(
            draft_id, from_statuses=[DraftStatus.FAILED], to=DraftStatus.EXTRACTING
        )
        if moved is not None:
            return Ok(moved)
        current = await drafts.get(draft_id)
    if current is None:
        return not_found("draft")
    return Err("not_failed", f"draft is {current.status.value}", {"status": current.status.value})


async def _draft_from(
    infra: Infra,
    g: GraphRepository,
    raw: RawExtraction,
    entry: EntryRecord,
    persons: list[PersonRecord],
) -> Draft:
    draft_persons: list[DraftPerson] = []
    matched_ids: dict[str, str] = {}  # mention -> graph person id
    for i, mention in enumerate(raw.persons, start=1):
        result = await match_person(infra.llm, mention=mention, text=entry.text, persons=persons)
        pid = f"p{i}"
        if result.decision is MatchDecision.MATCHED and result.person is not None:
            person = result.person
            matched_ids[mention] = person.id
            draft_persons.append(
                DraftPerson(
                    id=pid,
                    mention=mention,
                    match=PersonMatch.MATCHED,
                    person_id=SELF_ID if person.is_self else person.id,
                    name=person.name,
                    note=person.note,
                )
            )
        elif result.decision is MatchDecision.AMBIGUOUS:
            draft_persons.append(
                DraftPerson(
                    id=pid,
                    mention=mention,
                    match=PersonMatch.AMBIGUOUS,
                    candidates=[
                        Candidate(person_id=c.id, name=c.name, note=c.note)
                        for c in result.candidates
                    ],
                )
            )
        else:
            draft_persons.append(DraftPerson(id=pid, mention=mention, match=PersonMatch.NEW))

    existing = await g.facts_of(sorted(set(matched_ids.values())))
    facts: list[DraftFact] = []
    for i, f in enumerate(raw.facts, start=1):
        conflict: FactConflict | None = None
        subject_id = matched_ids.get(f.subject)
        if subject_id is not None and f.predicate in SINGLE_VALUED:
            current = _current_values(existing, subject_id, f.predicate)
            if current and all(c.object != f.object for c in current):
                old = current[-1]
                action = resolve_conflict(old=_strongest(current), new=f.confidence)
                conflict = FactConflict(old=old.object, action=action)
        facts.append(
            DraftFact(
                id=f"f{i}",
                subject=f.subject,
                predicate=f.predicate,
                object=f.object,
                valid_at=f.valid_at,
                valid_to=f.valid_to,
                confidence=f.confidence,
                conflict=conflict,
            )
        )

    relationships = [
        DraftRelationship(
            id=f"r{i}",
            pair=r.pair,
            types=[
                DraftRelationshipType(category=t.category, subtype=t.subtype, original=t.original)
                for t in r.types
            ],
            met_at=r.met_at,
            origin=r.origin,
            introduced_by=r.introduced_by,
            status=r.status,
            confidence=r.confidence,
        )
        for i, r in enumerate(raw.relationships, start=1)
    ]
    feelings = [
        {
            "id": f"e{i}",
            "from": fe.from_,
            "to": fe.to,
            "dimension": fe.dimension,
            "level": fe.level,
            "confidence": fe.confidence,
        }
        for i, fe in enumerate(raw.feelings, start=1)
    ]
    profile = [
        DraftProfileItem(
            id=f"i{i}", person=p.person, field=p.field, value=p.value, confidence=p.confidence
        )
        for i, p in enumerate(raw.profile, start=1)
    ]
    return Draft.model_validate(
        {
            "persons": draft_persons,
            "facts": facts,
            "relationships": relationships,
            "feelings": feelings,
            "profile": profile,
        }
    )


def _current_values(facts: list[FactRecord], subject_id: str, predicate: str) -> list[FactRecord]:
    return [
        f for f in facts if f.subject_id == subject_id and f.predicate == predicate and f.current
    ]


def _strongest(facts: list[FactRecord]) -> Confidence:
    return max((f.confidence for f in facts), key=lambda c: c.rank)


# --- editing ---------------------------------------------------------------------


async def update_draft(infra: Infra, draft_id: uuid.UUID, content: Draft) -> Result[DraftRecord]:
    """Replace a 待确认 Draft's items with the user's edited version (AC-11, AC-12)."""
    scope = tenant()
    async with infra.sql() as session, session.begin():
        drafts = DraftRepository(session, scope)
        current = await drafts.get(draft_id)
        if current is None:
            return not_found("draft")
        if current.status is not DraftStatus.PENDING:
            return _not_pending(current.status)
        problem = _check_types(content, await taxonomy_in(session))
        if problem is not None:
            return problem
        problem = await _check_persons(graph(infra, scope), content)
        if problem is not None:
            return problem
        updated = await drafts.transition(
            draft_id, from_statuses=[DraftStatus.PENDING], to=DraftStatus.PENDING, content=content
        )
    return _not_pending(current.status) if updated is None else Ok(updated)


def _check_types(content: Draft, taxonomy: Taxonomy) -> Err | None:
    unknown = [
        f"{t.category.value}/{t.subtype}"
        for r in content.relationships
        for t in r.types
        if not taxonomy.contains(t.category, t.subtype)
    ]
    if unknown:
        return Err(
            "unknown_relationship_type",
            "关系类型不在词表中",
            {"types": unknown},
        )
    return None


async def _check_persons(g: GraphRepository, content: Draft) -> Err | None:
    """Every person a Draft names must be a person of this tenant (or Self)."""
    referenced = {p.person_id for p in content.persons if p.person_id and p.person_id != SELF_ID}
    referenced |= {
        c.person_id for p in content.persons for c in (p.candidates or []) if c.person_id
    }
    known = {p.id for p in await g.list_persons()}
    unknown = sorted(referenced - known)
    if unknown:
        return Err("unknown_person", "草稿里引用了不存在的人物", {"person_ids": unknown})
    return None


# --- confirmation ----------------------------------------------------------------


@dataclass
class _State:
    self_person: PersonRecord
    persons: dict[str, PersonRecord]
    facts: list[FactRecord]
    relationships: dict[frozenset[str], RelationshipRecord]


async def confirm_draft(infra: Infra, draft_id: uuid.UUID) -> Result[DraftRecord]:
    """Write the Draft into the graph, then mark it 已确认 (spec step 4, ADR-0003).

    Idempotent by Draft id: confirming twice writes once and returns the confirmed Draft.
    If the graph write fails the Draft stays 待确认 and can be confirmed again (AC-19).
    """
    scope = tenant()
    async with infra.sql() as session:
        draft = await DraftRepository(session, scope).get(draft_id)
        if draft is None:
            return not_found("draft")
        if draft.status is DraftStatus.CONFIRMED:
            return Ok(draft)
        if draft.status is not DraftStatus.PENDING or draft.content is None:
            return _not_pending(draft.status)
        entry = await EntryRepository(session, scope).get(draft.entry_id)
    assert entry is not None
    content = draft.content
    pending = content.ambiguous_mentions()
    if pending:
        return Err("ambiguous_persons", "请先为这些人物选择对应的人", {"mentions": pending})

    g = graph(infra, scope)
    planned = await _plan(g, entry, content, infra)
    if isinstance(planned, Err):
        return planned
    planned = await embeddings.attach(infra, planned)
    try:
        await g.apply(planned)
    except ConstraintError:
        logger.info("draft %s: episode already written by a concurrent confirmation", draft_id)
    except Exception as exc:  # the transaction rolled back: nothing was written (AC-19)
        logger.warning("graph write for draft %s failed: %r", draft_id, exc)
        return Err("graph_write_failed", "写入图谱失败，请重新确认")

    async with infra.sql.begin() as session:
        drafts = DraftRepository(session, scope)
        confirmed = await drafts.transition(
            draft_id,
            from_statuses=[DraftStatus.PENDING],
            to=DraftStatus.CONFIRMED,
            now=infra.clock(),
        )
        if confirmed is not None:
            return Ok(confirmed)
        now = await drafts.get(draft_id)
    if now is not None and now.status is DraftStatus.CONFIRMED:
        return Ok(now)
    return _not_pending(now.status if now else DraftStatus.DISCARDED)


async def _plan(
    g: GraphRepository, entry: EntryRecord, content: Draft, infra: Infra
) -> GraphWrite | Err:
    self_person = await g.get_self()
    assert self_person is not None, "every account has Self"
    persons = {p.id: p for p in await g.list_persons()}
    ids: dict[str, str] = {}
    write = GraphWrite(
        episode=EpisodeWrite(
            entry_id=str(entry.id),
            content=entry.text,
            occurred=entry.occurred,
            kind=entry.kind,
            created_at=infra.clock(),
        )
    )

    referenced = _referenced_mentions(content)
    for p in content.persons:
        if p.match is PersonMatch.NEW:
            if p.mention not in referenced:
                # every item about this new person was removed in review (e.g. 老张的女儿 in
                # BOT-2): nothing left to say about them, so they are not created at all
                continue
            pid = str(uuid.uuid4())
            write.persons.append(NewPerson(id=pid, name=p.mention))
            ids[p.mention] = pid
            continue
        pid = self_person.id if p.person_id == SELF_ID else (p.person_id or "")
        known = persons.get(pid)
        if known is None:
            return Err("unknown_person", "草稿里引用了不存在的人物", {"person_ids": [pid]})
        ids[p.mention] = pid
        if not known.is_self and p.mention != known.name and p.mention not in known.aliases:
            write.aliases.append(AliasAdd(person_id=pid, alias=p.mention))  # AC-13
    write.mentions.extend(dict.fromkeys(ids.values()))

    state = _State(
        self_person=self_person,
        persons=persons,
        facts=await g.facts_of(sorted(set(ids.values()))),
        relationships=await g.relationships_between(
            [(ids[r.pair[0]], ids[r.pair[1]]) for r in content.relationships]
        ),
    )
    names = {pid: persons[pid].name if pid in persons else m for m, pid in ids.items()}

    for f in content.facts:
        _plan_fact(write, state, f, ids, names, entry.occurred)

    for r in content.relationships:
        _plan_relationship(write, state, r, ids)

    for fe in content.feelings:
        write.feelings.append(
            NewFeeling(
                id=str(uuid.uuid4()),
                from_id=ids[fe.from_],
                to_id=ids[fe.to],
                dimension=fe.dimension,
                level=fe.level.value,
                confidence=fe.confidence,
                occurred_at=entry.occurred,
            )
        )

    for item in content.profile:
        write.identity.append(
            IdentitySet(
                person_id=ids[item.person],
                field=item.field.value,
                value=item.value,
                confidence=item.confidence,
            )
        )
    return write


def _referenced_mentions(content: Draft) -> set[str]:
    """Every mention some remaining item of the Draft is about (or points to)."""
    referenced: set[str] = set()
    for f in content.facts:
        referenced.add(f.subject)
        if f.predicate.strip().upper() not in PREDICATE_TARGETS:
            referenced.add(f.object)  # a fact whose object is another person
    for r in content.relationships:
        referenced.update(r.pair)
        if r.introduced_by:
            referenced.add(r.introduced_by)
    for fe in content.feelings:
        referenced.update((fe.from_, fe.to))
    referenced.update(item.person for item in content.profile)
    return referenced


def _plan_fact(
    write: GraphWrite,
    state: _State,
    f: DraftFact,
    ids: dict[str, str],
    names: dict[str, str],
    occurred: PartialDate,
) -> None:
    subject_id = ids[f.subject]
    predicate = f.predicate.strip().upper()
    if predicate == OPINION:  # 评价: Self -> person, kept apart from facts (AC-23)
        write.facts.append(
            NewFact(
                id=str(uuid.uuid4()),
                subject_id=state.self_person.id,
                object_person_id=subject_id,
                predicate=OPINION,
                object=f.object,
                fact=fact_sentence(names[subject_id], OPINION, f.object),
                confidence=f.confidence,
                valid_at=f.valid_at,
                kind="opinion",
            )
        )
        return

    same = [
        x
        for x in state.facts
        if x.subject_id == subject_id
        and x.predicate == predicate
        and x.object == f.object
        and x.invalid_at is None
    ]
    if same:  # the same fact again: one more source, no duplicate
        write.restated.append(FactRestated(fact_id=same[0].id, confidence=f.confidence))
        return

    unverified = False
    if predicate in SINGLE_VALUED:  # conflict rule (spec step 5, AC-14 / AC-15)
        current = _current_values(state.facts, subject_id, predicate)
        if current:
            action = resolve_conflict(old=_strongest(current), new=f.confidence)
            if action is ConflictAction.UPDATE:
                until = f.valid_at or occurred
                write.invalidations.extend(
                    FactInvalidated(fact_id=c.id, invalid_at=until) for c in current
                )
            else:
                unverified = True

    object_person_id = ids.get(f.object) if predicate not in PREDICATE_TARGETS else None
    write.facts.append(
        NewFact(
            id=str(uuid.uuid4()),
            subject_id=subject_id,
            predicate=predicate,
            object=f.object,
            fact=fact_sentence(names[subject_id], predicate, f.object),
            confidence=f.confidence,
            object_label=PREDICATE_TARGETS.get(predicate),
            object_person_id=object_person_id,
            valid_at=f.valid_at,
            invalid_at=f.valid_to,
            unverified=unverified,
        )
    )


def _plan_relationship(
    write: GraphWrite, state: _State, r: DraftRelationship, ids: dict[str, str]
) -> None:
    a, b = ids[r.pair[0]], ids[r.pair[1]]
    key = frozenset((a, b))
    old = state.relationships.get(key)
    new_types = [RelationshipType(t.category, t.subtype, t.original) for t in r.types]
    if old is None:
        types = new_types
        upsert = RelationshipUpsert(
            id=str(uuid.uuid4()),
            person_a=a,
            person_b=b,
            types=tuple(_dedupe_types(types)),
            confidence=r.confidence,
            met_at=r.met_at,
            origin=r.origin,
            introduced_by_id=ids.get(r.introduced_by) if r.introduced_by else None,
            status=r.status.value if r.status else None,
        )
    else:
        merged = [RelationshipType(Category(t.category), t.subtype, t.original) for t in old.types]
        upsert = RelationshipUpsert(
            id=old.id,
            person_a=old.person_a,
            person_b=old.person_b,
            types=tuple(_dedupe_types([*merged, *new_types])),
            confidence=r.confidence if r.confidence.rank >= old.confidence.rank else old.confidence,
            met_at=r.met_at or old.met_at,
            origin=r.origin or old.origin,
            introduced_by_id=(
                ids.get(r.introduced_by)
                if r.introduced_by
                else (old.introduced_by.id if old.introduced_by else None)
            ),
            status=r.status.value if r.status else old.status,
            summary=old.summary,
            exists=True,
        )
    # keep the merged state for a second item about the same pair in this Draft
    write.relationships[:] = [
        u for u in write.relationships if frozenset((u.person_a, u.person_b)) != key
    ]
    write.relationships.append(upsert)
    state.relationships[key] = _as_record(upsert, state)


def _as_record(upsert: RelationshipUpsert, state: _State) -> RelationshipRecord:
    return RelationshipRecord(
        id=upsert.id,
        person_a=upsert.person_a,
        person_b=upsert.person_b,
        types=[
            RelationshipTypeRecord(t.category.value, t.subtype, t.original) for t in upsert.types
        ],
        met_at=upsert.met_at,
        origin=upsert.origin,
        introduced_by=state.persons.get(upsert.introduced_by_id or ""),
        status=upsert.status,
        summary=upsert.summary,
        confidence=upsert.confidence,
        sources=(),
    )


def _dedupe_types(types: list[RelationshipType]) -> list[RelationshipType]:
    seen: set[tuple[str, str, str]] = set()
    out: list[RelationshipType] = []
    for t in types:
        key = (t.category.value, t.subtype, t.original if t.subtype == OTHER else "")
        if key in seen:
            continue
        seen.add(key)
        out.append(t)
    return out


# --- discard ---------------------------------------------------------------------


async def discard_draft(infra: Infra, draft_id: uuid.UUID) -> Result[DraftRecord]:
    """放弃: the graph is untouched, the Entry stays, marked 已放弃 (AC-17)."""
    async with infra.sql.begin() as session:
        drafts = DraftRepository(session, tenant())
        moved = await drafts.transition(
            draft_id,
            from_statuses=[DraftStatus.EXTRACTING, DraftStatus.PENDING, DraftStatus.FAILED],
            to=DraftStatus.DISCARDED,
        )
        if moved is not None:
            return Ok(moved)
        current = await drafts.get(draft_id)
    if current is None:
        return not_found("draft")
    if current.status is DraftStatus.DISCARDED:
        return Ok(current)
    return _not_pending(current.status)


__all__ = [
    "SELF_ID",
    "confirm_draft",
    "discard_draft",
    "draft_for",
    "get_draft",
    "retry_extraction",
    "run_extraction",
    "update_draft",
]
