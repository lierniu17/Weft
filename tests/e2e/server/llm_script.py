"""Hand-written LLM answers for the e2e:bot scenarios (fixture authoring only).

``respond(path, body)`` plays the provider for one request when a fixture is being authored
(``WEFT_E2E_AUTHOR=1``): what an honest DeepSeek answer to that exact request looks like.
The e2e run itself never imports this module; it replays the saved fixtures.

Each message a BOT sends is first read by 意图识别 (``INTENT`` below: what it is, when it
happened; ``INTENT_AFTER`` for a message sent while a 反问 is open, read with it as context;
``INTENT_CONFIRM`` while 问答's 指代确认 is open); each Entry text (spec 「端到端验收用例」)
then maps to its enrichment result, and a typed answer to a 补充追问 to its patch
(``QUESTION_ANSWERS``). Questions are answered by ``ASK`` (one tool, then the answer) or
``CONVERSATIONS`` (several turns, or depending on the 上文 the question is sent with).
Graphiti's entity step is answered with no entities: every person, fact, relationship and
feeling comes from Weft's own enrichment call, which is what the Draft is built from.
"""

from __future__ import annotations

import json
from typing import Any

# --- Weft enrichment answers, keyed by Entry text --------------------------------------


def fact(subject: str, predicate: str, obj: str, confidence: str, **rest: Any) -> dict[str, Any]:
    return {"subject": subject, "predicate": predicate, "object": obj, "confidence": confidence, **rest}


def rel(a: str, b: str, types: list[tuple[str, str, str]], confidence: str, **rest: Any) -> dict:
    return {
        "pair": [a, b],
        "types": [{"category": c, "subtype": s, "original": o} for c, s, o in types],
        "confidence": confidence,
        **rest,
    }


def feel(src: str, dst: str, dimension: str, level: str, confidence: str) -> dict[str, Any]:
    return {"from": src, "to": dst, "dimension": dimension, "level": level, "confidence": confidence}


def enrichment(persons: list[str] | None = None, **sections: list[dict[str, Any]]) -> dict:
    return {
        **({"persons": persons} if persons else {}),
        "facts": sections.get("facts", []),
        "relationships": sections.get("relationships", []),
        "feelings": sections.get("feelings", []),
        "profile": sections.get("profile", []),
        **({"questions": sections["questions"]} if "questions" in sections else {}),
    }


def type_option(label: str, subtype: str, category: str = "social") -> dict[str, Any]:
    """A 补充追问 option setting the relationship type (conversation context AC-4)."""
    return {
        "label": label,
        "patch": {"types": [{"category": category, "subtype": subtype, "original": label}]},
    }


# Conversation context BOT-3 / BOT-4 / BOT-6: what the Draft asks (补充追问).
XIAOLI_DINNER = "今天和小李吃饭了"
XIAOLI_ASKED = "小李是你的同事还是同学？"
LAOMA = "前阵子见了老马"
LAOMA_ASKED = "前阵子是什么时候？"


