import { describe, expect, it } from "vitest";
import {
  composerQuota,
  followedQuestion,
  messageActions,
  optionPart,
  problemText,
} from "./messages.ts";

const draft = { id: "d1" };
const usage = (entryLeft: number, askLeft: number) => ({
  entry: { limit: 50, used: 50 - entryLeft, remaining: entryLeft },
  ask: { limit: 100, used: 100 - askLeft, remaining: askLeft },
  resets_at: "2026-11-16T16:00:00Z",
});

describe("消息的纠正按钮 (AC-6, AC-10)", () => {
  it("记录: 改为提问 under the bubble while the draft is not confirmed", () => {
    for (const status of ["extracting", "pending", "failed", "discarded"] as const) {
      expect(messageActions({ intent: "record", entry: { draft } }, status)).toEqual({
        bubble: [{ target: "ask", label: "改为提问" }],
        reply: [],
        options: [],
      });
    }
  });

  it("记录: no 改为提问 once the draft is confirmed into the graph", () => {
    expect(messageActions({ intent: "record", entry: { draft } }, "confirmed")).toEqual({
      bubble: [],
      reply: [],
      options: [],
    });
  });

  it("记录 from before drafts existed (no draft) is in the graph: no 改为提问", () => {
    expect(messageActions({ intent: "record", entry: { draft: null } }, undefined).bubble).toEqual(
      [],
    );
  });

  it("记录 refused by the quota (nothing recorded) can still be asked", () => {
    expect(messageActions({ intent: "record", entry: null }, undefined).bubble).toEqual([
      { target: "ask", label: "改为提问" },
    ]);
  });

  it("提问: 改为记录 under the bubble", () => {
    expect(messageActions({ intent: "ask", entry: null }, undefined)).toEqual({
      bubble: [{ target: "record", label: "改为记录" }],
      reply: [],
      options: [],
    });
  });

  it("提问 rerouted from a discarded 记录 still offers 改为记录", () => {
    expect(messageActions({ intent: "ask", entry: { draft } }, "discarded").bubble).toEqual([
      { target: "record", label: "改为记录" },
    ]);
  });

  it("记录 + 提问: neither", () => {
    expect(messageActions({ intent: "record_ask", entry: { draft } }, "pending")).toEqual({
      bubble: [],
      reply: [],
      options: [],
    });
  });

  it("无关 (拿不准 too): 记下来 / 帮我查 under the reply, nothing under the bubble", () => {
    expect(messageActions({ intent: "chitchat", entry: null }, undefined)).toEqual({
      bubble: [],
      reply: [
        { target: "record", label: "记下来" },
        { target: "ask", label: "帮我查" },
      ],
      options: [],
    });
  });
});

describe("反问的候选按钮 (intent clarify AC-1, AC-3, AC-8)", () => {
  const clarify = (resolved: boolean) => ({
    question: "你是想记下“老周最近不太顺”，还是想查老周最近怎么样？",
    options: [
      { label: "记下：老周最近不太顺", intent: "record" as const, question: null },
      { label: "查：老周最近怎么样", intent: "ask" as const, question: "老周最近怎么样？" },
    ],
    resolved,
  });

  it("an open 反问: its options in order (by index), instead of 记下来 / 帮我查", () => {
    expect(
      messageActions({ intent: "chitchat", entry: null, clarify: clarify(false) }, undefined),
    ).toEqual({
      bubble: [],
      reply: [],
      options: [
        { target: 0, label: "记下：老周最近不太顺" },
        { target: 1, label: "查：老周最近怎么样" },
      ],
    });
  });

  it("a 反问 answered by the next message: no options, no 记下来 / 帮我查", () => {
    expect(
      messageActions({ intent: "chitchat", entry: null, clarify: clarify(true) }, undefined),
    ).toEqual({ bubble: [], reply: [], options: [] });
  });

  it("拿不准 without a 反问 (missing or invalid): the fixed 记下来 / 帮我查", () => {
    for (const none of [null, undefined]) {
      expect(
        messageActions({ intent: "chitchat", entry: null, clarify: none }, undefined).reply,
      ).toEqual([
        { target: "record", label: "记下来" },
        { target: "ask", label: "帮我查" },
      ]);
    }
  });

  it("an option clicked: 纠正 by the new kind (AC-8), the options are gone", () => {
    expect(
      messageActions({ intent: "ask", entry: null, clarify: clarify(true) }, undefined),
    ).toEqual({ bubble: [{ target: "record", label: "改为记录" }], reply: [], options: [] });
    expect(
      messageActions({ intent: "record", entry: { draft }, clarify: clarify(true) }, "pending"),
    ).toEqual({ bubble: [{ target: "ask", label: "改为提问" }], reply: [], options: [] });
  });

  it("a refused option names the quota of its kind (AC-7)", () => {
    expect(optionPart({ intent: "record" }, undefined)).toBe("record");
    expect(optionPart({ intent: "ask" }, undefined)).toBe("ask");
    expect(optionPart({ intent: "record_ask" }, "entry")).toBe("record");
    expect(optionPart({ intent: "record_ask" }, "ask")).toBe("ask");
  });
});

