"""Draft (草稿): the set of graph changes extracted from one Entry, awaiting confirmation.

Shape follows the spec (「录入与草稿流程」 step 3)::

    Draft {
      persons:  [{mention, match: matched|ambiguous|new, person_id?, candidates?[]}]
      facts:    [{subject, predicate, object, valid_at?, confidence, conflict?: {old, action}}]
      relationships: [{pair, types[], met_at?, origin?, introduced_by?, status?, confidence}]
      feelings: [{from, to, dimension, level, confidence}]
      profile:  [{person, field, value, confidence}]
    }

Person references (fact subject, relationship pair / introducer, feeling from / to,
profile person) are ``persons[].mention`` strings. Self appears as an ordinary person
entry matched to the Self person. A fact's ``object`` is free text (an organization,
interest, event, ...), not necessarily a person.

Deviation from the spec sketch: relationships carry a ``confidence`` because AC-10 requires
every draft item to show one and AC-28 shows it on third-party relationships.
"""

from __future__ import annotations

from enum import StrEnum
from typing import Annotated, Any, Literal, Self

from pydantic import BaseModel, ConfigDict, Field, model_validator

from weft.domain.confidence import Confidence, ConflictAction
from weft.domain.dates import PartialDate
from weft.domain.taxonomy import Category

NonEmpty = Annotated[str, Field(min_length=1)]


class _Model(BaseModel):
    model_config = ConfigDict(
        extra="forbid",
        frozen=True,
        populate_by_name=True,
        serialize_by_alias=True,
        use_enum_values=False,
    )


class DraftStatus(StrEnum):
    EXTRACTING = "extracting"  # 抽取中
    PENDING = "pending"  # 待确认
    FAILED = "failed"  # 抽取失败
    CONFIRMED = "confirmed"  # 已确认
    DISCARDED = "discarded"  # 已放弃


# --- persons ---------------------------------------------------------------


class PersonMatch(StrEnum):
    MATCHED = "matched"  # 已匹配
    AMBIGUOUS = "ambiguous"  # 需选择
    NEW = "new"  # 新人物


class Candidate(_Model):
    person_id: NonEmpty
    name: NonEmpty
    note: str | None = Field(default=None, description="Disambiguating hint, e.g. 同事 / 邻居")


class DraftPerson(_Model):
    mention: NonEmpty = Field(description="How the Entry refers to the person, e.g. 老张")
    match: PersonMatch
    person_id: str | None = None
    candidates: list[Candidate] | None = None

    @model_validator(mode="after")
    def _match_state_is_consistent(self) -> Self:
        if self.match is PersonMatch.MATCHED and not self.person_id:
            raise ValueError("a matched person needs person_id")
        if self.match is PersonMatch.AMBIGUOUS:
            if not self.candidates:
                raise ValueError("an ambiguous person needs candidates")
            if self.person_id is not None:
                raise ValueError("an ambiguous person has no person_id until chosen")
        if self.match is PersonMatch.NEW and self.person_id is not None:
            raise ValueError("a new person has no person_id")
        return self


# --- facts -----------------------------------------------------------------


class FactConflict(_Model):
    old: NonEmpty = Field(description="The current value this fact conflicts with")
    action: ConflictAction


class DraftFact(_Model):
    subject: NonEmpty = Field(description="Person mention")
    predicate: NonEmpty = Field(description="e.g. WORKS_AT, LIKES, HAS_TRAIT, EXPERIENCED")
    object: NonEmpty
    valid_at: PartialDate | None = None
    confidence: Confidence
    conflict: FactConflict | None = None


# --- relationships ---------------------------------------------------------


class RelationshipStatus(StrEnum):
    ACTIVE = "active"  # 活跃
    DISTANT = "distant"  # 疏远
    TENSE = "tense"  # 紧张
    ESTRANGED = "estranged"  # 断联


class DraftRelationshipType(_Model):
    category: Category
    subtype: NonEmpty
    original: NonEmpty = Field(description="The Entry's own wording, e.g. 铁哥们")


class DraftRelationship(_Model):
    pair: tuple[NonEmpty, NonEmpty]
    types: list[DraftRelationshipType] = Field(default_factory=list)
    met_at: PartialDate | None = None
    origin: str | None = Field(default=None, description="How they met (认识途径)")
    introduced_by: str | None = Field(default=None, description="Person mention of the introducer")
    status: RelationshipStatus | None = None
    confidence: Confidence

    @model_validator(mode="after")
    def _pair_is_two_people(self) -> Self:
        if self.pair[0] == self.pair[1]:
            raise ValueError("a relationship pair must be two different people")
        return self


# --- feelings --------------------------------------------------------------


class ClosenessLevel(StrEnum):
    INTIMATE = "intimate"  # 至交
    CLOSE = "close"  # 亲近
    FAMILIAR = "familiar"  # 熟悉
    CASUAL = "casual"  # 一般
    DISTANT = "distant"  # 疏远


class AffinityLevel(StrEnum):
    LIKE = "like"  # 喜欢
    NEUTRAL = "neutral"  # 中性
    DISLIKE = "dislike"  # 反感


class TrustLevel(StrEnum):
    HIGH = "high"  # 高
    MEDIUM = "medium"  # 中
    LOW = "low"  # 低


