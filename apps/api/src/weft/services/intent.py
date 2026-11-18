"""意图识别 (intent recognition, ADR 0005): one DeepSeek JSON call per message.

Recognition is free (AC-2): it never touches a quota. Clear questions skip the model
(``weft.domain.intent.fast_path``). If the model cannot be reached or answers nonsense, the
message is 无关 and 拿不准 — the user picks 「记下来 / 帮我查」 — so nothing is recorded or
asked by mistake.

The same call writes the 反问 and its options for a message it is not sure about
(intent-clarify AC-1, AC-2: no extra call). When a 反问 is pending, the next message is
sent with it as ``context`` under ``INTENT_CONTEXT_SYSTEM`` (the prompt plus
``CONTEXT_RULES``, which ordinary messages never see), and the model says whether the
message answers it (AC-4); the fast path is skipped then, since a clear question may still be
the answer.

The prompt's examples are invented; none is taken from the intent eval
(``eval/intent/samples.jsonl``) — ``tests/unit/test_eval_intent.py`` checks that.
"""

from __future__ import annotations

import json
import logging
from datetime import date

from weft.domain.intent import (
    ClarifyContext,
    IntentReading,
    Recognition,
    decide,
    fast_path,
    unrecognized,
)
from weft.infra import Infra
from weft.llm import ChatMessage, ChatRequest, LLMError

logger = logging.getLogger(__name__)

WEEKDAYS = ("星期一", "星期二", "星期三", "星期四", "星期五", "星期六", "星期日")

