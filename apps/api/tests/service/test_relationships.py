"""Relationships and Feelings: types into the vocabulary (AC-31), custom subtypes (AC-32),
two-direction feelings with history (AC-30)."""

from __future__ import annotations

from typing import Any

import pytest

from tests.support import scenarios as sc
from tests.support.graph import Seed, pair_of, seed
from tests.support.llm_script import LLMScript
from tests.support.users import new_user
from weft.domain.confidence import Confidence
from weft.domain.dates import PartialDate
from weft.domain.draft import Draft
from weft.domain.feelings import by_direction
from weft.domain.taxonomy import Category
from weft.domain.tenancy import tenant_scope
from weft.infra import Infra
from weft.services import drafts, persons, taxonomy
from weft.services.results import Err, Ok

pytestmark = pytest.mark.service


def types_of(content: Draft | None) -> list[tuple[str, str, str]]:
    assert content is not None
    return [(t.category.value, t.subtype, t.original) for t in content.relationships[0].types]


# --- AC-31 ---------------------------------------------------------------------------


async def test_types_are_classified_into_the_vocabulary_keeping_the_original_wording(
    infra: Infra, llm: LLMScript
) -> None:
    sc.laowang_types(llm)
    user = await new_user(infra)
    draft = await sc.extracted(infra, user, sc.LAOWANG)

    expected = [
        ("social", "朋友", "铁哥们"),
        ("interest", "合伙人", "公司的合伙人"),
        ("social", "其他", "饭搭子"),
    ]
    assert types_of(draft.content) == expected
    await sc.confirmed(infra, user, draft.id)
    pair = await pair_of(infra, user, "小明", "老王")
    assert pair.relationship is not None
    assert [(t.category, t.subtype, t.original) for t in pair.relationship.types] == expected


# --- AC-32 ---------------------------------------------------------------------------


async def test_a_custom_subtype_is_listed_only_for_its_user(infra: Infra) -> None:
    a, b = await new_user(infra), await new_user(infra)
    with tenant_scope(a.tenant):
        added = await taxonomy.add_custom_subtype(infra, category=Category.SOCIAL, name="球友")
        assert isinstance(added, Ok)
        mine = (await taxonomy.get_taxonomy(infra)).options()[Category.SOCIAL]
    with tenant_scope(b.tenant):
        theirs = (await taxonomy.get_taxonomy(infra)).options()[Category.SOCIAL]
    assert "球友" in mine and mine[-1] == "其他"
    assert "球友" not in theirs


@pytest.mark.parametrize(
    ("name", "reason"), [("朋友", "subtype_exists"), ("  ", "invalid_subtype")]
)
async def test_a_custom_subtype_must_be_new_and_non_empty(
    infra: Infra, name: str, reason: str
) -> None:
    user = await new_user(infra)
    with tenant_scope(user.tenant):
        result = await taxonomy.add_custom_subtype(infra, category=Category.SOCIAL, name=name)
    assert isinstance(result, Err) and result.reason == reason


async def test_the_same_custom_subtype_cannot_be_added_twice(infra: Infra) -> None:
    user = await new_user(infra)
    with tenant_scope(user.tenant):
        await taxonomy.add_custom_subtype(infra, category=Category.SOCIAL, name="球友")
        again = await taxonomy.add_custom_subtype(infra, category=Category.KIN, name="球友")
    assert isinstance(again, Err) and again.reason == "subtype_exists"


