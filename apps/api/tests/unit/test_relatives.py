"""Relation phrases (「我老婆」「老张的老婆」「闺蜜」) as the persons a question asks about:
split into an anchor and a relation word, then followed along the relationships."""

from __future__ import annotations

import pytest

from weft.domain.relatives import RelationPhrase, Tie, related, related_any, relation_phrase
from weft.domain.taxonomy import RELATION_WORDS

pytestmark = pytest.mark.unit

WORDS = RELATION_WORDS | {"老婆的闺蜜", "健身教练"}


@pytest.mark.parametrize(
    ("text", "anchor", "word"),
    [
        ("我老婆", "我", "老婆"),
        ("老张的老婆", "老张", "老婆"),
        ("闺蜜", "", "闺蜜"),
        ("那个闺蜜", "", "闺蜜"),  # 「那个」 points, it names no one
        ("他老婆", "他", "老婆"),
        ("我的老同学", "我", "同学"),
        ("老张的老同学", "老张", "同学"),
        ("我的健身教练", "我", "健身教练"),  # the user's own wording
        ("我老婆的闺蜜", "我", "老婆的闺蜜"),  # the longest wording wins
        ("黄丽的老公", "黄丽", "老公"),
        ("王老师", "王", "老师"),  # a phrase in form; whether 「王」 is anyone is the caller's
    ],
)
def test_a_relation_phrase_splits_into_anchor_and_relation_word(
    text: str, anchor: str, word: str
) -> None:
    assert relation_phrase(text, WORDS) == RelationPhrase(anchor, word)


@pytest.mark.parametrize("text", ["老周", "诸葛亮", "马超", "周建国", "小李", ""])
def test_a_name_is_no_relation_phrase(text: str) -> None:
    assert relation_phrase(text, WORDS) is None


TIES = [
    Tie("liuting", "me", "配偶", "老婆"),
    Tie("liuting", "dujuan", "朋友", "闺蜜"),
    Tie("me", "dujuan", "朋友", "老婆的闺蜜"),
    Tie("me", "laozhang", "朋友", "好朋友"),
    Tie("huangli", "laozhang", "配偶", "老婆"),
    Tie("laozhang", "daughter", "父母", "女儿"),  # 老张 是 老张的女儿 的 父母
    Tie("chenjianguo", "me", "父母", "爸爸"),  # 陈建国 是 我 的 父母
    Tie("me", "zhoujianguo", "邻居", "老家的老邻居"),
    Tie("me", "linfang", "邻居", "邻居"),
]


@pytest.mark.parametrize(
    ("anchors", "word", "meant"),
    [
        ({"me"}, "老婆", {"liuting"}),
        ({"laozhang"}, "老婆", {"huangli"}),
        ({"huangli"}, "老公", {"laozhang"}),  # no tie says 老公: the subtype 配偶 does
        ({"liuting"}, "闺蜜", {"dujuan"}),  # worded so: not every friend of hers
        ({"me"}, "老婆的闺蜜", {"dujuan"}),
        ({"laozhang"}, "女儿", {"daughter"}),  # 父母 read in its direction
        ({"daughter"}, "爸爸", {"laozhang"}),
        ({"me"}, "爸爸", {"chenjianguo"}),
        ({"chenjianguo"}, "女儿", {"me"}),
        ({"me"}, "邻居", {"zhoujianguo", "linfang"}),
        ({"laozhang"}, "爸爸", set()),
        ({"chenjing"}, "老公", set()),  # someone without one
    ],
)
def test_a_relation_word_is_followed_from_its_anchor(
    anchors: set[str], word: str, meant: set[str]
) -> None:
    assert related(anchors, word, TIES) == meant


def test_a_wording_through_someone_else_is_not_ones_own() -> None:
    # 我 has no 闺蜜 worded so (杜鹃 is 老婆的闺蜜): the subtype 朋友 decides
    assert related({"me"}, "闺蜜", TIES) == {"dujuan", "laozhang"}


def test_for_a_description_any_friend_counts_however_worded() -> None:
    """context-gaps AC-3: 「那个朋友」 in a description is any friend of mine — 杜鹃 too,
    worded 「老婆的闺蜜」 — where ``related`` lets the worded 「好朋友」 win."""
    assert related({"me"}, "朋友", TIES) == {"laozhang"}
    assert related_any({"me"}, "朋友", TIES) == {"laozhang", "dujuan"}
    assert related_any({"me"}, "爸爸", TIES) == {"chenjianguo"}
