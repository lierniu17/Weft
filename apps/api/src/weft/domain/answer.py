"""Answer (回答结构): what 问答 returns for one question.

Spec 「实现决策 → 问答」: 一段文字加一组说法，每个说法关联若干出处（记录 ID、可信度）.

- ``kind`` picks the body: text | path (人脉路径) | list (条件筛选) | stat (聚合统计)
  | no_answer (图谱里没有相关信息, AC-38).
- ``segments`` is the answer text split so that each piece may carry the indices of the
  citations backing it; the web app renders a citation mark [n] after such a piece (AC-37).
- ``citations`` are numbered from 1; ``index`` is what segments and list items refer to.
  ``occurred_on`` is the source Entry's 发生日期 with its precision (YYYY / YYYY-MM / YYYY-MM-DD).
- 转述 / 推测 claims say so in the text itself (「据老张说」, AC-37); ``told_by`` lets the
  citation sheet repeat it. A claim quoting 我的评价 is flagged ``is_opinion`` so the UI can
  say 「你的评价」 (AC-23).

Mirrors the web's former hand-written ``apps/web/src/contracts/answer.ts``; the published
contract is ``contracts/answer.schema.json``.
"""

from __future__ import annotations

from enum import StrEnum
from typing import Annotated, Any, Self

from pydantic import BaseModel, ConfigDict, Field, model_validator

from weft.domain.confidence import Confidence
from weft.domain.contract_schema import contract_json_schema
from weft.domain.dates import PartialDate

NonEmpty = Annotated[str, Field(min_length=1)]
CitationIndex = Annotated[int, Field(ge=1)]


class _Model(BaseModel):
    model_config = ConfigDict(extra="forbid", frozen=True)


class AnswerKind(StrEnum):
    TEXT = "text"
    PATH = "path"  # 人脉路径
    LIST = "list"  # 条件筛选
    STAT = "stat"  # 聚合统计
    NO_ANSWER = "no_answer"  # 图谱里没有相关信息


class PersonRef(_Model):
    person_id: NonEmpty
    name: NonEmpty
    is_self: bool = Field(default=False, description="本人: rendered as 「我」")


class AnswerSegment(_Model):
    text: NonEmpty
    citations: tuple[CitationIndex, ...] = Field(
        default=(), description="Indices of the citations backing this piece of text"
    )


class Citation(_Model):
    index: CitationIndex
    entry_id: NonEmpty
    entry_excerpt: NonEmpty = Field(description="Quote of the source Entry (记录原文)")
    occurred_on: PartialDate = Field(description="The Entry's 发生日期, with precision")
    confidence: Confidence
    told_by: str | None = Field(default=None, description="Who said it, for 转述 (「据老张说」)")
    pair: tuple[PersonRef, PersonRef] | None = Field(
        default=None, description="The relationship this claim is about, for 「查看…的关系」"
    )
    is_opinion: bool = Field(default=False, description="Quotes 我的评价 (AC-23: 「你的评价」)")


class AnswerListItem(PersonRef):
    subtitle: str | None = Field(default=None, description="e.g. 同学 / 客户")
    citations: list[CitationIndex]


class AnswerStat(_Model):
    count: int = Field(ge=0)
    persons: list[PersonRef]

    @model_validator(mode="after")
    def _count_matches_persons(self) -> Self:
        if self.count != len(self.persons):
            raise ValueError("stat count must equal the number of persons behind it")
        return self


class Answer(_Model):
    kind: AnswerKind
    segments: list[AnswerSegment]
    citations: list[Citation]
    persons: list[PersonRef] = Field(description="Related persons, shown as chips")
    path: list[PersonRef] | None = Field(
        default=None, description="kind = path: ordered chain from the first person to the last"
    )
    items: list[AnswerListItem] | None = Field(default=None, description="kind = list")
    stat: AnswerStat | None = Field(default=None, description="kind = stat")
    follow_ups: list[str] = Field(description="追问建议, e.g. 「他俩什么时候认识的？」")

    @model_validator(mode="after")
    def _citations_resolve(self) -> Self:
        indices = [c.index for c in self.citations]
        if len(indices) != len(set(indices)):
            raise ValueError("citation indices must be unique")
        refs = [i for s in self.segments for i in s.citations]
        refs += [i for item in self.items or [] for i in item.citations]
        unknown = sorted(set(refs) - set(indices))
        if unknown:
            raise ValueError(f"unknown citation indices: {unknown}")
        return self

    @model_validator(mode="after")
    def _body_matches_kind(self) -> Self:
        if self.kind is AnswerKind.PATH and (self.path is None or len(self.path) < 2):
            raise ValueError("a path answer needs a path of at least two persons")
        if self.kind is AnswerKind.LIST and self.items is None:
            raise ValueError("a list answer needs items")
        if self.kind is AnswerKind.STAT and self.stat is None:
            raise ValueError("a stat answer needs stat")
        if self.kind is AnswerKind.NO_ANSWER and self.citations:
            raise ValueError("a no_answer answer cites nothing (AC-38)")
        return self


def answer_json_schema() -> dict[str, Any]:
    """JSON Schema of the Answer contract, consumed by the frontend."""
    return contract_json_schema(Answer, "answer.schema.json")


__all__ = [
    "Answer",
    "AnswerKind",
    "AnswerListItem",
    "AnswerSegment",
    "AnswerStat",
    "Citation",
    "PersonRef",
    "answer_json_schema",
]
