"""Relationship Type (关系类型) vocabulary.

Two layers: five categories (大类) and about forty built-in subtypes (小类), each
category ending with "其他". Users may add custom subtypes under a category; those are
visible only to that user and take part in extraction (AC-32). Every extracted type is
normalized into the user's vocabulary while keeping the original wording, e.g.
"铁哥们" -> 社会 / 朋友 / 原话 "铁哥们" (AC-31).

Directional kin subtypes (父母 / 子女 / 祖孙) read as "pair[0] 是 pair[1] 的 X".
"""

from __future__ import annotations

from collections.abc import Iterable, Mapping
from dataclasses import dataclass, field
from enum import StrEnum

OTHER = "其他"
CUSTOM_SUBTYPE_MAX_LEN = 20


class Category(StrEnum):
    KIN = "kin"  # 亲属
    ROMANTIC = "romantic"  # 情感
    SOCIAL = "social"  # 社会
    INTEREST = "interest"  # 利益
    HOSTILE = "hostile"  # 敌对

    @property
    def label(self) -> str:
        return _CATEGORY_LABELS[self]


_CATEGORY_LABELS = {
    Category.KIN: "亲属",
    Category.ROMANTIC: "情感",
    Category.SOCIAL: "社会",
    Category.INTEREST: "利益",
    Category.HOSTILE: "敌对",
}

# 36 built-in subtypes + one "其他" per category = 41 options.
_BUILTIN_SUBTYPES: dict[Category, tuple[str, ...]] = {
    Category.KIN: ("父母", "子女", "配偶", "兄弟姐妹", "祖孙", "亲戚", "姻亲"),
    Category.ROMANTIC: ("恋人", "前任", "暗恋", "暧昧"),
    Category.SOCIAL: (
        "朋友",
        "同事",
        "上下级",
        "同学",
        "室友",
        "校友",
        "师生",
        "邻居",
        "老乡",
        "战友",
        "网友",
    ),
    Category.INTEREST: ("合伙人", "客户", "供应商", "投资", "债权债务", "租赁", "中介"),
    Category.HOSTILE: ("竞争", "矛盾", "绝交", "纠纷", "情敌"),
}

# Common colloquial wordings -> built-in subtype. Keys must not be subtype names.
_SYNONYMS: dict[str, str] = {
    # 亲属
    "爸爸": "父母",
    "妈妈": "父母",
    "父亲": "父母",
    "母亲": "父母",
    "儿子": "子女",
    "女儿": "子女",
    "孩子": "子女",
    "老婆": "配偶",
    "老公": "配偶",
    "妻子": "配偶",
    "丈夫": "配偶",
    "爱人": "配偶",
    "夫妻": "配偶",
    "哥哥": "兄弟姐妹",
    "弟弟": "兄弟姐妹",
    "姐姐": "兄弟姐妹",
    "妹妹": "兄弟姐妹",
    "亲兄弟": "兄弟姐妹",
    "姐妹": "兄弟姐妹",
    "爷爷": "祖孙",
    "奶奶": "祖孙",
    "外公": "祖孙",
    "外婆": "祖孙",
    "孙子": "祖孙",
    "孙女": "祖孙",
    "表哥": "亲戚",
    "表姐": "亲戚",
    "表弟": "亲戚",
    "表妹": "亲戚",
    "堂哥": "亲戚",
    "堂弟": "亲戚",
    "叔叔": "亲戚",
    "舅舅": "亲戚",
    "姑姑": "亲戚",
    "侄子": "亲戚",
    "外甥": "亲戚",
    "岳父": "姻亲",
    "岳母": "姻亲",
    "公公": "姻亲",
    "婆婆": "姻亲",
    "连襟": "姻亲",
    "小舅子": "姻亲",
    # 情感
    "男朋友": "恋人",
    "女朋友": "恋人",
    "男友": "恋人",
    "女友": "恋人",
    "对象": "恋人",
    "情侣": "恋人",
    "前女友": "前任",
    "前男友": "前任",
    "前妻": "前任",
    "前夫": "前任",
    # 社会
    "好友": "朋友",
    "铁哥们": "朋友",
    "哥们": "朋友",
    "好兄弟": "朋友",
    "闺蜜": "朋友",
    "发小": "朋友",
    "死党": "朋友",
    "老友": "朋友",
    "领导": "上下级",
    "老板": "上下级",
    "上司": "上下级",
    "下属": "上下级",
    "大学同学": "同学",
    "高中同学": "同学",
    "初中同学": "同学",
    "小学同学": "同学",
    "同班同学": "同学",
    "舍友": "室友",
    "大学室友": "室友",
    "合租": "室友",
    "老师": "师生",
    "学生": "师生",
    "导师": "师生",
    "师徒": "师生",
    "前同事": "同事",
    "同乡": "老乡",
    # 利益
    "合作伙伴": "合伙人",
    "股东": "合伙人",
    "甲方": "客户",
    "乙方": "供应商",
    "投资人": "投资",
    "借钱": "债权债务",
    "欠钱": "债权债务",
    "借贷": "债权债务",
    "房东": "租赁",
    "租客": "租赁",
    # 敌对
    "对手": "竞争",
    "竞争对手": "竞争",
    "闹掰": "矛盾",
    "不和": "矛盾",
    "有过节": "矛盾",
    "断交": "绝交",
}


