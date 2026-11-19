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

指代确认 (conversation-context AC-1): when several persons answer to the name the question
uses, or it asks about 「那事」 and the person has several, the model submits
``kind = clarify`` — a question and 2–4 candidates, each with its full question. It is
checked (``answering.clarification``): an unusable one goes back to the model once, then the
answer is 「图谱里没有相关信息」. ``allow_clarify=False`` (the user already picked or typed
who they meant) has the model answer outright: one round only (AC-3).

Two checks in code (``weft.domain.confirming``) keep the model from guessing:

* a confirmation the question already settles is not asked: when the question contains an
  identity word only one candidate has (「我的大学同学老周」: 周涛 is the 大学同学), that
  candidate's question is answered instead, as if it had been picked;
* a question about 「X 那件事」 answered without one, while the facts the tools returned
  hold two or more events about X, goes back to the model once with those events, to ask
  which one is meant.

上文 (AC-9): ``history`` — the user's latest answered questions — is sent with the question
(``HISTORY_RULES``); the model says whether it read the question with it (``used_history``).
"""

from __future__ import annotations

import json
import logging
from collections.abc import Sequence
from dataclasses import dataclass, field

from pydantic import ValidationError

from weft.domain.answer import Answer, AnswerKind
from weft.domain.answering import (
    FinalAnswer,
    answers_about_subjects,
    build_answer,
    clarification,
    clarify_answer,
    unknown_subject,
)
from weft.domain.confirming import (
    identified_option,
    identified_person,
    matter_events,
    matter_of,
)
from weft.domain.conversation import HistoryTurn
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
SENT_BACK_ROUNDS = 2  # after a final answer is sent back: a lookup, then the answer

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
   no_answer 图谱里没有相关信息；clarify 指代确认（见规则 7）。
6. 用简洁的中文回答；follow_ups 给出最多 3 个可以继续问的问题。
7. 指代确认（kind = clarify）：
   - 问题里的称呼用 find_person 查到 2 个及以上的人，而问题本身（以及上文，如果有）看不出是哪一个时，不要猜，也不要把几个人都答一遍，提交 kind = clarify：
     clarify_question 写一句确认问题；options 每个可能的人一项，label 写“称呼（姓名，一句关系描述）”，question 写把称呼换成全名后的完整问题，person 填他的 P 句柄。
     例：问“小林最近忙啥？”，find_person 查到林一凡（同事）和林小雨（表妹）→ clarify_question “你问的是哪位小林？”，options [{{"label": "小林（林一凡，同事）", "question": "林一凡最近忙啥？", "person": "P1"}}, {{"label": "小林（林小雨，表妹）", "question": "林小雨最近忙啥？", "person": "P2"}}]。
   - 问到“那事”“那件事”“那个事儿”这类没说是哪件的事时，先用 read_profile 读这个人身上的事：经历（升职、退休、开店、生病住院……）、和别人之间的事（吵架、闹掰……）、换工作或搬家这类变化，不论早晚都算。有 2 件及以上时提交 clarify，不要自己挑最近的一件，也不要把几件都答一遍：每件事一项，label 写一句话加时间（如“和房东吵架（2025 年 3 月）”），question 写问那件事的完整问题，不填 person。只有 1 件时直接回答那一件。
   - 只有一个可能时直接作答，不要确认：
     · 只查到一个人，或者这个人身上只有一件相关的事；
     · 问题里的身份、关系或全名已经说清是谁：“同事小林”“表妹小林”“林一凡”——查到几个同名的人时，按 note 和关系挑出对得上的那一个直接作答；
     · 上文刚问过其中某一个人（上文问的是林一凡，接着问“小林最近忙啥？”）——就是他，直接作答，used_history 填 true。
   - 只有“他”“她”这类代词、又没有上文可以指代时，问题没有点名任何人，不要确认，提交 kind = no_answer。
   - options 2 到 4 个。clarify 时 segments 留空。"""