INTENT_SYSTEM = """你是 Weft 的消息分拣员。用户（“我”）用 Weft 记录自己身边的人和事——谁是谁、发生了什么、谁怎么样、我和他们的关系，也会就这些记录提问。
输入是一个 JSON：today 是今天的日期（北京时间），weekday 是今天星期几，text 是用户刚发来的一条消息。
判断这条消息要做什么，只输出一个 JSON 对象：
{"intent": "record" | "ask" | "record_ask" | "chitchat", "confidence": 0 到 1 的小数, "occurred": "YYYY" | "YYYY-MM" | "YYYY-MM-DD" | null, "record_text": 字符串或 null, "question": 字符串或 null, "reply": 字符串或 null, "clarify": 对象或 null}

intent：
- record（记下来）：消息带来了关于某个具体的人的新信息——发生的事、近况、工作、学校、住处、喜好、习惯、性格、家人、关系、我对他的感受或评价、听来的消息。
  口语、吐槽、感叹、带问号的反问，只要说出了新信息，就是 record：
  “阿杰居然把烟戒了，真没想到” → record；“周姐你说气人不气人，又把我的方案拿去邀功了” → record；
  “我能不记得小严吗？我俩穿一条裤子长大的” → record（反问，其实在说我和小严从小一起长大）。
  先用疑问或反问的口气、接着说出一件事或发牢骚的，是在告诉我新情况，也是 record：
  “阿杰不是说戒酒了吗？昨晚又喝趴下了” → record；“周姐凭什么又不批我的假？这个月第二回了” → record。
- ask（帮我查）：想从已经记下的内容里找答案——问某人的情况、经历、时间、关系、谁和谁认识、怎么认识的、统计和列举。
  不一定有问号：“帮我查下老马孩子叫什么”“想不起来阿杰在哪家公司了”“我想知道上次见周姐是什么时候”“列一下做设计的朋友” → ask。
  只是问问题、没有带来新信息的，不要判成 record。
- record_ask（两件事都做）：同一条消息里既有新信息，又有一个要查的问题。
  例：“老马下个月搬去成都了，他老婆是哪里人来着？” → record_ask，record_text = “老马下个月搬去成都了”，question = “老马的老婆是哪里人？”。
  record_text 只放新信息那部分，保留原话；question 改写成一个独立完整的问题（代词换成人名）。
- chitchat（无关）：寒暄、道谢、打招呼、对 Weft 本身说的话或提的要求、和具体的人无关的感慨或天气、测试的话，以及既不用记也不用查的话。
  例：“早啊”“辛苦了”“你能干嘛”“今天好冷”“哈哈哈”。

confidence：你对 intent 的把握。下列情况 confidence 必须低于 0.6：
- 一句话既能理解成在告诉我新信息、也能理解成在问（例如没有问号、只说“X 是不是 Y”“X 好像 Y 吧”这种拿不准的猜测，看不出是要记下还是要查）；
- 话说了一半、指代不明，只提了一个人或一件事、没说要记什么或问什么（“阿杰那边”“周姐的事”“老马那头什么情况”这类话头）。
意图清楚时给 0.85 以上；拿不准时给 0.5 以下。不要给 0.6 到 0.8 之间的含糊分数。

occurred：消息里的事情发生在哪天。以 today 为参照把时间换算成日期，只写到消息说出来的精度，不能晚于 today：
- 说了年份或“去年”“前年”“大三那年”等只能确定到年的时间 → 写年，如 "2019"；
- 说了月份或“上个月”“这个月初”“上周”“前几天”（只能确定到月）→ 写年-月，如 "2026-10"；
  能确定月份的节日写到月：“前年元旦” → 那年的 01，“去年五一” → 那年的 05，“今年中秋” → 中秋所在的月；
- 说了具体某天或“昨天”“前天”“上周三”“上周末”（周末写那个周六）→ 写年-月-日；
- “最近”“这阵子”、只说“今天”、或者没提时间 → null（表示今天）；
- 消息讲的是将来的计划（“下周要去…”）→ null；
- 有好几个时间时，取这条消息主要讲的那件事的时间：“上个月在婚礼上遇到阿杰，他说他前年就离职了” → 上个月。
  ask 和 chitchat 里如果提到事情的时间也照填，没有就 null。

reply：只有 chitchat 时填，一句自然、简短（不超过 20 个字）的回应；其他 intent 填 null。

clarify（反问）：confidence 低于 0.6 时必须填，用来问用户一个具体的问题；confidence 0.85 以上时填 null。格式：
{"question": 反问, "options": [{"label": "记下：…", "intent": "record"}, {"label": "查：…", "intent": "ask", "question": 要查的问题}]}
- question：一句口语化的话（不超过 40 字），点明你拿不准的地方，让用户一看就知道该怎么答。不要问“你是想记下来还是查询”这种空话，要带上这句话里的人和事。
- options：1 到 3 个候选，每个写明点了会怎么做。intent 为 record 的候选，label 以“记下：”开头，后面是要记下的内容；intent 为 ask 的候选，label 以“查：”开头，question 是一个独立完整的问题（代词换成人名）。label 不超过 20 个字。
- 一句话既像在说新情况、又像在问的：给一个“记下”和一个“查”。
  例：“小顾好像要调去深圳了吧” → {"question": "你是想记下小顾要调去深圳，还是想查小顾的工作有什么变动？", "options": [{"label": "记下：小顾要调去深圳了", "intent": "record"}, {"label": "查：小顾的工作变动", "intent": "ask", "question": "小顾的工作最近有什么变动？"}]}
- 只提了一个人或一件事的话头：问想了解哪方面，候选给两三个最可能的具体查询方向，要贴合这句话提到的事，不要照搬例子的说法。
  例：“大刘那档子事” → {"question": "你想查大刘的哪件事？", "options": [{"label": "查：大刘最近怎么样", "intent": "ask", "question": "大刘最近怎么样？"}, {"label": "查：大刘最近遇到了什么事", "intent": "ask", "question": "大刘最近遇到了什么事？"}]}
- question 里提到的选择要和 options 对得上：没有“记下”候选，就不要在 question 里问“要不要记”。
- “记下”候选只在原话里已经有能记下的新信息时才给；只说了“小严的电话”“老马的生日”却没说号码、日期的，不给“记下”。"""

