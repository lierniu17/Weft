"""Entry and Draft routes over HTTP: submit -> background extraction -> edit -> confirm,
errors and status codes (AC-6, AC-7, AC-11, AC-12, AC-17, AC-18, AC-19, AC-40)."""

from __future__ import annotations

from typing import Any

import pytest

from tests.route.conftest import ApiUser, Register, as_test_user
from tests.support import scenarios as sc
from tests.support.graph import Seed, seed
from tests.support.llm_script import LLMScript
from weft.infra import Infra

pytestmark = pytest.mark.route


async def submit(user: ApiUser, text: str, occurred_on: str | None = None) -> dict[str, Any]:
    body: dict[str, Any] = {"text": text}
    if occurred_on is not None:
        body["occurred_on"] = occurred_on
    response = await user.client.post("/api/entries", json=body)
    assert response.status_code == 201, response.text
    return response.json()  # type: ignore[no-any-return]


async def test_submitting_returns_an_extracting_draft_that_becomes_pending(
    register: Register, llm: LLMScript
) -> None:
    sc.dinner_with_laozhang(llm)
    user = await register()
    submitted = await submit(user, sc.DINNER)
    assert submitted["draft"]["status"] == "extracting"
    assert submitted["entry"]["occurred_on"] == "2026-11-16"
    assert submitted["entry"]["precision"] == "day"

    draft = (await user.client.get(f"/api/drafts/{submitted['draft']['id']}")).json()
    assert draft["status"] == "pending"
    assert [p["mention"] for p in draft["content"]["persons"]] == ["老张"]
    assert all(f["confidence"] for f in draft["content"]["facts"])


async def test_entry_validation_errors(register: Register) -> None:
    user = await register()
    blank = await user.client.post("/api/entries", json={"text": "   "})
    future = await user.client.post("/api/entries", json={"text": "x", "occurred_on": "2026-11-17"})
    garbage = await user.client.post("/api/entries", json={"text": "x", "occurred_on": "2026-13"})
    assert (blank.status_code, blank.json()["error"]) == (422, "blank_text")
    assert (future.status_code, future.json()["error"]) == (422, "future_date")
    assert (garbage.status_code, garbage.json()["error"]) == (422, "validation_error")
    assert (await user.client.get("/api/entries")).json() == []


async def test_year_precision_is_kept(register: Register, llm: LLMScript) -> None:
    sc.club_2015(llm)
    user = await register()
    submitted = await submit(user, sc.CLUB_2015, occurred_on="2015")
    [listed] = (await user.client.get("/api/entries")).json()
    assert (listed["occurred_on"], listed["precision"]) == ("2015", "year")
    assert listed["id"] == submitted["entry"]["id"]


async def test_quota_exceeded_is_429_with_the_reset_time(
    infra: Infra, register: Register, llm: LLMScript
) -> None:
    infra.settings = infra.settings.model_copy(update={"daily_entry_limit": 1})
    sc.dinner_with_laozhang(llm)
    user = await register()
    await submit(user, sc.DINNER)
    refused = await user.client.post("/api/entries", json={"text": "第二条"})
    assert refused.status_code == 429
    assert refused.json() == {
        "error": "quota_exceeded",
        "message": "今日已达上限，明天 0 点重置",
        "kind": "entry",
        "resets_at": "2026-11-17T00:00:00+08:00",
    }
    usage = (await user.client.get("/api/usage")).json()
    assert usage["entry"] == {"used": 1, "limit": 1, "remaining": 0}
    assert usage["ask"]["limit"] == 100
    assert usage["resets_at"] == "2026-11-17T00:00:00+08:00"
    assert len((await user.client.get("/api/entries")).json()) == 1


async def test_edit_then_confirm_twice_is_idempotent(register: Register, llm: LLMScript) -> None:
    sc.dinner_with_laozhang(llm)
    user = await register()
    draft_id = (await submit(user, sc.DINNER))["draft"]["id"]
    draft = (await user.client.get(f"/api/drafts/{draft_id}")).json()
    content = draft["content"]
    content["facts"] = [f for f in content["facts"] if f["object"] != "女儿高考"]

    put = await user.client.put(f"/api/drafts/{draft_id}", json={"content": content})
    assert put.status_code == 200
    first = await user.client.post(f"/api/drafts/{draft_id}/confirm")
    second = await user.client.post(f"/api/drafts/{draft_id}/confirm")
    assert first.status_code == second.status_code == 200
    assert first.json()["status"] == second.json()["status"] == "confirmed"

    people = (await user.client.get("/api/persons", params={"q": "老张"})).json()
    assert [p["name"] for p in people] == ["老张"]
    profile = (await user.client.get(f"/api/persons/{people[0]['id']}")).json()
    assert sorted(f["object"] for f in profile["facts"]) == sorted(["钓鱼", "喝酒"])

    edit_after = await user.client.put(f"/api/drafts/{draft_id}", json={"content": content})
    assert (edit_after.status_code, edit_after.json()["error"]) == (409, "not_pending")

    detail = (await user.client.get(f"/api/entries/{draft['entry_id']}")).json()
    assert detail["draft"]["status"] == "confirmed"
    assert [p["name"] for p in detail["persons"]] == ["老张"]
    assert sorted(f["object"] for f in detail["facts"]) == sorted(["钓鱼", "喝酒"])


