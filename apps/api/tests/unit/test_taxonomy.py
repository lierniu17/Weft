"""Relationship Type vocabulary: built-in two-layer taxonomy + custom subtypes (AC-31, AC-32)."""

import pytest

from weft.domain.taxonomy import (
    BUILTIN,
    OTHER,
    Category,
    CustomSubtype,
    InvalidCustomSubtypeError,
    RelationshipType,
)

pytestmark = pytest.mark.unit


def test_five_categories_with_chinese_labels() -> None:
    assert [c.label for c in Category] == ["亲属", "情感", "社会", "利益", "敌对"]


def test_builtin_has_about_forty_subtypes_and_other_in_each_category() -> None:
    options = BUILTIN.options()
    total = sum(len(v) for v in options.values())
    assert 35 <= total <= 45
    for category in Category:
        assert options[category][-1] == OTHER


@pytest.mark.parametrize(
    ("subtype", "category"),
    [
        ("父母", Category.KIN),
        ("配偶", Category.KIN),
        ("子女", Category.KIN),
        ("兄弟姐妹", Category.KIN),
        ("亲戚", Category.KIN),
        ("恋人", Category.ROMANTIC),
        ("前任", Category.ROMANTIC),
        ("暗恋", Category.ROMANTIC),
        ("朋友", Category.SOCIAL),
        ("同事", Category.SOCIAL),
        ("上下级", Category.SOCIAL),
        ("同学", Category.SOCIAL),
        ("室友", Category.SOCIAL),
        ("校友", Category.SOCIAL),
        ("师生", Category.SOCIAL),
        ("邻居", Category.SOCIAL),
        ("合伙人", Category.INTEREST),
        ("客户", Category.INTEREST),
        ("供应商", Category.INTEREST),
        ("债权债务", Category.INTEREST),
        ("竞争", Category.HOSTILE),
        ("矛盾", Category.HOSTILE),
    ],
)
def test_common_subtypes_are_built_in(subtype: str, category: Category) -> None:
    assert subtype in BUILTIN.options()[category]


def test_builtin_subtype_names_are_unique_across_categories() -> None:
    names = [s for subs in BUILTIN.options().values() for s in subs if s != OTHER]
    assert len(names) == len(set(names))


# --- normalizing an LLM label (AC-31) --------------------------------------


def test_exact_subtype_is_kept_with_original_wording() -> None:
    assert BUILTIN.normalize(Category.SOCIAL, "室友", original="大学室友") == RelationshipType(
        Category.SOCIAL, "室友", "大学室友"
    )


def test_synonym_maps_to_builtin_subtype_and_keeps_original() -> None:
    assert BUILTIN.normalize(Category.SOCIAL, "铁哥们") == RelationshipType(
        Category.SOCIAL, "朋友", "铁哥们"
    )
    assert BUILTIN.normalize(Category.KIN, "老婆") == RelationshipType(Category.KIN, "配偶", "老婆")


def test_known_subtype_wins_over_a_wrong_category_from_the_llm() -> None:
    assert BUILTIN.normalize(Category.SOCIAL, "前任").category is Category.ROMANTIC


def test_unknown_label_falls_into_other_of_the_given_category() -> None:
    assert BUILTIN.normalize(Category.SOCIAL, "球友") == RelationshipType(
        Category.SOCIAL, OTHER, "球友"
    )


def test_original_defaults_to_label() -> None:
    assert BUILTIN.normalize(Category.SOCIAL, "同事").original == "同事"


# --- per-user custom subtypes (AC-32) --------------------------------------


def test_custom_subtype_joins_its_category_before_other() -> None:
    mine = BUILTIN.with_custom([CustomSubtype(Category.SOCIAL, "球友")])
    social = mine.options()[Category.SOCIAL]
    assert "球友" in social
    assert social[-1] == OTHER


def test_custom_subtype_participates_in_normalization() -> None:
    mine = BUILTIN.with_custom([CustomSubtype(Category.SOCIAL, "球友")])
    assert mine.normalize(Category.SOCIAL, "球友", original="一起打球的") == RelationshipType(
        Category.SOCIAL, "球友", "一起打球的"
    )


def test_custom_subtypes_do_not_leak_into_builtin_or_other_users() -> None:
    BUILTIN.with_custom([CustomSubtype(Category.SOCIAL, "球友")])
    other_user = BUILTIN.with_custom([CustomSubtype(Category.SOCIAL, "牌友")])
    assert "球友" not in BUILTIN.options()[Category.SOCIAL]
    assert "球友" not in other_user.options()[Category.SOCIAL]


@pytest.mark.parametrize("name", ["同事", "其他", "  ", "", "前任", "长" * 21])
def test_invalid_custom_subtype_is_rejected(name: str) -> None:
    with pytest.raises(InvalidCustomSubtypeError):
        BUILTIN.validate_custom(CustomSubtype(Category.SOCIAL, name))


def test_duplicate_custom_subtype_is_rejected_even_in_another_category() -> None:
    mine = BUILTIN.with_custom([CustomSubtype(Category.SOCIAL, "球友")])
    with pytest.raises(InvalidCustomSubtypeError):
        mine.validate_custom(CustomSubtype(Category.INTEREST, "球友"))


def test_contains() -> None:
    assert BUILTIN.contains(Category.SOCIAL, "同事")
    assert BUILTIN.contains(Category.SOCIAL, OTHER)
    assert not BUILTIN.contains(Category.KIN, "同事")
    assert not BUILTIN.contains(Category.SOCIAL, "球友")
