import type { Draft } from "../../../contracts/draft.ts";
import type { Taxonomy } from "../../../contracts/taxonomy.ts";

/** Story data for the review sheet (S2 ③ + BOT-4 + BOT-13). Not imported by components. */
export const REVIEW_DRAFT: Draft = {
  persons: [
    {
      id: "p1",
      mention: "老张",
      match: "matched",
      person_id: "zw",
      name: "张伟",
      note: "同事 · 已有别名",
    },
    {
      id: "p2",
      mention: "小李",
      match: "ambiguous",
      candidates: [
        { person_id: "lm", name: "李明", note: "同学" },
        { person_id: "lh", name: "李华", note: "邻居" },
      ],
    },
    { id: "p3", mention: "我", match: "matched", person_id: "self" },
  ],
  facts: [
    { id: "f1", subject: "老张", predicate: "LIKES", object: "钓鱼", confidence: "self_told" },
    {
      id: "f2",
      subject: "小李",
      predicate: "WORKS_AT",
      object: "腾讯",
      confidence: "hearsay",
      conflict: { old: "阿里", action: "unverified" },
    },
    {
      id: "f3",
      subject: "老张",
      predicate: "WORKS_AT",
      object: "阿里巴巴",
      confidence: "self_told",
      conflict: { old: "字节跳动", action: "update" },
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
    { id: "g1", person: "老张", field: "hometown", value: "湖南长沙", confidence: "self_told" },
  ],
};

export const TAXONOMY: Taxonomy = [
  { category: "kin", subtypes: [{ name: "父母" }, { name: "配偶" }, { name: "其他" }] },
  { category: "romantic", subtypes: [{ name: "恋人" }, { name: "前任" }, { name: "其他" }] },
  {
    category: "social",
    subtypes: [
      { name: "朋友" },
      { name: "同事" },
      { name: "同学" },
      { name: "室友" },
      { name: "其他" },
    ],
  },
  { category: "interest", subtypes: [{ name: "合伙人" }, { name: "客户" }, { name: "其他" }] },
  { category: "hostile", subtypes: [{ name: "竞争" }, { name: "矛盾" }, { name: "其他" }] },
];

/** BOT-13: 「球友」 added under 社会 in settings. */
export const TAXONOMY_WITH_CUSTOM: Taxonomy = TAXONOMY.map((g) =>
  g.category === "social" ? { ...g, subtypes: [...g.subtypes, { name: "球友", custom: true }] } : g,
);
