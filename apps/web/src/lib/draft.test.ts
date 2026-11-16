import { describe, expect, it } from "vitest";
import type { Draft } from "../contracts/draft.ts";
import {
  canConfirm,
  choosePerson,
  describeItem,
  draftItems,
  draftSummary,
  removeItem,
  setConfidence,
  setRelationshipType,
  unresolvedPersons,
} from "./draft.ts";

// BOT-3-like draft: 老张 needs a choice, 我 is self.
const draft: Draft = {
  persons: [
    {
      id: "p1",
      mention: "老张",
      match: "ambiguous",
      candidates: [
        { person_id: "zw", name: "张伟", note: "同事" },
        { person_id: "zq", name: "张强", note: "邻居" },
      ],
    },
    { id: "p2", mention: "小李", match: "matched", person_id: "lm", name: "李明" },
    { id: "p3", mention: "我", match: "matched", person_id: "self" },
  ],
  facts: [
    { id: "f1", subject: "小李", predicate: "LIKES", object: "钓鱼", confidence: "self_told" },
    {
      id: "f2",
      subject: "小李",
      predicate: "WORKS_AT",
      object: "腾讯",
      confidence: "hearsay",
      conflict: { old: "阿里", action: "unverified" },
    },
  ],
  relationships: [
    {
      id: "r1",
      pair: ["老张", "小李"],
      types: [{ category: "social", subtype: "室友", original: "室友" }],
      confidence: "hearsay",
    },
  ],
  feelings: [
    {
      id: "e1",
      from: "我",
      to: "小李",
      dimension: "closeness",
      level: "close",
      confidence: "witnessed",
    },
  ],
  profile: [
    { id: "g1", person: "小李", field: "hometown", value: "湖南长沙", confidence: "self_told" },
  ],
};

describe("草稿：需选择未选时不能确认 (AC-12)", () => {
  it("lists ambiguous persons and blocks confirmation", () => {
    expect(unresolvedPersons(draft).map((p) => p.mention)).toEqual(["老张"]);
    expect(canConfirm(draft)).toBe(false);
  });

  it("choosing a candidate resolves it to matched, keeping the candidate's name", () => {
    const next = choosePerson(draft, "p1", { person_id: "zw" });
    expect(next.persons[0]).toMatchObject({
      match: "matched",
      person_id: "zw",
      name: "张伟",
      note: "同事",
    });
    expect(canConfirm(next)).toBe(true);
    expect(draft.persons[0].match).toBe("ambiguous"); // input untouched
  });

  it("marking it new resolves it too", () => {
    const next = choosePerson(draft, "p1", "new");
    expect(next.persons[0]).toMatchObject({ match: "new", person_id: null });
    expect(canConfirm(next)).toBe(true);
  });
});

describe("草稿：按 id 修改与删除 (AC-11)", () => {
  it("removes exactly the item with the id, from whichever group holds it", () => {
    expect(removeItem(draft, "f1").facts.map((f) => f.id)).toEqual(["f2"]);
    expect(removeItem(draft, "e1").feelings).toEqual([]);
    expect(removeItem(draft, "r1").relationships).toEqual([]);
    expect(removeItem(draft, "g1").profile).toEqual([]);
  });

  it("changes the confidence of one item", () => {
    const next = setConfidence(draft, "f1", "witnessed");
    expect(next.facts[0].confidence).toBe("witnessed");
    expect(next.facts[1].confidence).toBe("hearsay");
  });

  it("changes a relationship's type, keeping the original wording", () => {
    const next = setRelationshipType(draft, "r1", 0, { category: "social", subtype: "球友" });
    expect(next.relationships[0].types).toEqual([
      { category: "social", subtype: "球友", original: "室友" },
    ]);
  });
});

describe("草稿摘要与条目文案", () => {
  it("counts persons and information items", () => {
    expect(draftSummary(draft)).toEqual({ persons: 3, items: 5 });
  });

  it("lists items in review order: facts, profile, relationships, feelings", () => {
    expect(draftItems(draft).map((i) => i.id)).toEqual(["f1", "f2", "g1", "r1", "e1"]);
  });

  it("describes items with resolved names (matched → name, self → 我)", () => {
    expect(describeItem(draft, draft.facts[0])).toBe("李明 · 喜欢 钓鱼");
    expect(describeItem(draft, draft.facts[1])).toBe("李明 · 工作单位 腾讯");
    expect(describeItem(draft, draft.profile[0])).toBe("李明 · 籍贯 湖南长沙");
    expect(describeItem(draft, draft.relationships[0])).toBe("老张 与 李明 · 社会 · 室友");
    expect(describeItem(draft, draft.feelings[0])).toBe("我 → 李明 · 亲密度 亲近");
  });
});