ENRICH: dict[str, dict[str, Any]] = {
    # BOT-2: 老张's daughter has no name, so she is the 称谓人物 「老张的女儿」 with her own
    # fact and a 父母 relationship to 老张 (pair[0] 是 pair[1] 的 父母).
    "今天和老张吃饭，他说他女儿明年高考，他最近迷上了钓鱼，不过他不喝酒。": enrichment(
        persons=["老张", "老张的女儿"],
        facts=[
            fact("老张", "LIKES", "钓鱼", "self_told"),
            fact("老张", "DISLIKES", "喝酒", "self_told"),
            fact("老张的女儿", "EXPERIENCED", "明年高考", "self_told", valid_at="2027"),
        ],
        relationships=[rel("老张", "老张的女儿", [("kin", "父母", "女儿")], "self_told")],
    ),
    # BOT-3 (preconditions, then the two Entries)
    "张伟是我的同事。": enrichment(
        relationships=[rel("我", "张伟", [("social", "同事", "同事")], "witnessed")],
    ),
    "张强是我家邻居。": enrichment(
        relationships=[rel("我", "张强", [("social", "邻居", "邻居")], "witnessed")],
    ),
    "老张今天升职了": enrichment(
        facts=[fact("老张", "EXPERIENCED", "升职", "witnessed", valid_at="2026-11-16")],
    ),
    "老张请大家喝奶茶": enrichment(
        facts=[fact("老张", "EXPERIENCED", "请大家喝奶茶", "witnessed", valid_at="2026-11-16")],
    ),
    # BOT-4
    "小李说他 2023 年进了字节跳动，一直干到现在。": enrichment(
        facts=[fact("小李", "WORKS_AT", "字节跳动", "self_told", valid_at="2023")],
    ),
    "小李跟我说他上个月跳槽去了阿里": enrichment(
        facts=[fact("小李", "WORKS_AT", "阿里巴巴", "self_told", valid_at="2026-10")],
    ),
    "听小王说小李又去了腾讯": enrichment(
        facts=[fact("小李", "WORKS_AT", "腾讯", "hearsay", valid_at="2026-11")],
    ),
    # BOT-6 / BOT-7 / BOT-10 / BOT-11
    "老张是个急性子。": enrichment(facts=[fact("老张", "HAS_TRAIT", "急性子", "witnessed")]),
    "周末和老张去水库钓鱼。": enrichment(
        facts=[fact("老张", "LIKES", "钓鱼", "witnessed")],
        relationships=[rel("我", "老张", [("social", "朋友", "钓友")], "witnessed")],
    ),
    "老张说小李升职了，他俩是同事。": enrichment(
        facts=[fact("小李", "EXPERIENCED", "升职", "hearsay", valid_at="2026-11")],
        relationships=[rel("老张", "小李", [("social", "同事", "同事")], "hearsay")],
    ),
    # BOT-8
    "老张和陈静是我大学同学。": enrichment(
        relationships=[
            rel("我", "老张", [("social", "同学", "大学同学")], "witnessed"),
            rel("我", "陈静", [("social", "同学", "大学同学")], "witnessed"),
        ],
    ),
    "老张是我的邻居，人很热心。": enrichment(
        facts=[fact("老张", "HAS_TRAIT", "热心", "witnessed")],
        relationships=[rel("我", "老张", [("social", "邻居", "邻居")], "witnessed")],
    ),
    # BOT-12
    "读大学时在社团认识了小李": enrichment(
        relationships=[
            rel(
                "我",
                "小李",
                [("social", "同学", "社团")],
                "witnessed",
                met_at="2015",
                origin="大学社团",
                status="active",
            )
        ],
    ),
    # BOT-13
    "上个月和小李吃饭聊到很晚，我们挺亲近的。": enrichment(
        relationships=[rel("我", "小李", [("social", "朋友", "朋友")], "witnessed")],
        feelings=[feel("我", "小李", "closeness", "close", "witnessed")],
    ),
    "随便写的一句话": enrichment(),
    "周末和小李打球，感觉他最近对我挺冷淡的，我倒还是把他当好兄弟": enrichment(
        relationships=[rel("我", "小李", [("social", "朋友", "好兄弟")], "witnessed")],
        feelings=[feel("小李", "我", "closeness", "casual", "inferred")],
    ),
    # Intent routing BOT-1 / BOT-12: the year is said in the message, so it is the occurred date.
    "2015 年读大学时在社团认识了小李": enrichment(
        relationships=[
            rel(
                "我",
                "小李",
                [("social", "同学", "社团")],
                "witnessed",
                met_at="2015",
                origin="大学社团",
                status="active",
            )
        ],
    ),
    # Intent routing BOT-3: the new-information part of 「老张升职了，他现在在哪个部门？」.
    "老张升职了": enrichment(facts=[fact("老张", "EXPERIENCED", "升职", "witnessed")]),
    # Intent routing BOT-4: 拿不准, then 记下来 — a guess, so 推测.
    "老张最近好像换工作了吧": enrichment(
        facts=[fact("老张", "EXPERIENCED", "换工作", "inferred")],
    ),
    # Intent routing BOT-6: read as a 记录 (scripted), though it carries no new information.
    "老张喜欢什么": enrichment(),
    # Intent clarify BOT-2 / BOT-4: 原话 + 回答, merged by the reading; 上个月 is October.
    "老周上个月被裁了": enrichment(
        facts=[fact("老周", "EXPERIENCED", "被裁", "witnessed", valid_at="2026-10")],
    ),
    # Intent clarify BOT-3: the unrelated message after the 反问.
    "今天和小林吃饭了": enrichment(persons=["小林"]),
    # Conversation context BOT-3 / BOT-6: who 小李 is to me is not said — the Draft asks.
    XIAOLI_DINNER: enrichment(
        persons=["小李"],
        facts=[fact("小李", "EXPERIENCED", "和我吃饭", "witnessed")],
        questions=[
            {
                "field": "relationship_type",
                "pair": ["我", "小李"],
                "prompt": XIAOLI_ASKED,
                "options": [type_option("同事", "同事"), type_option("同学", "同学")],
            }
        ],
    ),
    # Conversation context BOT-4: 「前阵子」 gives no month — the Draft asks when it was.
    LAOMA: enrichment(
        persons=["老马"],
        facts=[fact("老马", "EXPERIENCED", "和我见面", "witnessed")],
        questions=[
            {
                "field": "occurred",
                "prompt": LAOMA_ASKED,
                "options": [
                    {"label": "这个月", "patch": {"occurred": "2026-11"}},
                    {"label": "上个月", "patch": {"occurred": "2026-10"}},
                    {"label": "两三个月前", "patch": {"occurred": "2026-09"}},
                ],
            }
        ],
    ),
}