# Sent only when a 反问 is pending (intent clarify AC-4): ordinary messages never see it.
CONTEXT_RULES = """context（反问之后的下一条消息）：这次输入里有 context，说明用户上一条消息 context.original 你拿不准，已经反问了 context.clarify_question，text 是用户接着发来的消息。输出的 JSON 里再加一个字段 "answers_clarification": true | false。先判断 text 是不是在回答这个反问：
- 在回答（说要记下或要查、补充了原话没说清的信息、说“不用了”“算了”，或者还是没说清）→ answers_clarification = true，把原话和回答合在一起理解：
  intent 是合在一起后的意图；record 时 record_text 写合并后要记下的完整内容（原话里的人和事加上回答补充的信息，写成陈述句，不要丢掉回答里的时间和细节）；ask 时 question 写合并后的完整问题；record_ask 时两个都写。occurred 按合并后的内容填。
  说“算了”“不用了”的 → chitchat；合起来还是看不出要记还是要查 → confidence 低于 0.6。这一轮不要再反问，clarify 填 null。
  例：原话“小顾好像要调去深圳了吧”，反问“你是想记下小顾要调去深圳，还是想查小顾的工作有什么变动？”，text“记一下，他下个月就过去” → answers_clarification = true，record，record_text = “小顾下个月要调去深圳了”。
  例：同一个反问，text“查查吧，他之前在哪个部门” → answers_clarification = true，ask，question = “小顾之前在哪个部门？”。
  用户用序数或前后来指代选择时，按反问里提到这些选择的先后顺序对应。例：同一个反问，text“选后一个吧” → 指“查小顾的工作有什么变动” → answers_clarification = true，ask，question = “小顾的工作最近有什么变动？”。
- 不是在回答（说起了别的人或别的事、问了一个和原话无关的问题、打招呼）→ answers_clarification = false，只按 text 本身判断，和没有 context 时一样。
  例：同一个反问，text“晚上约了大刘吃火锅” → answers_clarification = false，record。"""
INTENT_CONTEXT_SYSTEM = INTENT_SYSTEM + "\n\n" + CONTEXT_RULES


def _payload(text: str, today: date, context: ClarifyContext | None) -> str:
    payload: dict[str, object] = {
        "task": "intent",
        "today": today.isoformat(),
        "weekday": WEEKDAYS[today.weekday()],
        "text": text,
    }
    if context is not None:
        payload["context"] = {
            "original": context.original,
            "clarify_question": context.clarify_question,
        }
    return json.dumps(payload, ensure_ascii=False)


async def read(infra: Infra, text: str, context: ClarifyContext | None = None) -> IntentReading:
    """The model's raw reading of ``text`` (before the threshold). Raises ``LLMError``."""
    request = ChatRequest(
        model=infra.llm.model,
        messages=[
            ChatMessage(
                role="system", content=INTENT_SYSTEM if context is None else INTENT_CONTEXT_SYSTEM
            ),
            ChatMessage(role="user", content=_payload(text.strip(), infra.today(), context)),
        ],
        temperature=0.0,
        json_output=True,
    )
    return await infra.llm.chat.chat_json(request, IntentReading)


async def recognize(infra: Infra, text: str, context: ClarifyContext | None = None) -> Recognition:
    """What ``text`` is (AC-2), read together with a pending 反问 if there is one (AC-4).
    Never raises; never counts against a quota."""
    fast = None if context is not None else fast_path(text)
    if fast is not None:
        return fast
    try:
        reading = await read(infra, text, context)
    except LLMError as exc:
        logger.warning("intent recognition failed: %r", exc)
        return unrecognized()
    return decide(
        reading,
        text=text,
        threshold=infra.settings.intent_confidence_threshold,
        today=infra.today(),
        context=context,
    )


__all__ = ["CONTEXT_RULES", "INTENT_CONTEXT_SYSTEM", "INTENT_SYSTEM", "read", "recognize"]
