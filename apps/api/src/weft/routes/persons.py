"""人物 / 关系 / 词表 / 用量 routes."""

from __future__ import annotations

from fastapi import APIRouter, Query, status

from weft.domain.taxonomy import RelationshipType
from weft.domain.taxonomy_contract import TaxonomyResponse
from weft.domain.tenancy import tenant_scope
from weft.routes.deps import InfraDep, SessionDep, unwrap
from weft.routes.schemas import (
    AddFactOp,
    AddSubtypeRequest,
    DeleteFactOp,
    DeletionImpactOut,
    PairEdited,
    PairOut,
    PersonOut,
    ProfileEdited,
    ProfileEditRequest,
    ProfileOut,
    QuotaOut,
    RelationshipEditRequest,
    SetIdentityOp,
    UpdateFactOp,
    UsageOut,
)
from weft.services import persons, taxonomy, usage

router = APIRouter()

NOT_FOUND = {"not_found": 404}
EDIT_ERRORS = {**NOT_FOUND, "invalid_edit": 422, "unknown_relationship_type": 422}


@router.get("/persons", response_model=list[PersonOut], tags=["persons"])
async def list_persons(
    session: SessionDep,
    infra: InfraDep,
    q: str | None = Query(default=None, max_length=50, description="姓名或别名"),
) -> list[PersonOut]:
    with tenant_scope(session.tenant):
        return [PersonOut.of(p) for p in await persons.list_persons(infra, q)]


@router.get("/persons/{person_id}", response_model=ProfileOut, tags=["persons"])
async def get_profile(person_id: str, session: SessionDep, infra: InfraDep) -> ProfileOut:
    with tenant_scope(session.tenant):
        return ProfileOut.of(unwrap(await persons.get_profile(infra, person_id), NOT_FOUND))


def _profile_edit(body: ProfileEditRequest) -> persons.ProfileEdit:
    match body:
        case SetIdentityOp():
            return persons.SetIdentity(body.field, body.value)
        case AddFactOp():
            return persons.AddFact(body.predicate, body.object, body.valid_at)
        case UpdateFactOp():
            return persons.UpdateFact(body.fact_id, body.object)
        case DeleteFactOp():
            return persons.DeleteFact(body.fact_id)


@router.patch("/persons/{person_id}/profile", response_model=ProfileEdited, tags=["persons"])
async def edit_profile(
    person_id: str, body: ProfileEditRequest, session: SessionDep, infra: InfraDep
) -> ProfileEdited:
    with tenant_scope(session.tenant):
        edited = unwrap(
            await persons.edit_profile(infra, person_id, _profile_edit(body)), EDIT_ERRORS
        )
    return ProfileEdited(profile=ProfileOut.of(edited.value), entry_id=edited.entry.id)


@router.get(
    "/persons/{person_id}/deletion-impact", response_model=DeletionImpactOut, tags=["persons"]
)
async def deletion_impact(
    person_id: str, session: SessionDep, infra: InfraDep
) -> DeletionImpactOut:
    with tenant_scope(session.tenant):
        impact = unwrap(await persons.deletion_impact(infra, person_id), NOT_FOUND)
    return DeletionImpactOut(entry_count=impact.entry_count, can_delete=impact.can_delete)


@router.delete("/persons/{person_id}", status_code=status.HTTP_204_NO_CONTENT, tags=["persons"])
async def delete_person(person_id: str, session: SessionDep, infra: InfraDep) -> None:
    with tenant_scope(session.tenant):
        unwrap(
            await persons.delete_person(infra, person_id),
            {**NOT_FOUND, "self_undeletable": 409},
        )


@router.get(
    "/persons/{person_id}/relationships/{other_id}", response_model=PairOut, tags=["relationships"]
)
async def get_pair(person_id: str, other_id: str, session: SessionDep, infra: InfraDep) -> PairOut:
    with tenant_scope(session.tenant):
        return PairOut.of(unwrap(await persons.get_pair(infra, person_id, other_id), NOT_FOUND))


@router.patch(
    "/persons/{person_id}/relationships/{other_id}",
    response_model=PairEdited,
    tags=["relationships"],
)
async def edit_pair(
    person_id: str,
    other_id: str,
    body: RelationshipEditRequest,
    session: SessionDep,
    infra: InfraDep,
) -> PairEdited:
    ends = {"a_to_b": (person_id, other_id), "b_to_a": (other_id, person_id)}
    edit = persons.RelationshipEdit(
        types=None
        if body.types is None
        else [RelationshipType(t.category, t.subtype, t.original) for t in body.types],
        met_at=body.met_at,
        origin=body.origin,
        status=None if body.status is None else body.status.value,
        summary=body.summary,
        feelings=[
            persons.FeelingEdit(*ends[f.direction], dimension=f.dimension, level=f.level)
            for f in body.feelings
        ],
    )
    with tenant_scope(session.tenant):
        edited = unwrap(
            await persons.edit_relationship(infra, person_id, other_id, edit), EDIT_ERRORS
        )
    return PairEdited(pair=PairOut.of(edited.value), entry_id=edited.entry.id)


@router.get("/taxonomy", response_model=TaxonomyResponse, tags=["taxonomy"])
async def get_taxonomy(session: SessionDep, infra: InfraDep) -> TaxonomyResponse:
    with tenant_scope(session.tenant):
        return TaxonomyResponse.of(await taxonomy.get_taxonomy(infra))


@router.post(
    "/taxonomy/subtypes",
    status_code=status.HTTP_201_CREATED,
    response_model=TaxonomyResponse,
    tags=["taxonomy"],
)
async def add_subtype(
    body: AddSubtypeRequest, session: SessionDep, infra: InfraDep
) -> TaxonomyResponse:
    with tenant_scope(session.tenant):
        result = await taxonomy.add_custom_subtype(infra, category=body.category, name=body.name)
    return TaxonomyResponse.of(unwrap(result, {"subtype_exists": 409, "invalid_subtype": 422}))


@router.get("/usage", response_model=UsageOut, tags=["usage"])
async def get_usage(session: SessionDep, infra: InfraDep) -> UsageOut:
    with tenant_scope(session.tenant):
        report = await usage.today(infra)
    return UsageOut(
        entry=QuotaOut.of(report.entry),
        ask=QuotaOut.of(report.ask),
        resets_at=report.entry.resets_at,
    )
