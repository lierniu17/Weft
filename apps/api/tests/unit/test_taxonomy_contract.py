"""词表 endpoint payload (taxonomy.schema.json): categories → subtypes, built-in vs custom."""

import pytest
from pydantic import ValidationError

from weft.domain.taxonomy import BUILTIN, OTHER, Category, CustomSubtype
from weft.domain.taxonomy_contract import TaxonomyResponse, taxonomy_json_schema

pytestmark = pytest.mark.unit


def test_builtin_vocabulary_lists_every_category_in_order_with_other_last() -> None:
    payload = TaxonomyResponse.of(BUILTIN)
    assert [g.category for g in payload.root] == list(Category)
    for group in payload.root:
        names = [s.name for s in group.subtypes]
        assert names == BUILTIN.options()[group.category]
        assert names[-1] == OTHER
        assert not any(s.custom for s in group.subtypes)


def test_custom_subtypes_are_flagged_and_sit_before_other() -> None:
    mine = BUILTIN.with_custom([CustomSubtype(Category.SOCIAL, "球友")])
    social = next(g for g in TaxonomyResponse.of(mine).root if g.category is Category.SOCIAL)
    assert [(s.name, s.custom) for s in social.subtypes[-2:]] == [("球友", True), (OTHER, False)]


def test_serializes_to_the_shape_the_web_expects() -> None:
    mine = BUILTIN.with_custom([CustomSubtype(Category.SOCIAL, "球友")])
    dumped = TaxonomyResponse.of(mine).model_dump(mode="json")
    assert isinstance(dumped, list)
    assert dumped[0]["category"] == "kin"
    assert dumped[0]["subtypes"][0] == {"name": "父母", "custom": False}
    social = next(g for g in dumped if g["category"] == "social")
    assert {"name": "球友", "custom": True} in social["subtypes"]


def test_parses_web_payload_where_custom_is_omitted() -> None:
    payload = TaxonomyResponse.model_validate(
        [{"category": "kin", "subtypes": [{"name": "父母"}, {"name": "其他"}]}]
    )
    assert payload.root[0].subtypes[0].custom is False


def test_rejects_unknown_category_and_empty_names() -> None:
    with pytest.raises(ValidationError):
        TaxonomyResponse.model_validate([{"category": "work", "subtypes": []}])
    with pytest.raises(ValidationError):
        TaxonomyResponse.model_validate([{"category": "kin", "subtypes": [{"name": ""}]}])


def test_json_schema_is_an_array_of_categories() -> None:
    schema = taxonomy_json_schema()
    assert schema["title"] == "Taxonomy"
    assert schema["type"] == "array"
    assert schema["items"] == {"$ref": "#/$defs/TaxonomyCategory"}
    defs = schema["$defs"]
    assert set(defs["TaxonomyCategory"]["required"]) == {"category", "subtypes"}
    assert defs["TaxonomySubtype"]["required"] == ["name"]
    assert defs["TaxonomySubtype"]["properties"]["custom"]["type"] == "boolean"
    assert defs["Category"]["enum"] == [c.value for c in Category]