FEELING_LEVEL_LABELS: dict[str, dict[str, str]] = {
    "closeness": {
        "intimate": "至交",
        "close": "亲近",
        "familiar": "熟悉",
        "casual": "一般",
        "distant": "疏远",
    },
    "affinity": {"like": "喜欢", "neutral": "中性", "dislike": "反感"},
    "trust": {"high": "高", "medium": "中", "low": "低"},
}
FEELING_DIMENSION_LABELS = {"closeness": "亲密度", "affinity": "好恶", "trust": "信任"}


class _FeelingBase(_Model):
    from_: NonEmpty = Field(alias="from", description="Person mention who feels")
    to: NonEmpty = Field(description="Person mention the feeling is about")
    confidence: Confidence

    @model_validator(mode="after")
    def _two_people(self) -> Self:
        if self.from_ == self.to:
            raise ValueError("a feeling goes from one person to another")
        return self

    @property
    def level_label(self) -> str:
        dimension: str = getattr(self, "dimension")  # noqa: B009 - defined on subclasses
        level: StrEnum = getattr(self, "level")  # noqa: B009
        return FEELING_LEVEL_LABELS[dimension][level.value]


class ClosenessFeeling(_FeelingBase):
    dimension: Literal["closeness"]
    level: ClosenessLevel


class AffinityFeeling(_FeelingBase):
    dimension: Literal["affinity"]
    level: AffinityLevel


class TrustFeeling(_FeelingBase):
    dimension: Literal["trust"]
    level: TrustLevel


DraftFeeling = Annotated[
    ClosenessFeeling | AffinityFeeling | TrustFeeling, Field(discriminator="dimension")
]


# --- profile (identity fields) ---------------------------------------------


class ProfileField(StrEnum):
    NAME = "name"  # 姓名
    GENDER = "gender"  # 性别
    BIRTHDAY = "birthday"  # 生日
    HOMETOWN = "hometown"  # 籍贯


class DraftProfileItem(_Model):
    person: NonEmpty = Field(description="Person mention")
    field: ProfileField
    value: NonEmpty
    confidence: Confidence


# --- the draft -------------------------------------------------------------


class DraftNotConfirmableError(ValueError):
    """Some person is still 需选择; the user must pick a candidate or mark it new (AC-12)."""

    def __init__(self, mentions: list[str]) -> None:
        super().__init__(f"choose a person for: {', '.join(mentions)}")
        self.mentions = mentions


class Draft(_Model):
    persons: list[DraftPerson] = Field(default_factory=list)
    facts: list[DraftFact] = Field(default_factory=list)
    relationships: list[DraftRelationship] = Field(default_factory=list)
    feelings: list[DraftFeeling] = Field(default_factory=list)
    profile: list[DraftProfileItem] = Field(default_factory=list)

    @model_validator(mode="after")
    def _references_resolve(self) -> Self:
        mentions = [p.mention for p in self.persons]
        if len(mentions) != len(set(mentions)):
            raise ValueError("person mentions must be unique")
        known = set(mentions)
        refs: list[str] = [f.subject for f in self.facts]
        for r in self.relationships:
            refs += list(r.pair)
            if r.introduced_by is not None:
                refs.append(r.introduced_by)
        for feeling in self.feelings:
            refs += [feeling.from_, feeling.to]
        refs += [p.person for p in self.profile]
        missing = sorted({r for r in refs if r not in known})
        if missing:
            raise ValueError(f"unknown person mentions: {', '.join(missing)}")
        return self

    def ambiguous_mentions(self) -> list[str]:
        return [p.mention for p in self.persons if p.match is PersonMatch.AMBIGUOUS]

    def ensure_confirmable(self) -> None:
        """Raise ``DraftNotConfirmableError`` while any person is 需选择 (AC-12)."""
        pending = self.ambiguous_mentions()
        if pending:
            raise DraftNotConfirmableError(pending)

    def choose(self, mention: str, *, person_id: str | None) -> Draft:
        """Resolve an ambiguous person: pick a candidate, or ``None`` for 这是一个新人物."""
        persons: list[DraftPerson] = []
        for p in self.persons:
            if p.mention != mention:
                persons.append(p)
                continue
            if person_id is None:
                persons.append(DraftPerson(mention=mention, match=PersonMatch.NEW))
                continue
            if not any(c.person_id == person_id for c in p.candidates or []):
                raise ValueError(f"{person_id!r} is not a candidate for {mention!r}")
            persons.append(
                DraftPerson(mention=mention, match=PersonMatch.MATCHED, person_id=person_id)
            )
        if persons == list(self.persons):
            raise ValueError(f"no person mentioned as {mention!r}")
        return self.model_copy(update={"persons": persons})


def draft_json_schema() -> dict[str, Any]:
    """JSON Schema of the Draft contract, consumed by the frontend."""
    schema = Draft.model_json_schema(by_alias=True, mode="serialization")
    schema["$schema"] = "https://json-schema.org/draft/2020-12/schema"
    schema["$id"] = "https://weft.local/contracts/draft.schema.json"
    return schema


__all__ = [
    "FEELING_DIMENSION_LABELS",
    "FEELING_LEVEL_LABELS",
    "AffinityLevel",
    "Candidate",
    "ClosenessLevel",
    "Draft",
    "DraftFact",
    "DraftFeeling",
    "DraftNotConfirmableError",
    "DraftPerson",
    "DraftProfileItem",
    "DraftRelationship",
    "DraftRelationshipType",
    "DraftStatus",
    "FactConflict",
    "PersonMatch",
    "ProfileField",
    "RelationshipStatus",
    "TrustLevel",
    "draft_json_schema",
]