# A typed answer to a 补充追问 (自己填), keyed by (question prompt, answer): the patch of that
# question's field only, read against the day of writing (2026-11-16).
QUESTION_ANSWERS: dict[tuple[str, str], dict[str, Any] | None] = {
    # Conversation context BOT-4: 上个月中旬 is October, said to the month.
    (LAOMA_ASKED, "大概上个月中旬"): {"occurred": "2026-10"},
}

# Person matching: (mention, candidate names in the order sent) -> decision.
MATCH: dict[tuple[str, tuple[str, ...]], dict[str, Any]] = {
    ("张强", ("张伟",)): {"decision": "new", "candidate_indices": []},
    ("老张", ("张伟", "张强")): {"decision": "ambiguous", "candidate_indices": [1, 2]},
    ("老张", ("张强", "张伟")): {"decision": "ambiguous", "candidate_indices": [1, 2]},
}

# --- 意图识别 (intent routing) ---------------------------------------------------------
# What an honest reading of each message looks like on the e2e day (2026-11-16, a Monday):
# occurred only when the message says when; 「周末」 is the Saturday just past.


def intent(
    kind: str,
    confidence: float,
    occurred: str | None = None,
    clarify: dict[str, Any] | None = None,
    **rest: str,
) -> dict:
    return {
        "intent": kind,
        "confidence": confidence,
        "occurred": occurred,
        "record_text": rest.get("record_text"),
        "question": rest.get("question"),
        "reply": rest.get("reply"),
        **({"clarify": clarify} if clarify else {}),
    }


def asks_back(question: str, *options: dict[str, Any]) -> dict[str, Any]:
    """The 反问 a reading writes when it is not sure (intent clarify): question + options."""
    return {"question": question, "options": list(options)}


def option(label: str, kind: str, question: str | None = None) -> dict[str, Any]:
    return {"label": label, "intent": kind, "question": question}


def intent_after(kind: str, confidence: float, *, answers: bool, **rest: str | None) -> dict:
    """A reading with a 反问 as context: whether the message answers it, and the merged
    ``record_text`` / ``question`` (原话 + 回答)."""
    return {
        **intent(kind, confidence, rest.get("occurred")),
        "record_text": rest.get("record_text"),
        "question": rest.get("question"),
        "reply": rest.get("reply"),
        "answers_clarification": answers,
    }


