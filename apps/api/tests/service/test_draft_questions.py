"""补充追问 (Draft questions): extraction asks, a click or a typed answer fills the Draft in.

conversation-context AC-4, AC-6, AC-7, AC-8, AC-11 (draft part).
"""

from __future__ import annotations

from typing import Any

import pytest

from tests.support import scenarios as sc
from tests.support.graph import Seed, pair_of, person_named, persons_of, profile_of, seed
from tests.support.llm_script import LLMScript
from tests.support.users import new_user
from weft.domain.dates import PartialDate
from weft.domain.draft import Draft, DraftStatus, QuestionField
from weft.domain.quota import QuotaKind
from weft.domain.taxonomy import Category
from weft.domain.tenancy import tenant_scope
from weft.infra import Infra
from weft.repositories.entries import EntryRepository
from weft.repositories.records import DraftRecord
from weft.services import drafts, usage
from weft.services.results import Err, Ok

pytestmark = pytest.mark.service


def llm_calls(llm: LLMScript) -> int:
    return sum(rule.used for rule in llm.rules)


async def answer(infra: Infra, user: Any, draft: DraftRecord, qid: str, **how: Any) -> Any:
    with tenant_scope(user.tenant):
        return await drafts.answer_question(infra, draft.id, qid, **how)


async def stored(infra: Infra, user: Any, draft: DraftRecord) -> DraftRecord:
    with tenant_scope(user.tenant):
        result = await drafts.get_draft(infra, draft.id)
    assert isinstance(result, Ok)
    return result.value


async def entries_used(infra: Infra, user: Any) -> int:
    with tenant_scope(user.tenant):
        return (await usage.today(infra)).used(QuotaKind.ENTRY)


def types_with(content: Draft | None, other: str) -> list[str]:
    assert content is not None
    return [t.subtype for r in content.relationships if other in r.pair for t in r.types]


# --- AC-4: the Draft asks ---------------------------------------------------------------


async def test_a_record_without_the_relationship_type_asks_who_he_is(
    infra: Infra, llm: LLMScript
) -> None:
    sc.dinner_with_xiaoli(llm)
    user = await new_user(infra)
    draft = await sc.extracted(infra, user, sc.XIAOLI_DINNER)

    assert draft.content is not None
    [q] = draft.content.questions
    assert (q.id, q.field, q.pair, q.prompt) == (
        "q1",
        QuestionField.RELATIONSHIP_TYPE,
        ("我", "小李"),
        sc.XIAOLI_QUESTION,
    )
    assert [o.label for o in q.options] == ["同事", "同学"]
    assert not q.answered


async def test_a_vague_date_asks_when_it_was(infra: Infra, llm: LLMScript) -> None:
    sc.saw_laoma(llm)
    user = await new_user(infra)
    draft = await sc.extracted(infra, user, sc.LAOMA)

    assert draft.content is not None
    [q] = draft.content.questions
    assert (q.field, q.pair, q.prompt) == (QuestionField.OCCURRED, None, sc.LAOMA_QUESTION)
    assert [o.patch.occurred for o in q.options] == [
        PartialDate(2026, 11),
        PartialDate(2026, 10),
        PartialDate(2026, 9),
    ]


async def test_a_complete_record_asks_nothing(infra: Infra, llm: LLMScript) -> None:
    sc.dinner_with_laozhang(llm)
    user = await new_user(infra)
    draft = await sc.extracted(infra, user, sc.DINNER)

    assert draft.content is not None
    assert draft.content.questions == []


async def test_only_legal_questions_are_kept_and_at_most_two(infra: Infra, llm: LLMScript) -> None:
    sc.hike_with_ajie_sloppy_questions(llm)
    user = await new_user(infra)
    draft = await sc.extracted(infra, user, sc.AJIE_HIKE)

    assert draft.content is not None
    met, occurred = draft.content.questions
    assert (met.id, met.field, met.pair) == ("q1", QuestionField.MET, ("我", "阿杰"))
    assert [o.label for o in met.options] == ["爬山认识的", "朋友介绍"]  # 明年 is in the future
    assert (occurred.id, occurred.field) == ("q2", QuestionField.OCCURRED)


