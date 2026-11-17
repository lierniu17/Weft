import type { Draft } from "../../../contracts/draft.ts";

/** Story data: the S2 draft 「今天和老张、小李吃饭…」. Not imported by components. */
export const PENDING_DRAFT: Draft = {
  persons: [
    { id: "p1", mention: "老张", match: "matched", person_id: "zw", name: "张伟", note: "同事" },
    {
      id: "p2",
      mention: "小李",
      match: "ambiguous",
      candidates: [
        { person_id: "lm", name: "李明", note: "同学" },
        { person_id: "lh", name: "李华", note: "邻居" },
      ],
    },
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
  ],
  relationships: [],
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

export const CONFIRMED_PERSONS = [
  { person_id: "zw", name: "张伟" },
  { person_id: "lm", name: "李明" },
];