# Intent clarify BOTs: the 反问s, quoted again as the context of the next message.
ZHOU_UNLUCKY = "老周最近好像不太顺吧"
ZHOU_NEWS = "老周那事后来咋样了"
ZHOU_NEWS_ASKED = "你是想查老周哪件事，还是想记下他的新情况？"
JIE = "阿杰这人吧，怎么说呢"
JIE_ASKED = "你是想记下你对阿杰的看法，还是想查阿杰是个什么样的人？"


INTENT: dict[str, dict[str, Any]] = {
    # 记录 sent through the composer by the earlier BOTs
    "今天和老张吃饭，他说他女儿明年高考，他最近迷上了钓鱼，不过他不喝酒。": intent("record", 0.95),
    "老张今天升职了": intent("record", 0.95),
    "老张请大家喝奶茶": intent("record", 0.9),
    "小李跟我说他上个月跳槽去了阿里": intent("record", 0.95, "2026-10"),
    "听小王说小李又去了腾讯": intent("record", 0.9),
    "周末和小李打球，感觉他最近对我挺冷淡的，我倒还是把他当好兄弟": intent(
        "record", 0.95, "2026-11-14"
    ),
    "老张是个急性子。": intent("record", 0.95),
    # BOT-13: a test sentence is 无关; the BOT then picks 记下来.
    "随便写的一句话": intent("chitchat", 0.9, reply="好的，想记点什么随时告诉我。"),
    # Intent routing BOT-1 / BOT-12
    "2015 年读大学时在社团认识了小李": intent("record", 0.95, "2015"),
    # Intent routing BOT-3: new information and a question in one message
    "老张升职了，他现在在哪个部门？": intent(
        "record_ask",
        0.9,
        record_text="老张升职了",
        question="老张现在在哪个部门？",
    ),
    # Intent routing BOT-4: thanks, then a guess that could be either (拿不准)
    "谢谢": intent("chitchat", 0.98, reply="不客气，有想记下的事随时告诉我。"),
    "老张最近好像换工作了吧": intent("record", 0.5),
    # Intent routing BOT-6: the spec replays this question as a 记录 (a misreading the user
    # then corrects with 改为提问).
    "老张喜欢什么": intent("record", 0.8),
    # Intent clarify BOT-1: a guess that could be a note or a question — asked back.
    ZHOU_UNLUCKY: intent(
        "record",
        0.5,
        clarify=asks_back(
            "你是想记下“老周最近不太顺”，还是想查老周最近怎么样？",
            option("记下：老周最近不太顺", "record"),
            option("查：老周最近怎么样", "ask", "老周最近怎么样？"),
        ),
    ),
    # Intent clarify BOT-2 / BOT-4: 「那事」 is unclear — which thing, or news to note?
    ZHOU_NEWS: intent(
        "ask",
        0.45,
        clarify=asks_back(
            ZHOU_NEWS_ASKED,
            option("查：老周最近怎么样", "ask", "老周最近怎么样？"),
            option("记下：老周有新情况", "record"),
        ),
    ),
    # Intent clarify BOT-3: half a sentence about 阿杰 — asked back; then an unrelated record.
    JIE: intent(
        "record",
        0.4,
        clarify=asks_back(
            JIE_ASKED,
            option("记下：对阿杰的看法", "record"),
            option("查：阿杰是个什么样的人", "ask", "阿杰是个什么样的人？"),
        ),
    ),
    "今天和小林吃饭了": intent("record", 0.95),
    # Conversation context BOT-3 / BOT-6 and BOT-4: records that leave something out.
    XIAOLI_DINNER: intent("record", 0.95),
    LAOMA: intent("record", 0.92),
}

# A message sent while a 反问 is open, keyed by (原话, 反问, message).
INTENT_AFTER: dict[tuple[str, str, str], dict[str, Any]] = {
    # Intent clarify BOT-2 / BOT-4: the answer says what to do and adds the news.
    (ZHOU_NEWS, ZHOU_NEWS_ASKED, "想记一下，他上个月被裁了"): intent_after(
        "record", 0.92, answers=True, occurred="2026-10", record_text="老周上个月被裁了"
    ),
    # Intent clarify BOT-3: a vague answer — still 拿不准, and never asked back twice.
    (JIE, JIE_ASKED, "嗯……"): intent_after("record", 0.3, answers=True),
}

