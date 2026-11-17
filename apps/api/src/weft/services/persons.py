"""Persons (人物): list and find, profile, direct edits (AC-26), deletion (AC-27),
and the pair view / edit of two persons' Relationship and Feelings (AC-30)."""

from __future__ import annotations

import dataclasses
import uuid
from dataclasses import dataclass, field

from weft.domain.confidence import Confidence
from weft.domain.dates import PartialDate
from weft.domain.draft import FEELING_DIMENSION_LABELS, FEELING_LEVEL_LABELS, ProfileField
from weft.domain.graph_write import (
    OPINION,
    PREDICATE_LABELS,
    PREDICATE_TARGETS,
    EpisodeWrite,
    FactDeleted,
    GraphWrite,
    IdentitySet,
    NewFact,
    NewFeeling,
    RelationshipUpsert,
    fact_sentence,
)
from weft.domain.taxonomy import Category, RelationshipType
from weft.infra import Infra
from weft.repositories.entries import EntryRepository
from weft.repositories.records import EntryRecord, PairRecord, PersonRecord, ProfileRecord
from weft.services._uow import graph, tenant
from weft.services.results import Err, Ok, Result, not_found
from weft.services.taxonomy import taxonomy_in

FIELD_LABELS = {"name": "姓名", "gender": "性别", "birthday": "生日", "hometown": "籍贯"}
MANUAL = Confidence.WITNESSED  # a manual edit is 亲历 (AC-26)


def _matches(person: PersonRecord, query: str) -> bool:
    return query in person.name or any(query in alias for alias in person.aliases)


async def list_persons(infra: Infra, query: str | None = None) -> list[PersonRecord]:
    """Every person, Self first; ``query`` keeps those whose name or any alias contains it."""
    people = await graph(infra).list_persons()
    q = (query or "").strip()
    return [p for p in people if _matches(p, q)] if q else people


async def get_self(infra: Infra) -> PersonRecord:
    me = await graph(infra).get_self()
    assert me is not None, "every account has Self"
    return me


async def get_profile(infra: Infra, person_id: str) -> Result[ProfileRecord]:
    profile = await graph(infra).get_profile(person_id)
    return not_found("person") if profile is None else Ok(profile)


# --- direct edits (AC-26) ------------------------------------------------------------


@dataclass(frozen=True)
class SetIdentity:
    field: ProfileField
    value: str


@dataclass(frozen=True)
class AddFact:
    predicate: str
    object: str
    valid_at: PartialDate | None = None


@dataclass(frozen=True)
class UpdateFact:
    fact_id: str
    object: str


@dataclass(frozen=True)
class DeleteFact:
    fact_id: str


ProfileEdit = SetIdentity | AddFact | UpdateFact | DeleteFact


@dataclass
class _ManualOps:
    identity: list[IdentitySet] = field(default_factory=list)
    facts: list[NewFact] = field(default_factory=list)
    deletions: list[FactDeleted] = field(default_factory=list)
    relationships: list[RelationshipUpsert] = field(default_factory=list)
    feelings: list[NewFeeling] = field(default_factory=list)


@dataclass(frozen=True)
class Edited[T]:
    value: T
    entry: EntryRecord  # the 手动编辑记录 now backing the change


def _label(predicate: str) -> str:
    return PREDICATE_LABELS.get(predicate, predicate)


