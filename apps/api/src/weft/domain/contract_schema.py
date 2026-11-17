"""JSON Schema generation for the published contracts (apps/api/contracts/*.schema.json).

The web app turns these schemas into TypeScript with json-schema-to-typescript, so two
pydantic defaults are adjusted here, in one place, for every contract:

- **Fixed-length homogeneous tuples** (``tuple[str, str]``, a relationship ``pair``) are
  emitted as ``{"type": "array", "items": <item>, "minItems": n, "maxItems": n}`` instead
  of ``prefixItems``, which the generator cannot read (it would produce ``[unknown, unknown]``).
- **Collections with a factory default** (``Field(default_factory=list)``) are always
  present in a response, so they are marked *required* in the serialization schema. Fields
  with a plain default (``None``, ``False``, ``()``) stay optional.
"""

from __future__ import annotations

from typing import Any

from pydantic import BaseModel
from pydantic.json_schema import GenerateJsonSchema, JsonSchemaValue
from pydantic_core import core_schema

JSON_SCHEMA_DIALECT = "https://json-schema.org/draft/2020-12/schema"
CONTRACT_ID_BASE = "https://weft.local/contracts/"


class ContractJsonSchema(GenerateJsonSchema):
    def tuple_schema(self, schema: core_schema.TupleSchema) -> JsonSchemaValue:
        json_schema = super().tuple_schema(schema)
        prefix = json_schema.get("prefixItems")
        if prefix and "items" not in json_schema and all(item == prefix[0] for item in prefix):
            n = len(prefix)
            return {"type": "array", "items": prefix[0], "minItems": n, "maxItems": n}
        return json_schema

    def field_is_required(
        self,
        field: core_schema.ModelField | core_schema.DataclassField | core_schema.TypedDictField,
        total: bool,
    ) -> bool:
        inner = field["schema"]
        if self.mode == "serialization" and inner["type"] == "default":
            return "default_factory" in inner
        return super().field_is_required(field, total)


def contract_json_schema(model: type[BaseModel], filename: str) -> dict[str, Any]:
    """The serialization-mode JSON Schema of ``model``, published as ``contracts/<filename>``."""
    schema = model.model_json_schema(
        by_alias=True, mode="serialization", schema_generator=ContractJsonSchema
    )
    return {"$schema": JSON_SCHEMA_DIALECT, "$id": CONTRACT_ID_BASE + filename, **schema}


__all__ = ["ContractJsonSchema", "contract_json_schema"]