# Conversation context BOTs: 问答 over the seed graph (two 老周; 老张 and his wife 黄丽).
LIKES = "老周喜欢什么？"
WHICH = "你问的是哪位老周？"
TAO_LIKES = "周涛喜欢什么？"
JIANGUO_LIKES = "周建国喜欢什么？"
WORKS = "老张在哪上班？"
WIFE = "那他老婆呢？"

# A message sent while 问答's 指代确认 is open, keyed by (问题, 确认问题, message): whether it
# says which one was meant, and the full question then.
INTENT_CONFIRM: dict[tuple[str, str, str], dict[str, Any]] = {
    # BOT-2: 「邻居那个」 is 周建国, the neighbour from 老家.
    (LIKES, WHICH, "邻居那个"): intent_after("ask", 0.93, answers=True, question=JIANGUO_LIKES),
    # BOT-6: a new question while the 确认 is open — not an answer to it.
    (LIKES, WHICH, WORKS): intent_after("ask", 0.95, answers=False, question=WORKS),
}

# --- 问答 ----------------------------------------------------------------------------


def _tool_outputs(body: dict[str, Any]) -> list[dict[str, Any]]:
    return [json.loads(m["content"]) for m in body["messages"] if m.get("role") == "tool"]


def _ask_relationship(out: dict[str, Any]) -> dict[str, Any]:
    rel_e = out["relationship"]["evidence"]
    told = [t["evidence"] for t in out["timeline"] if t.get("confidence") == "hearsay"]
    return {
        "kind": "text",
        "segments": [
            {"text": "据小王说，他们以前是大学室友，", "evidence": [rel_e]},
            {"text": "今年九月因为借钱的事闹掰了，目前关系紧张。", "evidence": told[:1] or [rel_e]},
        ],
        "persons": out["pair"],
        "follow_ups": ["他们是怎么认识的？"],
    }


def _ask_path(out: dict[str, Any]) -> dict[str, Any]:
    path = [p["person"] for p in out["path"]]
    evidence = [link["evidence"] for link in out.get("links", [])]
    if out.get("direct_relationship"):
        evidence.append(out["direct_relationship"]["evidence"])
    return {
        "kind": "path",
        "segments": [{"text": "你是通过老张认识小王的。", "evidence": evidence}],
        "path": path,
        "persons": path[1:],
    }


def _ask_list(out: dict[str, Any]) -> dict[str, Any]:
    items = [
        {
            "person": p["person"],
            "subtitle": "喜欢露营",
            "evidence": [f["evidence"] for f in p.get("facts", [])],
        }
        for p in out["persons"]
    ]
    return {
        "kind": "list",
        "segments": [{"text": f"{len(items)} 个人喜欢露营：", "evidence": []}],
        "items": items,
    }


def _ask_profile(out: dict[str, Any]) -> dict[str, Any]:
    evidence = [f["evidence"] for f in out.get("facts", [])]
    return {
        "kind": "text",
        "segments": [{"text": "老张是你的邻居，人很热心。", "evidence": evidence}],
        "persons": [out["person"]["person"]],
    }


def _ask_department(out: dict[str, Any]) -> dict[str, Any]:
    # The graph knows where 老张 works, not his department; nothing about 升职 (unconfirmed).
    work = [f["evidence"] for f in out.get("facts", []) if f.get("predicate") == "WORKS_AT"]
    return {
        "kind": "text",
        "subjects": ["老张"],
        "segments": [
            {"text": "老张在字节跳动工作，", "evidence": work},
            {"text": "图谱里没有记他在哪个部门。", "evidence": []},
        ],
        "persons": [out["person"]["person"]],
    }