async def edit_profile(
    infra: Infra, person_id: str, edit: ProfileEdit
) -> Result[Edited[ProfileRecord]]:
    """Apply one direct edit; a 手动编辑记录 (亲历) becomes its source (AC-26, AC-28)."""
    g = graph(infra)
    person = await g.get_person(person_id)
    if person is None:
        return not_found("person")
    new_fact_id = str(uuid.uuid4())

    match edit:
        case SetIdentity(field=f, value=value):
            value = value.strip()
            if not value:
                return Err("invalid_edit", "内容不能为空")
            text = f"手动编辑：将{person.name}的{FIELD_LABELS[f.value]}设为「{value}」"
            ops = _ManualOps(identity=[IdentitySet(person.id, f.value, value, MANUAL)])
        case AddFact(predicate=predicate, object=obj, valid_at=valid_at):
            predicate, obj = predicate.strip().upper(), obj.strip()
            if not obj or predicate not in {*PREDICATE_TARGETS, OPINION}:
                return Err("invalid_edit", "不支持的信息类型或内容为空")
            text = f"手动编辑：为{person.name}添加{_label(predicate)}「{obj}」"
            ops = _ManualOps(facts=[_manual_fact(new_fact_id, person, predicate, obj, valid_at)])
        case DeleteFact(fact_id=fact_id):
            fact = await g.get_fact(fact_id)
            if fact is None or fact.subject_id != person.id:
                return not_found("fact")
            text = f"手动编辑：删除{person.name}的{_label(fact.predicate)}「{fact.object}」"
            ops = _ManualOps(deletions=[FactDeleted(fact.id)])
        case UpdateFact(fact_id=fact_id, object=obj):
            fact = await g.get_fact(fact_id)
            if fact is None or fact.subject_id != person.id:
                return not_found("fact")
            obj = obj.strip()
            if not obj:
                return Err("invalid_edit", "内容不能为空")
            text = (
                f"手动编辑：将{person.name}的{_label(fact.predicate)}「{fact.object}」改为「{obj}」"
            )
            ops = _ManualOps(
                deletions=[FactDeleted(fact.id)],
                facts=[_manual_fact(new_fact_id, person, fact.predicate, obj, fact.valid_at)],
            )

    entry = await _write_manual(infra, text, person_ids=[person.id], ops=ops)
    profile = await g.get_profile(person.id)
    assert profile is not None
    return Ok(Edited(profile, entry))


def _manual_fact(
    fact_id: str,
    person: PersonRecord,
    predicate: str,
    obj: str,
    valid_at: PartialDate | None,
) -> NewFact:
    if predicate == OPINION:
        # subject_id becomes Self in _write_manual (opinions go Self -> person)
        return NewFact(
            id=fact_id,
            subject_id="",
            object_person_id=person.id,
            predicate=OPINION,
            object=obj,
            fact=fact_sentence(person.name, OPINION, obj),
            confidence=MANUAL,
            valid_at=valid_at,
            kind="opinion",
        )
    return NewFact(
        id=fact_id,
        subject_id=person.id,
        predicate=predicate,
        object=obj,
        fact=fact_sentence(person.name, predicate, obj),
        confidence=MANUAL,
        object_label=PREDICATE_TARGETS.get(predicate),
        valid_at=valid_at,
    )


async def _write_manual(
    infra: Infra, text: str, *, person_ids: list[str], ops: _ManualOps
) -> EntryRecord:
    """Store the 手动编辑记录 and apply ``ops`` with it as source; both or neither."""
    scope = tenant()
    g = graph(infra, scope)
    me = await g.get_self()
    assert me is not None
    async with infra.sql() as session, session.begin():
        entry = await EntryRepository(session, scope).create(
            text=text, occurred=PartialDate.from_date(infra.today()), kind="manual_edit"
        )
        facts = [
            dataclasses.replace(f, subject_id=me.id) if f.kind == "opinion" else f
            for f in ops.facts
        ]
        write = GraphWrite(
            episode=EpisodeWrite(
                entry_id=str(entry.id),
                content=text,
                occurred=entry.occurred,
                kind="manual_edit",
                created_at=infra.clock(),
            ),
            identity=ops.identity,
            facts=facts,
            deletions=ops.deletions,
            relationships=ops.relationships,
            feelings=ops.feelings,
            mentions=person_ids,
        )
        await g.apply(write)  # raises -> the entry is rolled back too
    return entry


# --- deletion (AC-27) -----------------------------------------------------------------


@dataclass(frozen=True)
class DeletionImpact:
    entry_count: int  # 有 N 条记录提到他，原文会保留
    can_delete: bool  # False for Self


async def deletion_impact(infra: Infra, person_id: str) -> Result[DeletionImpact]:
    g = graph(infra)
    person = await g.get_person(person_id)
    if person is None:
        return not_found("person")
    count = await g.count_entries_mentioning(person_id)
    return Ok(DeletionImpact(entry_count=count, can_delete=not person.is_self))


async def delete_person(infra: Infra, person_id: str) -> Result[None]:
    """Cascade-delete a person from the graph; Entries stay. Self cannot be deleted."""
    g = graph(infra)
    person = await g.get_person(person_id)
    if person is None:
        return not_found("person")
    if person.is_self:
        return Err("self_undeletable", "不能删除本人")
    await g.delete_person(person_id)
    return Ok(None)