HISTORY_RULES = """上文（history）：下面是用户最近几轮问答，较早的在前。
- 当前问题里有“他”“她”“他们”“那”“这事”等指代，或者省略了人物、事情（“那他儿子呢？”“她呢？”“后来呢？”“老家是哪的？”），只靠它自己说不清问的是谁或什么时，按上文补全再查：一般指最近一轮问到的人或事。补全后，subjects 填补全出来的人物，不要填“他”“她”这类代词（上文问老马，“那他儿子呢？”的 subjects 填“老马”）。
- 当前问题自己已经说清楚了问谁、问什么（点名了别的人，或者换了话题），就只按它本身回答，不要套用上文。
- final_answer 的 used_history：理解当前问题时用到了上文就填 true，没用到填 false。
- 上文只用来理解问题；回答仍然只能依据这次工具查到的内容。"""

NO_CLARIFY = "这一次不要提交 kind = clarify：用户已经确认过指的是谁或哪件事了，直接查、直接作答；确实查不到时提交 kind = no_answer。"

NUDGE = "请调用 final_answer 工具提交回答；没有查到相关信息时提交 kind = no_answer。"
LAST_ROUND = (
    "查询次数用完了，不能再调用查询工具。请根据上面已经查到的内容调用 final_answer 提交回答；"
    "没有查到相关信息时提交 kind = no_answer。"
)
OFF_SUBJECT = (
    "回答引用的 evidence 都不是关于{names}的，这样的回答会被当成“图谱里没有相关信息”。"
    "如果答的是和{names}有关的人或事（例如他老婆、他同事），请先查出那个人和{names}的关系"
    "（read_relationship，或 filter_persons 的 relative_to），把这条关系的 E 句柄也写进 evidence，"
    "再重新调用 final_answer；如果查不到这层关系，提交 kind = no_answer。"
)
FINAL_ONLY = [spec for spec in TOOL_SPECS if spec.name == FINAL_ANSWER]
BAD_CLARIFY = (
    "kind = clarify 不能用：{reason}。请改正后重新调用 final_answer；只有一个可能时直接作答。"
)
WHICH_MATTER = (
    "问题问的是“{who}”的那件事，没说是哪件；查到的结果里和{who}有关的事有 {count} 件：{events}。"
    "请提交 kind = clarify，每件事一个候选（label 写一句话加时间，question 写问那件事的完整"
    "问题，不填 person）；不要自己挑一件，也不要都答一遍。"
)


@dataclass(frozen=True)
class Asked:
    answer: Answer  # kind = clarify: a 指代确认 instead of an answer
    tool_calls: list[str] = field(default_factory=list)  # tools the model called, in order
    used_history: bool = False  # the question was read with the 上文 it was sent with


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


async def answer(
    infra: Infra,
    question: str,
    *,
    history: Sequence[HistoryTurn] = (),
    allow_clarify: bool = True,
    settle: bool = True,
) -> Result[Asked]:
    """Answer an already counted question from the session's graph (writes nothing).

    ``history``: the 上文 to read the question with (AC-9). ``allow_clarify``: whether a
    指代确认 may come back instead of an answer (never after one, AC-3). ``settle``: a
    confirmation the question itself settles is answered as that candidate's question
    (once: that answer is not settled again)."""
    text = question.strip()
    tools = AskSession(infra)
    try:
        final = await _converse(infra, tools, text, history, allow_clarify)
    except LLMError as exc:
        logger.warning("ask failed: %r", exc)
        return Err("ask_failed", "问答暂时不可用，请稍后再试")
    calls = [name for name, _ in tools.calls]
    used_history = bool(history) and final is not None and final.used_history
    if final is not None and final.kind is AnswerKind.CLARIFY:
        asked = clarification(final, tools.person_refs())
        if not isinstance(asked, str):  # _converse lets only a usable one through
            persons = [o.person_id for o in asked.options if o.person_id]
            meant = identified_option(text, asked, await tools.identity_words(persons))
            if settle and meant is not None:
                logger.info("ask: the question names %s; no confirmation", meant.label)
                settled = await answer(infra, meant.question, settle=False)
                if isinstance(settled, Err):
                    return settled
                return Ok(
                    Asked(settled.value.answer, calls + settled.value.tool_calls, used_history)
                )
            return Ok(Asked(clarify_answer(asked), calls, used_history))
        final = None
    subjects = await tools.subjects(text, final.subjects) if final else {}
    built = build_answer(final, tools.evidence, tools.person_refs(), subjects)
    return Ok(Asked(answer=built, tool_calls=calls, used_history=used_history))