def _ask_temper(out: dict[str, Any]) -> dict[str, Any]:
    traits = [f["evidence"] for f in out.get("facts", []) if f.get("predicate") == "HAS_TRAIT"]
    return {
        "kind": "text",
        "subjects": ["老张"],
        "segments": [{"text": "老张是个急性子。", "evidence": traits}],
        "persons": [out["person"]["person"]],
    }


def _ask_unknown(out: dict[str, Any]) -> dict[str, Any]:
    # find_person found nobody: 图谱里没有相关信息 (AC-38).
    return {"kind": "no_answer", "subjects": ["老张"], "segments": []}


def _ask_unknown_zhou(out: dict[str, Any]) -> dict[str, Any]:
    # The seed graph has 周涛, nobody called 老周: no answer, no guessing at a similar name.
    return {"kind": "no_answer", "subjects": ["老周"], "segments": []}


ASK: dict[str, tuple[tuple[str, dict[str, Any]], Any]] = {
    "老张和小李是什么关系？": (
        ("read_relationship", {"person_a": "老张", "person_b": "小李"}),
        _ask_relationship,
    ),
    "我是怎么认识小王的？": (("find_path", {"from_person": "我", "to_person": "小王"}), _ask_path),
    "谁喜欢露营？": (
        ("filter_persons", {"predicate": "LIKES", "object_keywords": ["露营"]}),
        _ask_list,
    ),
    "老张是什么样的人？": (("read_profile", {"person": "老张"}), _ask_profile),
    # intent routing BOT-3 (the question part), BOT-5, BOT-6 (after 改为提问)
    "老张现在在哪个部门？": (("read_profile", {"person": "老张"}), _ask_department),
    "老张是个什么性子？": (("read_profile", {"person": "老张"}), _ask_temper),
    "老张喜欢什么": (("find_person", {"name": "老张"}), _ask_unknown),
    # intent clarify BOT-1 (查：老周最近怎么样)
    "老周最近怎么样？": (("find_person", {"name": "老周"}), _ask_unknown_zhou),
}


HISTORY_MARKER = "\n上文："  # weft.services.ask: the 上文 JSON follows it in the system prompt


def _history(body: dict[str, Any]) -> list[str]:
    """The questions of the 上文 a Q&A request carries (oldest first; [] if none)."""
    system = (body.get("messages") or [{}])[0].get("content") or ""
    if HISTORY_MARKER not in system:
        return []
    return [t["question"] for t in json.loads(system.rsplit(HISTORY_MARKER, 1)[1])]


def _handle(outputs: list[dict[str, Any]], name: str) -> str:
    """The P handle the tools gave the person called (or also known as) ``name``."""
    for out in outputs:
        people = [*out.get("persons", []), *([out["person"]] if "person" in out else [])]
        for p in people:
            if isinstance(p, dict) and (p.get("name") == name or name in p.get("aliases", [])):
                return str(p["person"])
    raise AssertionError(f"the tools returned nobody called {name}")


def _facts(out: dict[str, Any], predicate: str) -> list[str]:
    return [f["evidence"] for f in out.get("facts", []) if f.get("predicate") == predicate]


def _likes(name: str, liked: str) -> Any:
    """「X喜欢什么？」 for one known person: read the profile, answer from its LIKES facts."""

    def turn(n: int, outputs: list[dict[str, Any]], history: list[str]) -> tuple[str, dict]:
        if n == 0:
            return "read_profile", {"person": name}
        out = outputs[-1]
        return "final_answer", {
            "kind": "text",
            "subjects": [name],
            "segments": [{"text": f"{name}喜欢{liked}。", "evidence": _facts(out, "LIKES")}],
            "persons": [out["person"]["person"]],
        }

    return turn