# --- pair: relationship + feelings (AC-30) --------------------------------------------


async def get_pair(infra: Infra, a_id: str, b_id: str) -> Result[PairRecord]:
    pair = await graph(infra).get_pair(a_id, b_id)
    return not_found("person") if pair is None else Ok(pair)


@dataclass(frozen=True)
class FeelingEdit:
    from_id: str
    to_id: str
    dimension: str
    level: str


@dataclass(frozen=True)
class RelationshipEdit:
    types: list[RelationshipType] | None = None
    met_at: PartialDate | None = None
    origin: str | None = None
    status: str | None = None
    summary: str | None = None
    feelings: list[FeelingEdit] = field(default_factory=list)


async def edit_relationship(
    infra: Infra, a_id: str, b_id: str, edit: RelationshipEdit
) -> Result[Edited[PairRecord]]:
    """Edit a pair's Relationship and/or record new Feelings, backed by a 手动编辑记录."""
    g = graph(infra)
    pair = await g.get_pair(a_id, b_id)
    if pair is None:
        return not_found("person")
    ids = {a_id, b_id}
    for fe in edit.feelings:
        if {fe.from_id, fe.to_id} != ids or fe.level not in FEELING_LEVEL_LABELS.get(
            fe.dimension, {}
        ):
            return Err("invalid_edit", "感受的方向或档位不正确")
    if edit.types is not None:
        async with infra.sql() as session:
            taxonomy = await taxonomy_in(session)
        if any(not taxonomy.contains(t.category, t.subtype) for t in edit.types):
            return Err("unknown_relationship_type", "关系类型不在词表中")

    ops = _ManualOps()
    parts: list[str] = []
    old = pair.relationship
    fields = (edit.types, edit.met_at, edit.origin, edit.status, edit.summary)
    if any(v is not None for v in fields):
        old_types = (
            [RelationshipType(Category(t.category), t.subtype, t.original) for t in old.types]
            if old
            else []
        )
        ops.relationships = [
            RelationshipUpsert(
                id=old.id if old else str(uuid.uuid4()),
                person_a=old.person_a if old else a_id,
                person_b=old.person_b if old else b_id,
                types=tuple(edit.types if edit.types is not None else old_types),
                confidence=MANUAL,
                met_at=edit.met_at or (old.met_at if old else None),
                origin=edit.origin if edit.origin is not None else (old.origin if old else None),
                introduced_by_id=old.introduced_by.id if old and old.introduced_by else None,
                status=edit.status if edit.status is not None else (old.status if old else None),
                summary=(
                    edit.summary if edit.summary is not None else (old.summary if old else None)
                ),
                exists=old is not None,
            )
        ]
        parts.append("关系")
    if edit.feelings:
        today = PartialDate.from_date(infra.today())
        ops.feelings = [
            NewFeeling(
                id=str(uuid.uuid4()),
                from_id=fe.from_id,
                to_id=fe.to_id,
                dimension=fe.dimension,
                level=fe.level,
                confidence=MANUAL,
                occurred_at=today,
            )
            for fe in edit.feelings
        ]
        names = {pair.a.id: pair.a.name, pair.b.id: pair.b.name}
        parts += [
            f"{names[fe.from_id]}对{names[fe.to_id]}的{FEELING_DIMENSION_LABELS[fe.dimension]}"
            f"为「{FEELING_LEVEL_LABELS[fe.dimension][fe.level]}」"
            for fe in edit.feelings
        ]
    if not parts:
        return Err("invalid_edit", "没有要修改的内容")
    text = f"手动编辑：{pair.a.name}与{pair.b.name}的" + "、".join(parts)
    entry = await _write_manual(infra, text, person_ids=[a_id, b_id], ops=ops)
    updated = await g.get_pair(a_id, b_id)
    assert updated is not None
    return Ok(Edited(updated, entry))


__all__ = [
    "AddFact",
    "DeleteFact",
    "DeletionImpact",
    "Edited",
    "FeelingEdit",
    "ProfileEdit",
    "RelationshipEdit",
    "SetIdentity",
    "UpdateFact",
    "delete_person",
    "deletion_impact",
    "edit_profile",
    "edit_relationship",
    "get_pair",
    "get_profile",
    "get_self",
    "list_persons",
]