@dataclass(frozen=True, slots=True)
class RelationshipType:
    """One type of a Relationship: category / subtype, plus the original wording."""

    category: Category
    subtype: str
    original: str


@dataclass(frozen=True, slots=True)
class CustomSubtype:
    category: Category
    name: str


class InvalidCustomSubtypeError(ValueError):
    pass


@dataclass(frozen=True)
class Taxonomy:
    """An immutable vocabulary: built-in subtypes plus, optionally, one user's custom ones."""

    subtypes: Mapping[Category, tuple[str, ...]]
    custom: tuple[CustomSubtype, ...] = field(default=())

    def options(self) -> dict[Category, list[str]]:
        """Subtypes per category for prompts and pickers; "其他" is always last."""
        out: dict[Category, list[str]] = {}
        for category in Category:
            names = list(self.subtypes.get(category, ()))
            names += [c.name for c in self.custom if c.category is category]
            out[category] = [*names, OTHER]
        return out

    def category_of(self, subtype: str) -> Category | None:
        """The category a (non-"其他") subtype belongs to, or None if unknown."""
        if subtype == OTHER:
            return None
        for category, names in self.options().items():
            if subtype in names:
                return category
        return None

    def contains(self, category: Category, subtype: str) -> bool:
        return subtype in self.options()[category]

    def normalize(
        self, category: Category, label: str, *, original: str | None = None
    ) -> RelationshipType:
        """Fit an LLM-proposed (category, label) into this vocabulary (AC-31).

        Order: exact subtype (its own category wins) -> synonym -> "其他" of ``category``.
        The original wording is always kept.
        """
        label = label.strip()
        kept = (original or label).strip()
        for candidate in (label, _SYNONYMS.get(label)):
            if candidate is None:
                continue
            found = self.category_of(candidate)
            if found is not None:
                return RelationshipType(found, candidate, kept)
        return RelationshipType(category, OTHER, kept)

    def validate_custom(self, custom: CustomSubtype) -> CustomSubtype:
        name = custom.name.strip()
        if not name:
            raise InvalidCustomSubtypeError("custom subtype name is empty")
        if len(name) > CUSTOM_SUBTYPE_MAX_LEN:
            raise InvalidCustomSubtypeError(f"custom subtype longer than {CUSTOM_SUBTYPE_MAX_LEN}")
        if name == OTHER or self.category_of(name) is not None:
            raise InvalidCustomSubtypeError(f"subtype {name!r} already exists")
        return CustomSubtype(custom.category, name)

    def with_custom(self, customs: Iterable[CustomSubtype]) -> Taxonomy:
        """A new vocabulary for one user: this one plus their custom subtypes."""
        merged = self
        for custom in customs:
            valid = merged.validate_custom(custom)
            merged = Taxonomy(merged.subtypes, (*merged.custom, valid))
        return merged


BUILTIN = Taxonomy(_BUILTIN_SUBTYPES)

DIRECTIONAL_SUBTYPES = frozenset({"父母", "子女", "祖孙"})  # read pair[0] 是 pair[1] 的 X

# Wordings that are no relation one person is to another (an act or a state between them)
_NOT_RELATIONS = frozenset(
    {"借钱", "欠钱", "借贷", "闹掰", "不和", "有过节", "断交", "合租", "师徒", "情侣", "夫妻"}
    | {"竞争", "矛盾", "绝交", "纠纷", "投资", "债权债务", "租赁", "暗恋", "暧昧", "姻亲"}
)
# More colloquial wordings of who someone is to me, for questions (「我媳妇」「我老伴」)
_MORE_RELATION_WORDS = {"媳妇": "配偶", "老伴": "配偶", "太太": "配偶"}
RELATION_WORDS = frozenset(
    w
    for w in (
        *(n for names in _BUILTIN_SUBTYPES.values() for n in names),
        *_SYNONYMS,
        *_MORE_RELATION_WORDS,
    )
    if w not in _NOT_RELATIONS
)


def subtype_of(word: str) -> str | None:
    """The built-in subtype a relation word stands for (「老婆」 -> 配偶), if any."""
    if BUILTIN.category_of(word) is not None:
        return word
    return _SYNONYMS.get(word) or _MORE_RELATION_WORDS.get(word)


__all__ = [
    "BUILTIN",
    "DIRECTIONAL_SUBTYPES",
    "OTHER",
    "RELATION_WORDS",
    "Category",
    "CustomSubtype",
    "InvalidCustomSubtypeError",
    "RelationshipType",
    "Taxonomy",
    "subtype_of",
]
