"""Hand-authored LLM conversations for the spec's example Entries (BOT-2 ... BOT-13).

Each function registers, on an ``LLMScript``, what DeepSeek answers to the three
extraction calls for one Entry: Graphiti's entity and fact extraction, then Weft's
enrichment. The answers are written the way the model really answers (Chinese values,
SCREAMING_SNAKE relation types, ISO dates), including its typical slips where a test needs
one (an over-precise date, a colloquial relationship label).
"""

from __future__ import annotations

import uuid
from typing import Any

from tests.conftest import TestUser
from tests.support.llm_script import LLMScript
from weft.domain.dates import PartialDate
from weft.domain.tenancy import tenant_scope
from weft.infra import Infra
from weft.repositories.records import DraftRecord
from weft.services import drafts, entries
from weft.services.results import Ok


def _fact(source: str, relation: str, target: str, fact: str, **kw: Any) -> dict[str, Any]:
    return {"source": source, "relation": relation, "target": target, "fact": fact, **kw}


def _enriched(
    facts: list[dict[str, Any]] | None = None,
    relationships: list[dict[str, Any]] | None = None,
    feelings: list[dict[str, Any]] | None = None,
    profile: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    return {
        "facts": facts or [],
        "relationships": relationships or [],
        "feelings": feelings or [],
        "profile": profile or [],
    }


# --- BOT-2: 老张吃饭 ------------------------------------------------------------------

DINNER = "今天和老张吃饭，他说他女儿明年高考，他最近迷上了钓鱼，不过他不喝酒。"


def laozhang_likes_fishing(llm: LLMScript, text: str) -> None:
    """老张 likes fishing and does not drink (the shape of an earlier BOT-2 answer), for
    another tenant's 老张 in isolation tests."""
    llm.graphiti_entities(
        text,
        [("老张", "Person"), ("女儿高考", "LifeEvent"), ("钓鱼", "Interest"), ("喝酒", "Interest")],
    )
    llm.graphiti_facts(
        text,
        [
            _fact("老张", "EXPERIENCED", "女儿高考", "老张的女儿明年参加高考"),
            _fact("老张", "LIKES", "钓鱼", "老张最近迷上了钓鱼"),
            _fact("老张", "DISLIKES", "喝酒", "老张不喝酒"),
        ],
    )
    llm.enrichment(
        text,
        _enriched(
            facts=[
                {
                    "index": 0,
                    "subject": "老张",
                    "predicate": "EXPERIENCED",
                    "object": "女儿高考",
                    "confidence": "self_told",
                    "valid_at": "2027",
                    "valid_to": None,
                },
                {
                    "index": 1,
                    "subject": "老张",
                    "predicate": "LIKES",
                    "object": "钓鱼",
                    "confidence": "self_told",
                    "valid_at": None,
                    "valid_to": None,
                },
                {
                    "index": 2,
                    "subject": "老张",
                    "predicate": "DISLIKES",
                    "object": "喝酒",
                    "confidence": "self_told",
                    "valid_at": None,
                    "valid_to": None,
                },
            ],
        ),
    )


def dinner_with_laozhang(llm: LLMScript) -> None:
    """BOT-2 as the spec reads it now: 老张's daughter is a 称谓人物 (Descriptor Person)
    with her own fact and a 父母 relationship to 老张."""
    llm.graphiti_entities(
        DINNER,
        [
            ("老张", "Person"),
            ("老张的女儿", "Person"),
            ("高考", "LifeEvent"),
            ("钓鱼", "Interest"),
            ("喝酒", "Interest"),
        ],
    )
    llm.graphiti_facts(
        DINNER,
        [
            _fact("老张的女儿", "EXPERIENCED", "高考", "老张的女儿明年参加高考"),
            _fact("老张", "LIKES", "钓鱼", "老张最近迷上了钓鱼"),
            _fact("老张", "DISLIKES", "喝酒", "老张不喝酒"),
        ],
    )
    llm.enrichment(
        DINNER,
        {
            "persons": ["老张", "老张的女儿"],
            **_enriched(
                facts=[
                    {
                        "index": 0,
                        "subject": "老张的女儿",
                        "predicate": "EXPERIENCED",
                        "object": "明年高考",
                        "confidence": "self_told",
                        "valid_at": "2027",
                    },
                    {
                        "index": 1,
                        "subject": "老张",
                        "predicate": "LIKES",
                        "object": "钓鱼",
                        "confidence": "self_told",
                    },
                    {
                        "index": 2,
                        "subject": "老张",
                        "predicate": "DISLIKES",
                        "object": "喝酒",
                        "confidence": "self_told",
                    },
                ],
                relationships=[
                    {
                        "pair": ["老张", "老张的女儿"],
                        "types": [{"category": "kin", "subtype": "父母", "original": "女儿"}],
                        "confidence": "self_told",
                    }
                ],
            ),
        },
    )


# --- BOT-3: 老张升职 / 老张请喝奶茶 --------------------------------------------------

PROMOTED = "老张今天升职了"
BUBBLE_TEA = "老张请大家喝奶茶"
ZHANGWEI_PROMOTED = "张伟今天升职了"


def laozhang_promoted(llm: LLMScript, text: str = PROMOTED, name: str = "老张") -> None:
    llm.graphiti_entities(text, [(name, "Person"), ("升职", "LifeEvent")])
    llm.graphiti_facts(text, [_fact(name, "EXPERIENCED", "升职", f"{name}今天升职了")])
    llm.enrichment(
        text,
        _enriched(
            facts=[
                {
                    "index": 0,
                    "subject": name,
                    "predicate": "EXPERIENCED",
                    "object": "升职",
                    "confidence": "witnessed",
                    "valid_at": "2026-11-16",
                }
            ]
        ),
    )


def laozhang_bubble_tea(llm: LLMScript) -> None:
    llm.graphiti_entities(BUBBLE_TEA, [("老张", "Person"), ("请大家喝奶茶", "LifeEvent")])
    llm.graphiti_facts(
        BUBBLE_TEA, [_fact("老张", "EXPERIENCED", "请大家喝奶茶", "老张请大家喝奶茶")]
    )
    llm.enrichment(
        BUBBLE_TEA,
        _enriched(
            facts=[
                {
                    "index": 0,
                    "subject": "老张",
                    "predicate": "EXPERIENCED",
                    "object": "请大家喝奶茶",
                    "confidence": "witnessed",
                    "valid_at": "2026-11-16",
                }
            ]
        ),
    )


# --- BOT-4: 小李跳槽 -------------------------------------------------------------------

TO_ALIBABA = "小李跟我说他上个月跳槽去了阿里"
TO_TENCENT = "听小王说小李又去了腾讯"


def xiaoli_joins_alibaba(llm: LLMScript) -> None:
    llm.graphiti_entities(TO_ALIBABA, [("小李", "Person"), ("阿里巴巴", "Organization")])
    llm.graphiti_facts(
        TO_ALIBABA,
        [
            _fact(
                "小李",
                "WORKS_AT",
                "阿里巴巴",
                "小李上个月跳槽去了阿里巴巴",
                valid_at="2026-10-01T00:00:00Z",
            )
        ],
    )
    llm.enrichment(
        TO_ALIBABA,
        _enriched(
            facts=[
                {
                    "index": 0,
                    "subject": "小李",
                    "predicate": "WORKS_AT",
                    "object": "阿里巴巴",
                    "confidence": "self_told",
                    "valid_at": "2026-10",
                }
            ]
        ),
    )


def xiaoli_joins_tencent(llm: LLMScript) -> None:
    llm.graphiti_entities(
        TO_TENCENT, [("小王", "Person"), ("小李", "Person"), ("腾讯", "Organization")]
    )
    llm.graphiti_facts(TO_TENCENT, [_fact("小李", "WORKS_AT", "腾讯", "小李又去了腾讯")])
    llm.enrichment(
        TO_TENCENT,
        _enriched(
            facts=[
                {
                    "index": 0,
                    "subject": "小李",
                    "predicate": "WORKS_AT",
                    "object": "腾讯",
                    "confidence": "hearsay",
                    "valid_at": None,
                }
            ]
        ),
    )


# --- AC-8: relative times ----------------------------------------------------------------

FISHING_WEEKEND = "上周末和老张去钓鱼了，他说去年在杭州买了房"
CLUB_2015 = "那年夏天在社团认识了小李"


def weekend_fishing(llm: LLMScript) -> None:
    llm.graphiti_entities(
        FISHING_WEEKEND,
        [("老张", "Person"), ("钓鱼", "LifeEvent"), ("在杭州买房", "LifeEvent")],
    )
    llm.graphiti_facts(
        FISHING_WEEKEND,
        [
            _fact(
                "老张",
                "EXPERIENCED",
                "钓鱼",
                "上周末我和老张去钓鱼",
                valid_at="2026-11-14T00:00:00Z",
                invalid_at="2026-11-15T23:59:59Z",
            ),
            _fact(
                "老张",
                "EXPERIENCED",
                "在杭州买房",
                "老张去年在杭州买了房",
                valid_at="2025-01-01T00:00:00Z",
            ),
        ],
    )
    llm.enrichment(
        FISHING_WEEKEND,
        _enriched(
            facts=[
                {
                    "index": 0,
                    "subject": "老张",
                    "predicate": "EXPERIENCED",
                    "object": "和我去钓鱼",
                    "confidence": "witnessed",
                    "valid_at": "2026-11-14",
                    "valid_to": "2026-11-15",
                },
                {
                    "index": 1,
                    "subject": "老张",
                    "predicate": "EXPERIENCED",
                    "object": "在杭州买房",
                    "confidence": "self_told",
                    "valid_at": "2025",
                    "valid_to": None,
                },
            ]
        ),
    )


def club_2015(llm: LLMScript) -> None:
    """The model over-resolves 那年夏天 to July although the Entry is dated only 2015."""
    llm.graphiti_entities(CLUB_2015, [("小李", "Person"), ("加入社团", "LifeEvent")])
    llm.graphiti_facts(
        CLUB_2015,
        [
            _fact(
                "小李",
                "EXPERIENCED",
                "加入社团",
                "小李那年夏天在社团",
                valid_at="2015-07-01T00:00:00Z",
            )
        ],
    )
    llm.enrichment(
        CLUB_2015,
        _enriched(
            facts=[
                {
                    "index": 0,
                    "subject": "小李",
                    "predicate": "EXPERIENCED",
                    "object": "加入社团",
                    "confidence": "witnessed",
                    "valid_at": "2015-07",
                }
            ],
            relationships=[
                {
                    "pair": ["我", "小李"],
                    "types": [{"category": "social", "subtype": "校友", "original": "社团认识"}],
                    "met_at": "2015-07",
                    "origin": "大学社团",
                    "introduced_by": None,
                    "status": "active",
                    "confidence": "witnessed",
                }
            ],
        ),
    )


# --- BOT-13: 打球，感受，球友 ------------------------------------------------------------

BALL_GAME = "周末和小李打球，感觉他最近对我挺冷淡的，我倒还是把他当好兄弟"


def ball_game(llm: LLMScript, *, requires_custom: str | None = None) -> None:
    llm.graphiti_entities(BALL_GAME, [("小李", "Person"), ("打球", "Interest")])
    llm.graphiti_facts(BALL_GAME, [_fact("小李", "LIKES", "打球", "小李周末和我打球")])
    llm.enrichment(
        BALL_GAME,
        _enriched(
            facts=[
                {
                    "index": 0,
                    "subject": "小李",
                    "predicate": "LIKES",
                    "object": "打球",
                    "confidence": "witnessed",
                }
            ],
            relationships=[
                {
                    "pair": ["我", "小李"],
                    "types": [
                        {"category": "social", "subtype": "球友", "original": "打球"},
                        {"category": "social", "subtype": "好兄弟", "original": "好兄弟"},
                    ],
                    "status": "active",
                    "confidence": "witnessed",
                }
            ],
            feelings=[
                {
                    "from": "小李",
                    "to": "我",
                    "dimension": "closeness",
                    "level": "casual",
                    "confidence": "inferred",
                }
            ],
        ),
        requires_custom=requires_custom,
    )


COLD_AGAIN = "小李最近完全不理我了"


def xiaoli_cold_again(llm: LLMScript) -> None:
    llm.graphiti_entities(COLD_AGAIN, [("小李", "Person")])
    llm.graphiti_facts(COLD_AGAIN, [])
    llm.enrichment(
        COLD_AGAIN,
        _enriched(
            feelings=[
                {
                    "from": "小李",
                    "to": "我",
                    "dimension": "closeness",
                    "level": "distant",
                    "confidence": "inferred",
                },
                {
                    "from": "我",
                    "to": "小李",
                    "dimension": "affinity",
                    "level": "neutral",
                    "confidence": "witnessed",
                },
            ]
        ),
    )


# --- AC-31: relationship type classification --------------------------------------------

LAOWANG = "老王是我铁哥们，也是我公司的合伙人，平时还是饭搭子"


def laowang_types(llm: LLMScript) -> None:
    llm.graphiti_entities(LAOWANG, [("老王", "Person")])
    llm.graphiti_facts(LAOWANG, [])
    llm.enrichment(
        LAOWANG,
        _enriched(
            relationships=[
                {
                    "pair": ["我", "老王"],
                    "types": [
                        {"category": "social", "subtype": "铁哥们", "original": "铁哥们"},
                        {"category": "interest", "subtype": "合伙人", "original": "公司的合伙人"},
                        {"category": "social", "subtype": "饭搭子", "original": "饭搭子"},
                    ],
                    "status": "active",
                    "confidence": "witnessed",
                }
            ],
        ),
    )


# --- AC-18: failures ----------------------------------------------------------------------

GARBLED = "昨天见了老周，聊了很久"
FLAKY = "下午和老周喝了咖啡"


def graphiti_only(llm: LLMScript, text: str) -> None:
    llm.graphiti_entities(text, [("老周", "Person")])
    llm.graphiti_facts(text, [])


def flaky_ok(llm: LLMScript) -> None:
    llm.enrichment(
        FLAKY,
        _enriched(
            relationships=[
                {
                    "pair": ["我", "老周"],
                    "types": [{"category": "social", "subtype": "朋友", "original": "朋友"}],
                    "confidence": "witnessed",
                }
            ]
        ),
    )


# --- helpers ----------------------------------------------------------------------------


async def extracted(
    infra: Infra, user: TestUser, text: str, occurred: str | None = None
) -> DraftRecord:
    """Submit ``text`` and run its extraction, as the background job does."""
    with tenant_scope(user.tenant):
        submitted = await entries.submit_entry(
            infra, text=text, occurred=None if occurred is None else PartialDate.parse(occurred)
        )
        assert isinstance(submitted, Ok), submitted
        result = await drafts.run_extraction(infra, submitted.value.draft.id)
    assert isinstance(result, Ok), result
    return result.value


async def confirmed(infra: Infra, user: TestUser, draft_id: uuid.UUID) -> DraftRecord:
    with tenant_scope(user.tenant):
        result = await drafts.confirm_draft(infra, draft_id)
    assert isinstance(result, Ok), result
    return result.value


# --- BOT-7: 老张和小李是室友 ---------------------------------------------------------------

ROOMMATES = "老张和小李是大学室友，听说小李最近升职了"


def roommates(llm: LLMScript) -> None:
    llm.graphiti_entities(
        ROOMMATES, [("老张", "Person"), ("小李", "Person"), ("升职", "LifeEvent")]
    )
    llm.graphiti_facts(ROOMMATES, [_fact("小李", "EXPERIENCED", "升职", "小李最近升职了")])
    llm.enrichment(
        ROOMMATES,
        _enriched(
            facts=[
                {
                    "index": 0,
                    "subject": "小李",
                    "predicate": "EXPERIENCED",
                    "object": "升职",
                    "confidence": "hearsay",
                    "valid_at": "2026-11",
                }
            ],
            relationships=[
                {
                    "pair": ["老张", "小李"],
                    "types": [
                        {"category": "social", "subtype": "大学室友", "original": "大学室友"}
                    ],
                    "origin": "大学",
                    "status": "active",
                    "confidence": "hearsay",
                }
            ],
        ),
    )


async def dinner_confirmed_as_in_bot2(infra: Infra, user: TestUser) -> DraftRecord:
    """BOT-2's review of ``DINNER``: 老张的女儿's fact and her relationship are deleted,
    the rest confirmed — so only 老张 (喜欢钓鱼, 不喝酒) reaches the graph."""
    draft = await extracted(infra, user, DINNER)
    assert draft.content is not None
    content = draft.content.model_copy(
        update={
            "facts": [f for f in draft.content.facts if f.subject != "老张的女儿"],
            "relationships": [],
        }
    )
    with tenant_scope(user.tenant):
        updated = await drafts.update_draft(infra, draft.id, content)
    assert isinstance(updated, Ok), updated
    return await confirmed(infra, user, draft.id)