def _which_laozhou(n: int, outputs: list[dict[str, Any]], history: list[str]) -> tuple[str, dict]:
    # find_person finds 周涛 (alias 老周) and 周建国 (老周): which one is not said — confirm.
    assert history == [], f"「{LIKES}」 is only scripted without 上文, not with {history}"
    if n == 0:
        return "find_person", {"name": "老周"}
    return "final_answer", {
        "kind": "clarify",
        "subjects": ["老周"],
        "clarify_question": WHICH,
        "options": [
            {
                "label": "老周（周涛，大学同学）",
                "question": TAO_LIKES,
                "person": _handle(outputs, "周涛"),
            },
            {
                "label": "老周（周建国，老家的老邻居）",
                "question": JIANGUO_LIKES,
                "person": _handle(outputs, "周建国"),
            },
        ],
    }


def _works(n: int, outputs: list[dict[str, Any]], history: list[str]) -> tuple[str, dict]:
    assert history == [], f"「{WORKS}」 is only scripted without 上文, not with {history}"
    if n == 0:
        return "read_profile", {"person": "老张"}
    out = outputs[-1]
    return "final_answer", {
        "kind": "text",
        "subjects": ["老张"],
        "segments": [{"text": "老张在字节跳动上班。", "evidence": _facts(out, "WORKS_AT")}],
        "persons": [out["person"]["person"]],
    }


def _wife(n: int, outputs: list[dict[str, Any]], history: list[str]) -> tuple[str, dict]:
    if history == []:
        # 「不接上文」: on its own nobody is named — 图谱里没有相关信息.
        return "final_answer", {"kind": "no_answer", "segments": []}
    assert history == [WORKS], f"「{WIFE}」 is not scripted with the 上文 {history}"
    # 「他」 is 老张 of the question before: find him, then his wife 黄丽.
    if n == 0:
        return "find_person", {"name": "老张"}
    if n == 1:
        return "read_relationship", {"person_a": _handle(outputs, "张伟"), "person_b": "黄丽"}
    pair = outputs[-1]
    married = pair["relationship"]["evidence"]
    return "final_answer", {
        "kind": "text",
        "subjects": ["老张"],
        "segments": [{"text": "老张的老婆是黄丽。", "evidence": [married]}],
        "persons": [pair["pair"][1]],
        "used_history": True,
    }


# Questions answered in several turns, or differently with the 上文: turn n gets the tool
# outputs so far and the 上文's questions, and returns the next call.
CONVERSATIONS: dict[str, Any] = {
    LIKES: _which_laozhou,  # conversation context BOT-1 / BOT-2 / BOT-6
    TAO_LIKES: _likes("周涛", "钓鱼"),  # BOT-1: 老周（周涛） clicked
    JIANGUO_LIKES: _likes("周建国", "下象棋"),  # BOT-2: 「邻居那个」
    WORKS: _works,  # BOT-5 / BOT-6
    WIFE: _wife,  # BOT-5 / BOT-6, and 「不接上文」
}

# --- plumbing ----------------------------------------------------------------------------


