"""问答 (Ask): DeepSeek tool calling over the fixed query tools (spec 「问答」, AC-36..AC-40).

1. Count one ask against today's quota (Beijing day, AC-40).
2. Let the model call the fixed tools (``weft.services.ask_tools``) — at most
   ``MAX_TOOL_ROUNDS`` rounds — until it submits ``final_answer``. The tools run in the
   session's tenant; the model never sees ids and cannot pass a tenant (AC-39).
3. Build the ``Answer`` from the final answer and the tools' evidence: every claim cites
   the Entries behind it, 转述 / 推测 / 评价 are said in the text, and no evidence means
   「图谱里没有相关信息」(AC-37, AC-38). So is a question about someone the graph does not
   have: the persons it names must resolve, and the answer must be about them — never
   「没有老王，但老张……」 (``AskSession.subjects``, ``build_answer``).
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field

from pydantic import ValidationError

from weft.domain.answer import Answer
from weft.domain.answering import FinalAnswer, build_answer
from weft.domain.quota import LIMIT_REACHED_MESSAGE, QuotaKind, beijing_day, next_reset
from weft.infra import Infra
from weft.llm import ChatMessage, ChatRequest, LLMError
from weft.repositories.usage import UsageRepository
from weft.services._uow import tenant
from weft.services.ask_tools import FINAL_ANSWER, TOOL_SPECS, AskSession, tool_message
from weft.services.results import Err, Ok, Result
from weft.services.usage import limit_for

logger = logging.getLogger(__name__)

MAX_QUESTION_LENGTH = 500
MAX_TOOL_ROUNDS = 6

ASK_SYSTEM = """你是 Weft 的问答助手。用户（“我”）在 Weft 里记录了自己的人际关系图谱，现在就图谱提问。
今天是 {today}（北京时间），相对时间（“最近半年”“今年”）以今天为准换算成日期。

规则：
1. 只能依据工具返回的内容回答，不得凭常识补充或编造。工具都没有查到相关内容时，
   调用 final_answer 提交 kind = no_answer。
2. 问题点名问某个人时，先用 find_person 查这个称呼。查不到就是图谱里没有这个人，直接
   提交 kind = no_answer；不要改查、也不要回答名字相近的人（问“老王”时不要去查“老张”
   “小王”）。final_answer 的 subjects 照原话填问题点名问到的人物。
3. 先调用查询工具，最后必须调用 final_answer 提交回答。segments 是回答文字，每段的
   evidence 填支撑这段话的 E 句柄（只能用工具结果里出现过的）；人物只能用 P 句柄。
4. 可信度为转述（hearsay）的信息，文字里要说明“据某某说”或“据转述”；推测（inferred）
   要说明是推测；引用评价（kind = opinion）要说明“这是你的评价”。
5. kind：text 一般回答；path 人脉路径（path 依次填从起点到终点的 P 句柄）；list 条件筛选
   （items 每人一项，subtitle 写一句说明）；stat 聚合统计（stat_persons 填被计入的每个人）；
   no_answer 图谱里没有相关信息。
6. 用简洁的中文回答；follow_ups 给出最多 3 个可以继续问的问题。"""

NUDGE = "请调用 final_answer 工具提交回答；没有查到相关信息时提交 kind = no_answer。"


@dataclass(frozen=True)
class Asked:
    answer: Answer
    tool_calls: list[str] = field(default_factory=list)  # tools the model called, in order


def _quota_err(infra: Infra) -> Err:
    return Err(
        "quota_exceeded",
        LIMIT_REACHED_MESSAGE,
        {"kind": QuotaKind.ASK.value, "resets_at": next_reset(infra.clock()).isoformat()},
    )


def check_question(question: str) -> Err | None:
    """Why ``question`` cannot be asked at all (before anything is counted), if it can't."""
    text = question.strip()
    if not text:
        return Err("blank_question", "问题不能为空")
    if len(text) > MAX_QUESTION_LENGTH:
        return Err("question_too_long", f"问题不能超过 {MAX_QUESTION_LENGTH} 字")
    return None


async def charge(infra: Infra) -> Err | None:
    """Count one ask against today's quota (AC-40); the quota error if it is used up."""
    async with infra.sql() as session, session.begin():
        kind = QuotaKind.ASK
        allowed = await UsageRepository(session, tenant()).increment_if_below(
            kind, beijing_day(infra.clock()), limit=limit_for(infra, kind)
        )
    return None if allowed else _quota_err(infra)


async def ask(infra: Infra, question: str) -> Result[Asked]:
    refused = check_question(question) or await charge(infra)
    if refused is not None:
        return refused
    return await answer(infra, question)


async def answer(infra: Infra, question: str) -> Result[Asked]:
    """Answer an already counted question from the session's graph (writes nothing)."""
    text = question.strip()
    tools = AskSession(infra)
    try:
        final = await _converse(infra, tools, text)
    except LLMError as exc:
        logger.warning("ask failed: %r", exc)
        return Err("ask_failed", "问答暂时不可用，请稍后再试")
    subjects = await tools.subjects(text, final.subjects) if final else {}
    answer = build_answer(final, tools.evidence, tools.person_refs(), subjects)
    return Ok(Asked(answer=answer, tool_calls=[name for name, _ in tools.calls]))


async def _converse(infra: Infra, tools: AskSession, question: str) -> FinalAnswer | None:
    messages = [
        ChatMessage(role="system", content=ASK_SYSTEM.format(today=infra.today().isoformat())),
        ChatMessage(role="user", content=question),
    ]
    nudged = False
    for _ in range(MAX_TOOL_ROUNDS + 1):
        result = await infra.llm.chat.chat(
            ChatRequest(
                model=infra.llm.model,
                messages=messages,
                tools=TOOL_SPECS,
                tool_choice="required" if nudged else "auto",
                temperature=0.0,
            )
        )
        if not result.tool_calls:
            if nudged:
                return None
            messages += [
                ChatMessage(role="assistant", content=result.content or ""),
                ChatMessage(role="user", content=NUDGE),
            ]
            nudged = True
            continue
        messages.append(
            ChatMessage(role="assistant", content=result.content, tool_calls=result.tool_calls)
        )
        for call in result.tool_calls:
            if call.name == FINAL_ANSWER:
                try:
                    return FinalAnswer.model_validate(call.arguments)
                except ValidationError as exc:
                    output = {"error": f"final_answer 参数不正确：{exc.errors(include_url=False)}"}
            else:
                output = await tools.run(call.name, call.arguments)
            messages.append(
                ChatMessage(role="tool", tool_call_id=call.id, content=tool_message(output))
            )
    logger.info("ask: no final answer after %d rounds", MAX_TOOL_ROUNDS)
    return None


__all__ = [
    "ASK_SYSTEM",
    "MAX_TOOL_ROUNDS",
    "Asked",
    "answer",
    "ask",
    "charge",
    "check_question",
]
