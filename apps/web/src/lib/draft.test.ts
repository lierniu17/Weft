import { describe, expect, it } from "vitest";
import type { Draft } from "../contracts/draft.ts";
import {
  canConfirm,
  choosePerson,
  draftItems,
  draftSummary,
  itemSentence,
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
  questions: [],
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

  it("writes items as natural sentences with resolved names (style refresh AC-8)", () => {
    const text = (item: Parameters<typeof itemSentence>[1]) => itemSentence(draft, item).text;
    expect(text(draft.facts[0])).toBe("李明喜欢钓鱼");
    expect(text(draft.facts[1])).toBe("李明在腾讯工作");
    expect(text(draft.profile[0])).toBe("李明的籍贯是湖南长沙");
    expect(text(draft.relationships[0])).toBe("老张是李明的室友");
    expect(text(draft.feelings[0])).toBe("我觉得和李明很亲近");
    // the subject leads the sentence, for the draft card's bold name
    expect(itemSentence(draft, draft.facts[0]).subject).toBe("李明");
  });

  it("has a sentence for every predicate and feeling, never an internal name", () => {
    const fact = (predicate: string, object: string) =>
      itemSentence(draft, { id: "x", subject: "小李", predicate, object, confidence: "witnessed" })
        .text;
    expect(fact("STUDIED_AT", "北大")).toBe("李明在北大上学");
    expect(fact("LIVES_IN", "杭州")).toBe("李明住在杭州");
    expect(fact("HAS_TRAIT", "急性子")).toBe("李明的性格：急性子");
    expect(fact("DISLIKES", "喝酒")).toBe("李明不喜欢喝酒");
    expect(fact("EXPERIENCED", "明年高考")).toBe("李明明年高考");
    expect(fact("HAS_ETIQUETTE", "别提他前妻")).toBe("和李明相处：别提他前妻");
    expect(fact("OPINION", "靠谱")).toBe("我对李明的评价：靠谱");
    expect(fact("RELATED_EVENT", "老张")).toBe("李明和老张之间的事");
    expect(fact("SOMETHING_NEW", "钓鱼")).toBe("李明：钓鱼");
    const feeling = (dimension: "affinity" | "trust", level: string) =>
      itemSentence(draft, {
        id: "y",
        from: "我",
        to: "小李",
        dimension,
        level,
        confidence: "witnessed",
      } as Parameters<typeof itemSentence>[1]).text;
    expect(feeling("affinity", "like")).toBe("我喜欢李明");
    expect(feeling("affinity", "dislike")).toBe("我反感李明");
    expect(feeling("trust", "high")).toBe("我很信任李明");
    expect(feeling("trust", "low")).toBe("我不太信任李明");
    const kin = itemSentence(draft, {
      id: "r2",
      pair: ["老张", "小李"],
      types: [],
      confidence: "witnessed",
    }).text;
    expect(kin).toBe("老张和李明认识");
  });
});
