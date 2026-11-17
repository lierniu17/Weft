"""词表 endpoint payload: the Relationship Type vocabulary as the web app consumes it.

Five categories (大类) in fixed order, each with its subtypes (小类): built-in ones, then
the user's custom ones (``custom: true``, AC-32), then "其他" last. Published as
``contracts/taxonomy.schema.json``.
"""

from __future__ import annotations

from typing import Annotated, Any

from pydantic import BaseModel, ConfigDict, Field, RootModel

from weft.domain.contract_schema import contract_json_schema
from weft.domain.taxonomy import Category, Taxonomy


class TaxonomySubtype(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    name: Annotated[str, Field(min_length=1)]
    custom: bool = Field(
        default=False, description="User-defined (自定义小类): visible only to this user"
    )


class TaxonomyCategory(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)

    category: Category
    subtypes: list[TaxonomySubtype]


class TaxonomyResponse(RootModel[list[TaxonomyCategory]]):
    """The whole vocabulary visible to one user."""

    model_config = ConfigDict(frozen=True, title="Taxonomy")

    @classmethod
    def of(cls, taxonomy: Taxonomy) -> TaxonomyResponse:
        custom = {(c.category, c.name) for c in taxonomy.custom}
        return cls(
            [
                TaxonomyCategory(
                    category=category,
                    subtypes=[
                        TaxonomySubtype(name=name, custom=(category, name) in custom)
                        for name in names
                    ],
                )
                for category, names in taxonomy.options().items()
            ]
        )


def taxonomy_json_schema() -> dict[str, Any]:
    """JSON Schema of the vocabulary payload, consumed by the frontend."""
    return contract_json_schema(TaxonomyResponse, "taxonomy.schema.json")


__all__ = ["TaxonomyCategory", "TaxonomyResponse", "TaxonomySubtype", "taxonomy_json_schema"]