def _system(infra: Infra, history: Sequence[HistoryTurn], allow_clarify: bool) -> str:
    parts = [ASK_SYSTEM.format(today=infra.today().isoformat())]
    if not allow_clarify:
        parts.append(NO_CLARIFY)
    if history:
        turns = json.dumps([t.to_json() for t in history], ensure_ascii=False)
        parts.append(f"{HISTORY_RULES}\n上文：{turns}")
    return "\n\n".join(parts)


async def _converse(
    infra: Infra,
    tools: AskSession,
    question: str,
    history: Sequence[HistoryTurn] = (),
    allow_clarify: bool = True,
) -> FinalAnswer | None:
    messages = [
        ChatMessage(role="system", content=_system(infra, history, allow_clarify)),
        ChatMessage(role="user", content=question),
    ]
    nudged = False
    sent_back = False  # an unusable 指代确认 goes back to the model once
    matter_asked = False  # so does an answer to 「X 那件事」 that picked one of several
    off_subject_told = False  # and an answer none of whose evidence is about its subject
    calls = MAX_TOOL_ROUNDS + 1  # model calls allowed; a send-back leaves room to act on it
    made = 0
    while made < calls:
        made += 1
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
                    final = FinalAnswer.model_validate(call.arguments)
                except ValidationError as exc:
                    output = {"error": f"final_answer 参数不正确：{exc.errors(include_url=False)}"}
                else:
                    problem = _clarify_problem(final, tools, allow_clarify, history)
                    which = None
                    if problem is None and allow_clarify and not matter_asked:
                        which = await _which_matter(final, tools, question)
                    off = None
                    if problem is None and which is None and not off_subject_told:
                        off = await _off_subject(final, tools, question)
                    if which is not None:
                        matter_asked = True
                        calls = max(calls, made + SENT_BACK_ROUNDS)
                        output = {"error": which}
                    elif off is not None:
                        off_subject_told = True
                        calls = max(calls, made + SENT_BACK_ROUNDS)
                        output = {"error": off}
                    elif problem is None:
                        return final
                    elif sent_back:
                        logger.info("ask: unusable clarify again (%s)", problem)
                        usable = allow_clarify and not isinstance(
                            clarification(final, tools.person_refs()), str
                        )
                        return final if usable else None  # a valid one stands the second time
                    else:
                        sent_back = True
                        calls = max(calls, made + SENT_BACK_ROUNDS)
                        output = {"error": BAD_CLARIFY.format(reason=problem)}
            else:
                output = await tools.run(call.name, call.arguments)
            messages.append(
                ChatMessage(role="tool", tool_call_id=call.id, content=tool_message(output))
            )
    logger.info("ask: no final answer after %d rounds; asking for one", MAX_TOOL_ROUNDS)
    return await _last_round(infra, tools, messages, allow_clarify, history)


async def _last_round(
    infra: Infra,
    tools: AskSession,
    messages: list[ChatMessage],
    allow_clarify: bool,
    history: Sequence[HistoryTurn],
) -> FinalAnswer | None:
    """The rounds are used up: one more call, offering only ``final_answer``, so what the
    tools already returned is answered rather than dropped. Nothing goes back after it."""
    messages.append(ChatMessage(role="user", content=LAST_ROUND))
    result = await infra.llm.chat.chat(
        ChatRequest(
            model=infra.llm.model,
            messages=messages,
            tools=FINAL_ONLY,
            tool_choice="required",
            temperature=0.0,
        )
    )
    for call in result.tool_calls:
        if call.name != FINAL_ANSWER:
            continue
        try:
            final = FinalAnswer.model_validate(call.arguments)
        except ValidationError:
            return None
        return final if _clarify_problem(final, tools, allow_clarify, history) is None else None
    return None