async def test_an_ambiguous_person_blocks_confirmation_until_chosen(
    infra: Infra, register: Register, llm: LLMScript
) -> None:
    sc.laozhang_promoted(llm)
    llm.person_match("老张", decision="ambiguous", candidates=[1, 2])
    user = await register()
    ids = await seed(infra, as_test_user(user), Seed(persons=["张伟", "张强"]))
    draft_id = (await submit(user, sc.PROMOTED))["draft"]["id"]

    refused = await user.client.post(f"/api/drafts/{draft_id}/confirm")
    assert refused.status_code == 409
    assert (refused.json()["error"], refused.json()["mentions"]) == ("ambiguous_persons", ["老张"])

    content = (await user.client.get(f"/api/drafts/{draft_id}")).json()["content"]
    person = content["persons"][0]
    assert {c["name"] for c in person["candidates"]} == {"张伟", "张强"}
    content["persons"][0] = {
        "id": person["id"],
        "mention": "老张",
        "match": "matched",
        "person_id": ids["张伟"],
        "name": "张伟",
    }
    assert (
        await user.client.put(f"/api/drafts/{draft_id}", json={"content": content})
    ).status_code == 200
    assert (await user.client.post(f"/api/drafts/{draft_id}/confirm")).status_code == 200

    found = (await user.client.get("/api/persons", params={"q": "老张"})).json()
    assert [(p["name"], p["aliases"]) for p in found] == [("张伟", ["老张"])]


async def test_a_draft_naming_an_unknown_person_is_refused(
    register: Register, llm: LLMScript
) -> None:
    sc.dinner_with_laozhang(llm)
    user = await register()
    draft_id = (await submit(user, sc.DINNER))["draft"]["id"]
    content = (await user.client.get(f"/api/drafts/{draft_id}")).json()["content"]
    content["persons"][0].update(match="matched", person_id="no-such-person", name="谁")
    response = await user.client.put(f"/api/drafts/{draft_id}", json={"content": content})
    assert (response.status_code, response.json()["error"]) == (422, "unknown_person")


async def test_discarding_marks_the_entry_and_leaves_the_graph(
    register: Register, llm: LLMScript
) -> None:
    sc.dinner_with_laozhang(llm)
    user = await register()
    submitted = await submit(user, sc.DINNER)
    draft_id = submitted["draft"]["id"]
    discarded = await user.client.post(f"/api/drafts/{draft_id}/discard")
    assert (discarded.status_code, discarded.json()["status"]) == (200, "discarded")
    [entry] = (await user.client.get("/api/entries")).json()
    assert (entry["text"], entry["draft"]["status"]) == (sc.DINNER, "discarded")
    assert [p["name"] for p in (await user.client.get("/api/persons")).json()] == ["小明"]
    confirm = await user.client.post(f"/api/drafts/{draft_id}/confirm")
    assert (confirm.status_code, confirm.json()["error"]) == (409, "not_pending")


async def test_a_failed_extraction_can_be_retried(register: Register, llm: LLMScript) -> None:
    sc.graphiti_only(llm, sc.FLAKY)
    llm.enrichment_timeout(sc.FLAKY)
    user = await register()
    draft_id = (await submit(user, sc.FLAKY))["draft"]["id"]
    failed = (await user.client.get(f"/api/drafts/{draft_id}")).json()
    assert failed["status"] == "failed" and failed["error"].startswith("抽取失败")

    sc.flaky_ok(llm)
    retried = await user.client.post(f"/api/drafts/{draft_id}/retry")
    assert (retried.status_code, retried.json()["status"]) == (202, "extracting")
    assert (await user.client.get(f"/api/drafts/{draft_id}")).json()["status"] == "pending"
    again = await user.client.post(f"/api/drafts/{draft_id}/retry")
    assert (again.status_code, again.json()["error"]) == (409, "not_failed")
