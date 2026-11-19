"""A typed answer to a 补充追问 turned into a patch of that one field (conversation-context AC-7).

One small model call. What it returns is unchecked here: the service runs it through
``weft.domain.draft_questions.parse_patch`` for the question's field, and anything that
does not pass is 「没理解这个回答」.
"""

from __future__ import annotations

import json
from datetime import date
from typing import Any

from pydantic import BaseModel, ConfigDict

from weft.domain.dates import PartialDate
from weft.domain.draft import DraftQuestion, QuestionField
from weft.domain.taxonomy import Taxonomy
from weft.extraction.llm import ExtractionLLM
from weft.llm import ChatMessage, ChatRequest

ANSWER_SYSTEM = """你帮用户把他对草稿追问的打字回答，转换成对草稿的一处修改。
输入给出记录原文（entry）、追问（question：field、pair、prompt 和候选 options）
和用户的回答（answer）。
只输出 JSON 对象：{"patch": {...}} 或 {"patch": null}。
patch 只能写追问对应的字段，写法和候选里的 patch 一样：
- relationship_type：{"types": [{"category": ..., "subtype": ..., "original": ...}]}，
  category 和 subtype 取自 relationship_types（放不下时用该大类的“其他”），
  original 保留回答里的说法；
- met：{"met_at": "YYYY、YYYY-MM 或 YYYY-MM-DD"}、{"origin": "认识途径"}，或两者都写；
- occurred：{"occurred": "YYYY、YYYY-MM 或 YYYY-MM-DD"}。
回答里的相对时间（“上个月中旬”“去年夏天”“三年前”）以 written_on（写记录的日子）为参照换算；
精度只到回答说到的程度（“上个月中旬”只写到月，“去年”只写年），日期不能晚于 written_on。
回答没有给出这个字段的信息、答非所问、说不知道或想跳过时，patch 为 null。不要编造。"""


class _Reading(BaseModel):
    model_config = ConfigDict(extra="ignore")
    patch: Any = None


def answer_payload(
    *,
    entry_text: str,
    occurred: PartialDate,
    written_on: date,
    question: DraftQuestion,
    text: str,
    taxonomy: Taxonomy,
) -> dict[str, Any]:
    payload: dict[str, Any] = {
        "task": "answer_draft_question",
        "entry": {
            "text": entry_text,
            "occurred": occurred.isoformat(),
            "precision": occurred.precision.value,
        },
        "written_on": written_on.isoformat(),
        "question": {
            "field": question.field.value,
            "pair": list(question.pair) if question.pair else None,
            "prompt": question.prompt,
            "options": [
                {"label": o.label, "patch": o.patch.model_dump(mode="json", exclude_none=True)}
                for o in question.options
            ],
        },
        "answer": text,
    }
    if question.field is QuestionField.RELATIONSHIP_TYPE:
        payload["relationship_types"] = {c.value: n for c, n in taxonomy.options().items()}
    return payload


async def read_answer(llm: ExtractionLLM, payload: dict[str, Any]) -> Any:
    """The model's patch for a typed answer (``None`` if it found none). Raises ``LLMError``."""
    request = ChatRequest(
        model=llm.model,
        temperature=0.0,
        json_output=True,
        messages=[
            ChatMessage(role="system", content=ANSWER_SYSTEM),
            ChatMessage(role="user", content=json.dumps(payload, ensure_ascii=False)),
        ],
    )
    return (await llm.chat.chat_json(request, _Reading)).patch


__all__ = ["ANSWER_SYSTEM", "answer_payload", "read_answer"]