async def test_a_person_the_graph_already_knows_is_not_asked_about(
    infra: Infra, llm: LLMScript
) -> None:
    sc.dinner_with_xiaoli(llm)
    user = await new_user(infra)
    await seed(
        infra, user, Seed(persons=["小李"], relationships=[("我", "小李", Category.SOCIAL, "同事")])
    )
    draft = await sc.extracted(infra, user, sc.XIAOLI_DINNER)

    assert draft.content is not None
    assert [p.mention for p in draft.content.persons] == ["小李"]
    assert draft.content.questions == []


# --- AC-6: a click --------------------------------------------------------------------


async def test_clicking_an_option_fills_the_draft_in_without_the_model(
    infra: Infra, llm: LLMScript
) -> None:
    sc.dinner_with_xiaoli(llm)
    user = await new_user(infra)
    draft = await sc.extracted(infra, user, sc.XIAOLI_DINNER)
    calls, used = llm_calls(llm), await entries_used(infra, user)

    result = await answer(infra, user, draft, "q1", option=0)

    assert isinstance(result, Ok), result
    content = result.value.content
    assert content is not None
    assert types_with(content, "小李") == ["同事"]
    [rel] = content.relationships
    assert rel.pair == ("我", "小李")
    assert "我" in [p.mention for p in content.persons]  # 我 joins the Draft to be related
    [q] = content.questions
    assert (q.answered, q.answer) == (True, "同事")
    assert llm_calls(llm) == calls  # no model call
    assert await entries_used(infra, user) == used  # no quota
    assert (await stored(infra, user, draft)).content == content  # it survives a refresh


async def test_a_click_keeps_the_users_own_edits(infra: Infra, llm: LLMScript) -> None:
    sc.dinner_with_xiaoli(llm)
    user = await new_user(infra)
    draft = await sc.extracted(infra, user, sc.XIAOLI_DINNER)
    assert draft.content is not None
    data = draft.content.model_dump(mode="json", by_alias=True)
    data["facts"][0]["object"] = "一起吃了火锅"
    data["questions"] = []  # the client cannot drop or change the server's questions
    with tenant_scope(user.tenant):
        edited = await drafts.update_draft(infra, draft.id, Draft.model_validate(data))
    assert isinstance(edited, Ok), edited
    assert edited.value.content is not None
    assert len(edited.value.content.questions) == 1

    result = await answer(infra, user, draft, "q1", option=1)

    assert isinstance(result, Ok), result
    content = result.value.content
    assert content is not None
    assert [f.object for f in content.facts] == ["一起吃了火锅"]
    assert types_with(content, "小李") == ["同学"]


async def test_an_answered_question_cannot_be_answered_again(infra: Infra, llm: LLMScript) -> None:
    sc.dinner_with_xiaoli(llm)
    user = await new_user(infra)
    draft = await sc.extracted(infra, user, sc.XIAOLI_DINNER)
    assert isinstance(await answer(infra, user, draft, "q1", option=0), Ok)

    again = await answer(infra, user, draft, "q1", option=1)

    assert isinstance(again, Err) and again.reason == "already_answered"
    assert types_with((await stored(infra, user, draft)).content, "小李") == ["同事"]


async def test_unknown_question_or_option_changes_nothing(infra: Infra, llm: LLMScript) -> None:
    sc.dinner_with_xiaoli(llm)
    user = await new_user(infra)
    draft = await sc.extracted(infra, user, sc.XIAOLI_DINNER)

    missing = await answer(infra, user, draft, "q9", option=0)
    out_of_range = await answer(infra, user, draft, "q1", option=2)

    assert isinstance(missing, Err) and missing.reason == "not_found"
    assert isinstance(out_of_range, Err) and out_of_range.reason == "invalid_option"
    assert (await stored(infra, user, draft)).content == draft.content


async def test_an_occurred_answer_moves_the_entry_date_and_retimes_the_draft(
    infra: Infra, llm: LLMScript
) -> None:
    sc.saw_laoma(llm)
    user = await new_user(infra)
    draft = await sc.extracted(infra, user, sc.LAOMA)

    result = await answer(infra, user, draft, "q1", option=1)

    assert isinstance(result, Ok), result
    assert result.value.content is not None
    [fact] = result.value.content.facts
    assert fact.valid_at == PartialDate(2026, 10)
    with tenant_scope(user.tenant):
        async with infra.sql() as session:
            entry = await EntryRepository(session, user.tenant).get(draft.entry_id)
    assert entry is not None and entry.occurred == PartialDate(2026, 10)