async def _off_subject(final: FinalAnswer, tools: AskSession, question: str) -> str | None:
    """What to send back when ``final`` answers, but none of the evidence it cites concerns
    the persons it is about (its subjects): 「他老婆是谁」 answered from 黄丽's own facts,
    without the relationship that makes her 老张's wife. Such an answer would become
    「图谱里没有相关信息」(``answering.answers_about_subjects``); told once, the model can cite
    the missing link or say no_answer. An unknown subject is never sent back."""
    if final.kind in (AnswerKind.NO_ANSWER, AnswerKind.CLARIFY):
        return None
    cited = [tools.evidence[h] for s in final.segments for h in s.evidence if h in tools.evidence]
    if not cited:
        return None
    subjects = await tools.subjects(question, final.subjects)
    if unknown_subject(subjects) or answers_about_subjects(subjects, cited):
        return None
    names = "、".join(n for n, refs in subjects.items() if any(not r.is_self for r in refs))
    return OFF_SUBJECT.format(names=names or "问题问到的人")


async def _which_matter(final: FinalAnswer, tools: AskSession, question: str) -> str | None:
    """What to send back when ``final`` answers 「X 那件事」 without asking which one, while
    the facts the tools returned hold two or more events about X (AC-1); else ``None``.

    X is every person the words before 「那事」 name (a name the tools looked up, or a
    person's own name). A name standing for several persons is first narrowed with the
    question's identity words (「老家邻居老周」: 周建国, the 老家 neighbour); if it still
    stands for several, which person is meant is left to the model."""
    if final.kind is AnswerKind.CLARIFY:
        return None
    who = matter_of(question)
    if who is None:
        return None
    named: dict[str, set[str]] = {}
    for name, found in tools.lookups.items():
        if name and name in who and found:
            named[name] = {p.id for p in found}
    for p in tools.persons.values():
        if not p.is_self and p.name in who:
            named.setdefault(p.name, {p.id})
    names = [n for n in named if not any(n != m and n in m for m in named)]  # 老张 / 老张的女儿
    if not names:
        return None
    about: set[str] = set()
    for n in names:
        ids = named[n]
        meant = next(iter(ids)) if len(ids) == 1 else await _identified(tools, question, ids)
        if meant is None:
            return None
        about.add(meant)
    events = matter_events(tools.facts_shown.values(), about)
    if len(events) < 2:
        return None
    return WHICH_MATTER.format(who=who, count=len(events), events="；".join(e.text for e in events))


async def _identified(tools: AskSession, question: str, ids: set[str]) -> str | None:
    """Which of ``ids`` (persons one name stands for) the question itself says, if one."""
    said = await tools.identity_words(ids)
    return identified_person(question, {pid: said.get(pid, []) for pid in sorted(ids)})


def _clarify_problem(
    final: FinalAnswer,
    tools: AskSession,
    allow_clarify: bool,
    history: Sequence[HistoryTurn] = (),
) -> str | None:
    """Why a ``clarify`` final answer cannot be used, if it is one that can't — including a
    candidate the 上文 already settled: exactly one of them is someone it just asked about."""
    if final.kind is not AnswerKind.CLARIFY:
        return None
    if not allow_clarify:
        return "用户已经确认过一次，这次要直接作答"
    if len(final.options) == 1:  # one possibility is no choice: answer it
        only = final.options[0]
        return f"只有一个可能（{only.label}），不要确认，直接回答“{only.question}”"
    checked = clarification(final, tools.person_refs())
    if isinstance(checked, str):
        return checked
    talked_about = {name for turn in history for name in turn.persons}
    names = {o.person_id: tools.name_of(o.person_id) for o in checked.options if o.person_id}
    settled = [name for name in names.values() if name in talked_about]
    if len(settled) == 1:
        return f"上文刚问过{settled[0]}，问的就是他，直接回答，used_history 填 true"
    return None


__all__ = [
    "ASK_SYSTEM",
    "HISTORY_RULES",
    "MAX_TOOL_ROUNDS",
    "Asked",
    "answer",
    "ask",
    "charge",
    "check_question",
]