def chat(content: str | None, tool_calls: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    message: dict[str, Any] = {"role": "assistant", "content": content}
    if tool_calls:
        message["tool_calls"] = tool_calls
    return {
        "id": "chatcmpl-weft-e2e",
        "object": "chat.completion",
        "created": 1763258400,
        "model": "deepseek-chat",
        "choices": [
            {
                "index": 0,
                "message": message,
                "finish_reason": "tool_calls" if tool_calls else "stop",
            }
        ],
        "usage": {"prompt_tokens": 0, "completion_tokens": 0, "total_tokens": 0},
    }


def _call(turn: int, name: str, args: dict[str, Any]) -> list[dict[str, Any]]:
    return [
        {
            "id": f"call_{turn}",
            "type": "function",
            "function": {"name": name, "arguments": json.dumps(args, ensure_ascii=False)},
        }
    ]


def _task(body: dict[str, Any]) -> dict[str, Any] | None:
    first = next((m for m in body.get("messages", []) if m.get("role") == "user"), None)
    try:
        payload = json.loads((first or {}).get("content") or "")
    except ValueError:
        return None
    return payload if isinstance(payload, dict) and "task" in payload else None


def _summary(task: dict[str, Any]) -> str:
    if task["task"] == "summarize_person":
        parts = [f"{i['field']}{i['value']}" for i in task["identity"]]
        for f in task["facts"]:
            note = {"history": "（以前）", "unverified": "（待核实）"}.get(f["status"], "")
            hedge = "据说" if f["confidence"] == "转述" else ""
            parts.append(f"{hedge}{f['label']}{f['object']}{note}")
        parts += [f"你觉得{o}" for o in task["opinions"]]
        return f"{task['person']['name']}：" + "；".join(parts) + "。"
    types = "、".join(t["subtype"] for t in task["types"]) or "关系"
    status = f"，目前{task['status']}" if task.get("status") else ""
    return f"{task['pair'][0]}和{task['pair'][1]}是{types}{status}。"


def respond(path: str, body: dict[str, Any]) -> tuple[int, dict[str, Any]]:
    if path.endswith("/embeddings"):
        # No vectors in e2e: Weft writes without them (best effort) and no BOT searches by vector.
        return 503, {"error": {"message": "embeddings are not available in e2e"}}

    messages = body.get("messages") or []
    last = messages[-1].get("content") or "" if messages else ""
    if "ExtractedEntities" in last:
        return 200, chat(json.dumps({"extracted_entities": []}))

    tools = {t["function"]["name"] for t in body.get("tools") or []}
    if "final_answer" in tools:
        question = messages[1]["content"]
        turn = sum(m.get("role") == "assistant" for m in messages)
        if question in CONVERSATIONS:
            name, args = CONVERSATIONS[question](turn, _tool_outputs(body), _history(body))
            return 200, chat("", _call(turn, name, args))
        call, answer = ASK[question]
        outputs = _tool_outputs(body)
        if not outputs:
            return 200, chat("", _call(0, *call))
        return 200, chat("", _call(1, "final_answer", answer(outputs[-1])))

    task = _task(body)
    if task is None:
        raise AssertionError(f"no scripted answer for {json.dumps(body, ensure_ascii=False)[:400]}")
    if task["task"] == "intent" and (task.get("context") or {}).get("kind") == "confirm":
        ctx = task["context"]
        key = (ctx["original"], ctx["clarify_question"], task["text"])
        if key not in INTENT_CONFIRM:
            raise AssertionError(f"no scripted intent for 「{key[2]}」 after the 确认 「{key[1]}」")
        return 200, chat(json.dumps(INTENT_CONFIRM[key], ensure_ascii=False))
    if task["task"] == "intent" and "context" in task:
        ctx = task["context"]
        key = (ctx["original"], ctx["clarify_question"], task["text"])
        if key not in INTENT_AFTER:
            raise AssertionError(f"no scripted intent for 「{key[2]}」 after the 反问 「{key[1]}」")
        return 200, chat(json.dumps(INTENT_AFTER[key], ensure_ascii=False))
    if task["task"] == "intent":
        text = task["text"]
        if text not in INTENT:
            raise AssertionError(f"no scripted intent for message 「{text}」")
        return 200, chat(json.dumps(INTENT[text], ensure_ascii=False))
    if task["task"] == "enrich":
        text = task["entry"]["text"]
        if text not in ENRICH:
            raise AssertionError(f"no scripted enrichment for Entry 「{text}」")
        return 200, chat(json.dumps(ENRICH[text], ensure_ascii=False))
    if task["task"] == "match_person":
        key = (task["mention"], tuple(c["name"] for c in task["candidates"]))
        decision = MATCH.get(key, {"decision": "new", "candidate_indices": []})
        return 200, chat(json.dumps(decision, ensure_ascii=False))
    if task["task"] == "answer_draft_question":
        key = (task["question"]["prompt"], task["answer"])
        if key not in QUESTION_ANSWERS:
            raise AssertionError(f"no scripted patch for 「{key[1]}」 answering 「{key[0]}」")
        return 200, chat(json.dumps({"patch": QUESTION_ANSWERS[key]}, ensure_ascii=False))
    if task["task"] in ("summarize_person", "summarize_relationship"):
        return 200, chat(json.dumps({"summary": _summary(task)}, ensure_ascii=False))
    raise AssertionError(f"no scripted answer for task {task['task']}")