# --- AC-7: a typed answer -------------------------------------------------------------


async def test_a_typed_answer_becomes_a_patch_of_that_field(infra: Infra, llm: LLMScript) -> None:
    sc.dinner_with_xiaoli(llm)
    text = "他是我大学同学"
    llm.question_answer(
        sc.XIAOLI_QUESTION,
        text,
        {"types": [{"category": "social", "subtype": "同学", "original": "大学同学"}]},
    )
    user = await new_user(infra)
    draft = await sc.extracted(infra, user, sc.XIAOLI_DINNER)
    used = await entries_used(infra, user)

    result = await answer(infra, user, draft, "q1", text=text)

    assert isinstance(result, Ok), result
    content = result.value.content
    assert content is not None
    [rel] = content.relationships
    assert [(t.subtype, t.original) for t in rel.types] == [("同学", "大学同学")]
    assert (content.questions[0].answered, content.questions[0].answer) == (True, text)
    assert await entries_used(infra, user) == used


async def test_a_typed_date_is_read_against_the_day_of_writing(
    infra: Infra, llm: LLMScript
) -> None:
    sc.saw_laoma(llm)
    text = "大概上个月中旬"
    llm.question_answer(sc.LAOMA_QUESTION, text, {"occurred": "2026-10"})
    user = await new_user(infra)
    draft = await sc.extracted(infra, user, sc.LAOMA)

    result = await answer(infra, user, draft, "q1", text=text)

    assert isinstance(result, Ok), result
    assert result.value.content is not None
    assert result.value.content.facts[0].valid_at == PartialDate(2026, 10)


@pytest.mark.parametrize(
    ("text", "patch"),
    [
        ("不记得了", None),  # nothing to read
        ("上个月认识的", {"occurred": "2026-10"}),  # another field than the question's
        ("算是熟人吧", {"types": [{"category": "nonsense", "subtype": "熟人"}]}),  # illegal
    ],
)
async def test_a_typed_answer_that_is_not_understood_changes_nothing(
    infra: Infra, llm: LLMScript, text: str, patch: Any
) -> None:
    sc.dinner_with_xiaoli(llm)
    llm.question_answer(sc.XIAOLI_QUESTION, text, patch)
    user = await new_user(infra)
    draft = await sc.extracted(infra, user, sc.XIAOLI_DINNER)
    used = await entries_used(infra, user)

    result = await answer(infra, user, draft, "q1", text=text)

    assert isinstance(result, Err) and result.reason == drafts.NOT_UNDERSTOOD
    assert result.message == "没理解这个回答，可以直接在草稿里改"
    assert (await stored(infra, user, draft)).content == draft.content
    assert await entries_used(infra, user) == used


# --- AC-8: confirming ignores what is left unanswered ---------------------------------


async def test_a_draft_with_an_unanswered_question_confirms_as_it_is(
    infra: Infra, llm: LLMScript
) -> None:
    sc.dinner_with_xiaoli(llm)
    user = await new_user(infra)
    draft = await sc.extracted(infra, user, sc.XIAOLI_DINNER)

    confirmed = await sc.confirmed(infra, user, draft.id)

    assert confirmed.status is DraftStatus.CONFIRMED
    profile = await profile_of(infra, user, "小李")
    assert [f.object for f in profile.facts] == ["和我吃饭"]
    me = next(p for p in await persons_of(infra, user) if p.is_self)
    assert (await pair_of(infra, user, me.name, "小李")).relationship is None
    late = await answer(infra, user, draft, "q1", option=0)
    assert isinstance(late, Err) and late.reason == "not_pending"


async def test_an_answered_question_is_written_on_confirmation(
    infra: Infra, llm: LLMScript
) -> None:
    sc.dinner_with_xiaoli(llm)
    user = await new_user(infra)
    draft = await sc.extracted(infra, user, sc.XIAOLI_DINNER)
    assert isinstance(await answer(infra, user, draft, "q1", option=0), Ok)

    await sc.confirmed(infra, user, draft.id)

    me = next(p for p in await persons_of(infra, user) if p.is_self)
    pair = await pair_of(infra, user, me.name, "小李")
    assert pair.relationship is not None
    assert [t.subtype for t in pair.relationship.types] == ["同事"]
    assert (await person_named(infra, user, "小李")).name == "小李"
