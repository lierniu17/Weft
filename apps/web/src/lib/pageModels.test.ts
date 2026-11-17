import { describe, expect, it } from "vitest";
import {
  beijingDate,
  type CitationSource,
  closenessGroups,
  dislikeText,
  draftCardLabels,
  entryStatus,
  isBackfilled,
  knownFor,
  learnedAliases,
  monthHeading,
  profileView,
  quotaMessages,
  toCitations,
  toPartialDate,
} from "./pageModels.ts";

const today = new Date(2026, 10, 16);

describe("发生日期 → 契约里的带精度日期", () => {
  it("serializes year / month / day precision", () => {
    expect(toPartialDate({ precision: "year", year: 2015 })).toBe("2015");
    expect(toPartialDate({ precision: "month", year: 2026, month: 3 })).toBe("2026-03");
    expect(toPartialDate({ precision: "day", year: 2026, month: 11, day: 6 })).toBe("2026-11-06");
  });
  it("reads an API timestamp as a Beijing date", () => {
    expect(beijingDate("2026-11-15T17:30:00Z")).toBe("2026-11-16");
    expect(beijingDate("2026-11-16T03:00:00+00:00")).toBe("2026-11-16");
  });
});

describe("记录列表", () => {
  const entry = (over: Record<string, unknown>) =>
    ({
      id: "e1",
      text: "t",
      occurred_on: "2026-11-16",
      precision: "day",
      kind: "user",
      created_at: "2026-11-16T02:00:00Z",
      draft: { id: "d1", status: "confirmed" },
      ...over,
    }) as Parameters<typeof entryStatus>[0];

  it("maps the draft status; 抽取中 lists as 待确认, a manual edit as 已确认", () => {
    expect(entryStatus(entry({}))).toBe("confirmed");
    expect(entryStatus(entry({ draft: { id: "d", status: "extracting" } }))).toBe("pending");
    expect(entryStatus(entry({ draft: { id: "d", status: "failed" } }))).toBe("failed");
    expect(entryStatus(entry({ kind: "manual_edit", draft: null }))).toBe("confirmed");
  });
  it("补记: happened before the day it was written, or only known to the month / year", () => {
    expect(isBackfilled(entry({}))).toBe(false);
    expect(isBackfilled(entry({ occurred_on: "2026-11-08" }))).toBe(true);
    expect(isBackfilled(entry({ occurred_on: "2015", precision: "year" }))).toBe(true);
  });
  it("groups by 「2026 年 11 月」 / 「2015 年」", () => {
    expect(monthHeading("2026-11-16")).toBe("2026 年 11 月");
    expect(monthHeading("2026-03")).toBe("2026 年 3 月");
    expect(monthHeading("2015")).toBe("2015 年");
  });
});

describe("出处", () => {
  it("numbers an item's sources from 1 for the CitationSheet", () => {
    const src: CitationSource[] = [
      {
        entry_id: "a",
        entry_excerpt: "今天和老张吃饭",
        occurred_on: "2026-11-16",
        kind: "user",
        confidence: "witnessed",
      },
      {
        entry_id: "b",
        entry_excerpt: "手动编辑",
        occurred_on: "2026-11-16",
        kind: "manual_edit",
        confidence: "witnessed",
      },
    ];
    expect(toCitations(src).map((c) => [c.index, c.entry_id])).toEqual([
      [1, "a"],
      [2, "b"],
    ]);
  });
});

describe("画像分区 (AC-21, AC-22, AC-23)", () => {
  const fact = (id: string, predicate: string, object: string, over = {}) => ({
    id,
    subject_id: "p",
    predicate,
    object,
    fact: `${predicate} ${object}`,
    kind: predicate === "OPINION" ? "opinion" : "fact",
    valid_at: null,
    invalid_at: null,
    confidence: "self_told",
    unverified: false,
    current: true,
    sources: [],
    citations: [],
    ...over,
  });
  const profile = {
    person: { id: "p", name: "老张", aliases: [], is_self: false },
    identity: {
      birthday: { value: "3 月 5 日", confidence: "witnessed", sources: [], citations: [] },
    },
    facts: [
      fact("f1", "LIKES", "钓鱼"),
      fact("f2", "DISLIKES", "喝酒"),
      fact("f3", "WORKS_AT", "字节跳动", {
        valid_at: "2023",
        invalid_at: "2026-10",
        current: false,
      }),
      fact("f4", "WORKS_AT", "阿里巴巴", { valid_at: "2026-10" }),
      fact("f5", "WORKS_AT", "腾讯", { unverified: true, current: false }),
      fact("f6", "HAS_TRAIT", "急性子"),
      fact("f7", "OPINION", "靠谱"),
      fact("f8", "HAS_TRAIT", "暴躁", { current: false, invalid_at: "2026-01" }),
      fact("f9", "EXPERIENCED", "女儿高考"),
    ],
    summary: null,
  } as unknown as Parameters<typeof profileView>[0];

  const view = profileView(profile);

  it("identity fields read as 「生日 · 3 月 5 日」", () => {
    expect(view.identity).toEqual([{ id: "identity:birthday", text: "生日 · 3 月 5 日" }]);
  });
  it("roles keep history (ended) and 待核实, with their kind", () => {
    expect(view.roles.map((r) => [r.text, r.note, r.start, r.end, r.unverified])).toEqual([
      ["字节跳动", "单位", "2023", "2026-10", false],
      ["阿里巴巴", "单位", "2026-10", null, false],
      ["腾讯", "单位", null, null, true],
    ]);
  });
  it("likes and dislikes share one section; an invalidated tag is dropped", () => {
    expect(view.likes.map((t) => t.text)).toEqual(["钓鱼", "不喝酒"]);
    expect(view.traits.map((t) => t.text)).toEqual(["急性子"]);
  });
  it("opinions only in 我的评价", () => {
    expect(view.opinions.map((t) => t.text)).toEqual(["靠谱"]);
    expect(view.events.map((t) => t.text)).toEqual(["女儿高考"]);
  });
  it("finds an item's sources by id", () => {
    expect(view.sources("identity:birthday")).toEqual([]);
    expect(view.sources("missing")).toEqual([]);
  });
  it("dislike text does not double the negation", () => {
    expect(dislikeText("不吃辣")).toBe("不吃辣");
    expect(dislikeText("香菜")).toBe("不香菜");
  });
});

