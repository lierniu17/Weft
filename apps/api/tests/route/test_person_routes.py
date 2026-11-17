"""Person, relationship, taxonomy routes over HTTP (AC-26, AC-27, AC-30, AC-32)."""

from __future__ import annotations

import pytest

from tests.route.conftest import Register, as_test_user
from tests.support.graph import Seed, seed
from weft.domain.confidence import Confidence
from weft.infra import Infra

pytestmark = pytest.mark.route


async def test_manual_profile_edits_create_manual_edit_entries(
    infra: Infra, register: Register
) -> None:
    user = await register()
    ids = await seed(
        infra,
        as_test_user(user),
        Seed(persons=["老张"], facts=[("老张", "HAS_TRAIT", "急性子", Confidence.HEARSAY, None)]),
    )
    url = f"/api/persons/{ids['老张']}/profile"
    birthday = await user.client.patch(
        url, json={"op": "set_identity", "field": "birthday", "value": "03-05"}
    )
    assert birthday.status_code == 200
    body = birthday.json()
    assert body["profile"]["identity"]["birthday"] == {
        "value": "03-05",
        "confidence": "witnessed",
        "sources": [body["entry_id"]],
    }
    [trait] = [f for f in body["profile"]["facts"] if f["predicate"] == "HAS_TRAIT"]
    deleted = await user.client.patch(url, json={"op": "delete_fact", "fact_id": trait["id"]})
    assert deleted.status_code == 200
    assert [f for f in deleted.json()["profile"]["facts"] if f["predicate"] == "HAS_TRAIT"] == []

    entries = (await user.client.get("/api/entries")).json()
    assert [e["kind"] for e in entries] == ["manual_edit", "manual_edit"]
    assert all(e["draft"] is None for e in entries)
    bad = await user.client.patch(url, json={"op": "add_fact", "predicate": "NOPE", "object": "x"})
    assert (bad.status_code, bad.json()["error"]) == (422, "invalid_edit")


async def test_person_deletion_reports_impact_and_refuses_self(
    infra: Infra, register: Register
) -> None:
    user = await register()
    ids = await seed(infra, as_test_user(user), Seed(persons=["老张"]))
    impact = await user.client.get(f"/api/persons/{ids['老张']}/deletion-impact")
    assert impact.json() == {"entry_count": 0, "can_delete": True}
    me = await user.client.get(f"/api/persons/{user.self_person_id}/deletion-impact")
    assert me.json()["can_delete"] is False

    refused = await user.client.delete(f"/api/persons/{user.self_person_id}")
    assert (refused.status_code, refused.json()["error"]) == (409, "self_undeletable")
    assert (await user.client.delete(f"/api/persons/{ids['老张']}")).status_code == 204
    assert (await user.client.get(f"/api/persons/{ids['老张']}")).status_code == 404


async def test_pair_view_shows_each_direction_with_history(
    infra: Infra, register: Register
) -> None:
    user = await register()
    ids = await seed(
        infra,
        as_test_user(user),
        Seed(
            persons=["小李"],
            feelings=[("我", "小李", "closeness", "close", "2026-10", Confidence.WITNESSED)],
        ),
    )
    url = f"/api/persons/{user.self_person_id}/relationships/{ids['小李']}"
    edited = await user.client.patch(
        url,
        json={
            "status": "distant",
            "types": [{"category": "social", "subtype": "同学", "original": "大学同学"}],
            "feelings": [{"direction": "b_to_a", "dimension": "closeness", "level": "distant"}],
        },
    )
    assert edited.status_code == 200, edited.text
    pair = (await user.client.get(url)).json()
    assert pair["relationship"]["status"] == "distant"
    assert pair["relationship"]["types"] == [
        {"category": "social", "subtype": "同学", "original": "大学同学"}
    ]
    mine = pair["a_to_b"]["dimensions"]
    theirs = pair["b_to_a"]["dimensions"]
    assert set(mine) == {"closeness"} and mine["closeness"]["current"]["level"] == "close"
    assert [h["level"] for h in theirs["closeness"]["history"]] == ["distant"]
    assert theirs["closeness"]["current"]["occurred_at"] == "2026-11-16"

    bad = await user.client.patch(
        url, json={"feelings": [{"direction": "a_to_b", "dimension": "trust", "level": "close"}]}
    )
    assert (bad.status_code, bad.json()["error"]) == (422, "invalid_edit")


async def test_custom_subtypes_over_http(register: Register) -> None:
    a, b = await register(), await register()
    added = await a.client.post(
        "/api/taxonomy/subtypes", json={"category": "social", "name": "球友"}
    )
    assert added.status_code == 201
    social = next(c for c in added.json() if c["category"] == "social")
    assert {"name": "球友", "custom": True} in social["subtypes"]
    assert social["subtypes"][-1] == {"name": "其他", "custom": False}

    again = await a.client.post("/api/taxonomy/subtypes", json={"category": "kin", "name": "球友"})
    assert (again.status_code, again.json()["error"]) == (409, "subtype_exists")
    theirs = (await b.client.get("/api/taxonomy")).json()
    assert all(s["name"] != "球友" for c in theirs for s in c["subtypes"])