describe("消息里做不了的部分 (AC-7)", () => {
  const quota = {
    part: "record" as const,
    error: "quota_exceeded",
    message: "今日已达上限，明天 0 点重置",
  };

  it("a used-up quota reads like the composer's quota notice", () => {
    expect(problemText(quota, usage(0, 37))).toBe(
      "今日已达上限：今天的 50 条记录已用完，北京时间 0 点重置 · 提问还剩 37 次",
    );
    expect(problemText({ ...quota, part: "ask" }, usage(3, 0))).toBe(
      "今日已达上限：今天的 100 次提问已用完，北京时间 0 点重置 · 记录还剩 3 条",
    );
  });

  it("after the reset (or before usage loads) the server's own text", () => {
    expect(problemText(quota, usage(50, 100))).toBe("今日已达上限，明天 0 点重置");
    expect(problemText(quota, undefined)).toBe("今日已达上限，明天 0 点重置");
  });

  it("other problems: the server's text", () => {
    expect(
      problemText(
        { part: "ask", error: "ask_failed", message: "问答暂时不可用，请稍后再试" },
        usage(0, 0),
      ),
    ).toBe("问答暂时不可用，请稍后再试");
  });
});

describe("输入框的额度提示", () => {
  it("nothing while both quotas are left", () => {
    expect(composerQuota(usage(1, 1))).toEqual({ notice: undefined });
    expect(composerQuota(undefined)).toEqual({ notice: undefined });
  });

  it("one used up: a notice, sending still works (the other kind is unaffected)", () => {
    expect(composerQuota(usage(0, 37)).notice).toContain("记录已用完");
    expect(composerQuota(usage(0, 37)).blocked).toBeUndefined();
    expect(composerQuota(usage(3, 0)).notice).toContain("提问已用完");
  });

  it("both used up: sending is blocked", () => {
    expect(composerQuota(usage(0, 0))).toEqual({
      blocked: "今日已达上限：今天的记录和提问都已用完，北京时间 0 点重置",
    });
  });
});

describe("指代确认的候选 (conversation-context AC-1, AC-2)", () => {
  const confirm = (resolved: boolean) => ({
    question: "你问的是哪位老周？",
    source: "ask" as const,
    options: [
      { label: "老周（周涛，大学同学）", intent: "ask" as const, question: "周涛喜欢什么？" },
      { label: "老周（周建国，老家邻居）", intent: "ask" as const, question: "周建国喜欢什么？" },
    ],
    resolved,
  });

  it("an open 指代确认 on a 提问: its candidates in order; the bubble keeps 改为记录", () => {
    expect(
      messageActions({ intent: "ask", entry: null, clarify: confirm(false) }, undefined),
    ).toEqual({
      bubble: [{ target: "record", label: "改为记录" }],
      reply: [],
      options: [
        { target: 0, label: "老周（周涛，大学同学）" },
        { target: 1, label: "老周（周建国，老家邻居）" },
      ],
    });
  });

  it("clicked, or said by the next message: the candidates are gone", () => {
    expect(
      messageActions({ intent: "ask", entry: null, clarify: confirm(true) }, undefined).options,
    ).toEqual([]);
  });
});

describe("「接着：…」 (conversation-context AC-10)", () => {
  const answer = { kind: "text" };

  it("an answer read with the 上文: the latest question it followed", () => {
    expect(
      followedQuestion({
        answer,
        history_used_of: [
          { message_id: "m1", question: "老张在哪上班？" },
          { message_id: "m2", question: "他老婆叫什么？" },
        ],
      }),
    ).toBe("他老婆叫什么？");
  });

  it("answered on its own: no line, no 不接上文", () => {
    expect(followedQuestion({ answer, history_used_of: [] })).toBeNull();
    expect(followedQuestion({ answer, history_used_of: null })).toBeNull();
    expect(followedQuestion({ answer })).toBeNull();
  });

  it("no answer (a 指代确认 instead, or Q&A down): no line", () => {
    expect(
      followedQuestion({
        answer: null,
        history_used_of: [{ message_id: "m1", question: "老张在哪上班？" }],
      }),
    ).toBeNull();
  });
});