describe("人物列表的亲密度分组", () => {
  it("groups people by my closeness to them, strongest first; unknown last", () => {
    const persons = [
      { id: "me", name: "小明", aliases: [], is_self: true },
      { id: "a", name: "张伟", aliases: ["老张"], is_self: false },
      { id: "b", name: "李明", aliases: [], is_self: false },
      { id: "c", name: "王芳", aliases: [], is_self: false },
    ];
    const graph = {
      center_id: "me",
      nodes: [],
      omitted: 0,
      edges: [
        {
          id: "e1",
          source: "me",
          target: "a",
          closeness: "close",
          status: null,
          types: [{ category: "social", subtype: "同事", original: "同事" }],
        },
        { id: "e2", source: "b", target: "me", closeness: "intimate", status: null, types: [] },
      ],
    } as unknown as Parameters<typeof closenessGroups>[1];
    const groups = closenessGroups(persons, graph);
    expect(groups.self?.id).toBe("me");
    expect(groups.groups.map((g) => [g.title, g.people.map((p) => p.id)])).toEqual([
      ["至交", ["b"]],
      ["亲近", ["a"]],
      ["其他", ["c"]],
    ]);
    expect(groups.groups[1].people[0].relation).toBe("同事");
  });
});

describe("认识时长 and 额度", () => {
  it("knownFor counts whole years since met_at", () => {
    expect(knownFor("2020", today)).toBe("认识 6 年");
    expect(knownFor("2026-11-01", today)).toBe("认识不到 1 年");
    expect(knownFor(null, today)).toBeUndefined();
  });
  it("quota messages say what ran out and when it resets", () => {
    const usage = {
      entry: { used: 50, limit: 50, remaining: 0 },
      ask: { used: 63, limit: 100, remaining: 37 },
      resets_at: "2026-11-16T16:00:00Z",
    };
    expect(quotaMessages(usage)).toEqual({
      record: "今日已达上限：今天的 50 条记录已用完，北京时间 0 点重置 · 提问还剩 37 次",
    });
  });
});

describe("对话里每张草稿卡的可访问名称 (AC-UI-9 landmark-unique)", () => {
  it("names a card by 发生日期 and the first words of its Entry", () => {
    const labels = draftCardLabels(
      [
        { id: "a", occurred_on: "2026-11-16", text: "今天和老张吃饭，他说女儿明年高考" },
        { id: "b", occurred_on: "2015", text: "读大学时\n认识了小李" },
      ],
      today,
    );
    expect(labels.get("a")).toBe("草稿 · 今天 · 今天和老张吃饭，他说女儿…");
    expect(labels.get("b")).toBe("草稿 · 2015 年 · 读大学时 认识了小李");
  });
  it("keeps names unique when two Entries read the same", () => {
    const labels = draftCardLabels(
      [
        { id: "a", occurred_on: "2026-11-16", text: "老张是个急性子。" },
        { id: "b", occurred_on: "2026-11-16", text: "老张是个急性子。" },
        { id: "c", occurred_on: "2026-11-16", text: "老张是个急性子。" },
      ],
      today,
    );
    expect(labels.get("a")).toBe("草稿 · 今天 · 老张是个急性子。");
    expect(labels.get("b")).toBe("草稿 · 今天 · 老张是个急性子。 · 2");
    expect(labels.get("c")).toBe("草稿 · 今天 · 老张是个急性子。 · 3");
    expect(new Set(labels.values()).size).toBe(3);
  });
});

describe("学到别名", () => {
  it("shows only the aliases the server says this Entry's confirmation added", () => {
    expect(
      learnedAliases({ learned_aliases: [{ alias: "老张", person_id: "p1", name: "张伟" }] }),
    ).toEqual([{ alias: "老张", name: "张伟" }]);
  });
  it("shows none for a later Entry that mentions a known alias, or before confirmation", () => {
    expect(learnedAliases({ learned_aliases: [] })).toEqual([]);
    expect(learnedAliases(undefined)).toEqual([]);
  });
});
