import type { DraftQuestion } from "../../../contracts/draft.ts";

/** Story data: the 补充追问 of BOT-3 and BOT-4. Not imported by components. */
export const XIAOLI_QUESTION: DraftQuestion = {
  id: "q1",
  field: "relationship_type",
  pair: ["我", "小李"],
  prompt: "小李是你的同事还是同学？",
  options: [
    {
      label: "同事",
      patch: { types: [{ category: "social", subtype: "同事", original: "同事" }] },
    },
    {
      label: "同学",
      patch: { types: [{ category: "social", subtype: "同学", original: "同学" }] },
    },
  ],
  answered: false,
};

export const WHEN_QUESTION: DraftQuestion = {
  id: "q2",
  field: "occurred",
  prompt: "前阵子是什么时候？",
  options: [
    { label: "这个月", patch: { occurred: "2026-11" } },
    { label: "上个月", patch: { occurred: "2026-10" } },
    { label: "两三个月前", patch: { occurred: "2026-09" } },
  ],
  answered: false,
};