async def test_custom_subtypes_take_part_in_extraction_for_their_user_only(
    infra: Infra, llm: LLMScript
) -> None:
    sc.ball_game(llm)
    sc.ball_game(llm, requires_custom="球友")  # answered only if 球友 is in the prompt
    a, b = await new_user(infra), await new_user(infra)
    for user in (a, b):
        await seed(infra, user, Seed(persons=["小李"]))
    with tenant_scope(a.tenant):
        await taxonomy.add_custom_subtype(infra, category=Category.SOCIAL, name="球友")

    mine = await sc.extracted(infra, a, sc.BALL_GAME)
    theirs = await sc.extracted(infra, b, sc.BALL_GAME)
    assert types_of(mine.content) == [("social", "球友", "打球"), ("social", "朋友", "好兄弟")]
    assert types_of(theirs.content) == [("social", "其他", "打球"), ("social", "朋友", "好兄弟")]
    # A's request carried 球友 in the vocabulary sent to the model
    assert next(r for r in llm.rules if r.name.endswith("+球友")).used >= 1


async def test_a_custom_subtype_can_be_chosen_in_a_draft(infra: Infra, llm: LLMScript) -> None:
    sc.laowang_types(llm)
    user = await new_user(infra)
    with tenant_scope(user.tenant):
        await taxonomy.add_custom_subtype(infra, category=Category.SOCIAL, name="饭搭子")
    draft = await sc.extracted(infra, user, sc.LAOWANG)
    assert draft.content is not None
    data: dict[str, Any] = draft.content.model_dump(mode="json", by_alias=True)
    data["relationships"][0]["types"][2]["subtype"] = "饭搭子"
    with tenant_scope(user.tenant):
        result = await drafts.update_draft(infra, draft.id, Draft.model_validate(data))
    assert isinstance(result, Ok)
    assert ("social", "饭搭子", "饭搭子") in types_of(result.value.content)


# --- AC-30 ---------------------------------------------------------------------------


async def test_feelings_of_the_two_directions_are_independent_and_keep_their_history(
    infra: Infra, llm: LLMScript
) -> None:
    sc.ball_game(llm)
    sc.xiaoli_cold_again(llm)
    user = await new_user(infra)
    await seed(
        infra,
        user,
        Seed(
            persons=["小李"],
            feelings=[("我", "小李", "closeness", "close", "2026-10", Confidence.WITNESSED)],
        ),
    )
    await sc.confirmed(
        infra, user, (await sc.extracted(infra, user, sc.BALL_GAME, "2026-11-15")).id
    )
    await sc.confirmed(
        infra, user, (await sc.extracted(infra, user, sc.COLD_AGAIN, "2026-11-16")).id
    )

    pair = await pair_of(infra, user, "小明", "小李")
    me, xiaoli = pair.a.id, pair.b.id
    mine = by_direction(pair.feelings, me, xiaoli)
    theirs = by_direction(pair.feelings, xiaoli, me)

    assert mine["closeness"].current.level == "close"  # untouched by 小李's coldness
    assert [f.level for f in mine["closeness"].history] == ["close"]
    assert mine["affinity"].current.level == "neutral"
    assert "trust" not in mine  # only recorded dimensions

    closeness = theirs["closeness"]
    assert [(f.level, f.occurred_at, f.confidence) for f in closeness.history] == [
        ("casual", PartialDate(2026, 11, 15), Confidence.INFERRED),
        ("distant", PartialDate(2026, 11, 16), Confidence.INFERRED),
    ]
    assert closeness.current.level == "distant"
    assert set(theirs) == {"closeness"}


async def test_feelings_can_be_recorded_by_hand_per_direction(infra: Infra) -> None:
    user = await new_user(infra)
    ids = await seed(infra, user, Seed(persons=["小李"]))
    with tenant_scope(user.tenant):
        result = await persons.edit_relationship(
            infra,
            ids["我"],
            ids["小李"],
            persons.RelationshipEdit(
                feelings=[persons.FeelingEdit(ids["小李"], ids["我"], "trust", "low")]
            ),
        )
    assert isinstance(result, Ok)
    pair = result.value.value
    assert by_direction(pair.feelings, ids["我"], ids["小李"]) == {}
    trust = by_direction(pair.feelings, ids["小李"], ids["我"])["trust"].current
    assert (trust.level, trust.confidence, trust.source) == (
        "low",
        Confidence.WITNESSED,
        str(result.value.entry.id),
    )
