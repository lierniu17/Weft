import type { Answer } from "../../../contracts/answer.ts";

/** BOT-5 step 1: 两人关系, with a 转述 claim said in words (「据老张说」). */
export const TEXT_ANSWER: Answer = {
  kind: "text",
  segments: [
    { text: "他们是大学室友", citations: [1] },
    { text: "。据老张说，去年因为借钱的事闹掰了", citations: [2] },
    { text: "，目前关系紧张。" },
  ],
  citations: [
    {
      index: 1,
      entry_id: "e1",
      entry_excerpt: "读大学时和老张、小李住一个宿舍。",
      occurred_on: "2012",
      confidence: "witnessed",
    },
    {
      index: 2,
      entry_id: "e2",
      entry_excerpt: "今天和老张吃饭，他说他跟小李因为借钱的事闹掰了。",
      occurred_on: "2026-11-16",
      confidence: "hearsay",
      told_by: "老张",
      pair: [
        { person_id: "zw", name: "张伟" },
        { person_id: "lm", name: "李明" },
      ],
    },
  ],
  persons: [
    { person_id: "zw", name: "张伟" },
    { person_id: "lm", name: "李明" },
  ],
  follow_ups: ["他俩什么时候认识的？"],
};

/** BOT-5 step 3: 人脉路径. */
export const PATH_ANSWER: Answer = {
  kind: "path",
  segments: [{ text: "通过老张认识的", citations: [1] }, { text: "：" }],
  citations: [
    {
      index: 1,
      entry_id: "e3",
      entry_excerpt: "小王是我通过老张认识的客户。",
      occurred_on: "2025-06",
      confidence: "witnessed",
    },
  ],
  persons: [],
  path: [
    { person_id: "me", name: "小明", is_self: true },
    { person_id: "zw", name: "张伟" },
    { person_id: "wf", name: "王芳" },
  ],
  follow_ups: [],
};

const LONG = "赵一二三四五六七八九十甲乙丙丁戊己庚辛壬癸";

/** BOT-5 step 4: 条件筛选. */
export const LIST_ANSWER: Answer = {
  kind: "list",
  segments: [{ text: "3 个人喜欢露营：" }],
  citations: [1, 2, 3].map((index) => ({
    index,
    entry_id: `l${index}`,
    entry_excerpt: "周末一起去露营了。",
    occurred_on: "2026-10",
    confidence: "witnessed" as const,
  })),
  persons: [],
  items: [
    { person_id: "lm", name: "李明", subtitle: "同学", citations: [1] },
    { person_id: "wf", name: "王芳", subtitle: "客户", citations: [2] },
    { person_id: "z", name: LONG, subtitle: "邻居", citations: [3] },
  ],
  follow_ups: [],
};

/** 聚合统计: number + the persons behind it. */
export const STAT_ANSWER: Answer = {
  kind: "stat",
  segments: [{ text: "你认识的人里做 IT 的有 4 个", citations: [1] }, { text: "。" }],
  citations: [
    {
      index: 1,
      entry_id: "s1",
      entry_excerpt: "张伟在字节做后端。",
      occurred_on: "2026-03-05",
      confidence: "self_told",
    },
  ],
  persons: [],
  stat: {
    count: 4,
    persons: [
      { person_id: "zw", name: "张伟" },
      { person_id: "lm", name: "李明" },
      { person_id: "wf", name: "王芳" },
      { person_id: "cj", name: "陈静" },
    ],
  },
  follow_ups: [],
};

/** AC-38: nothing in the graph — say so, never make it up. */
export const NO_ANSWER: Answer = {
  kind: "no_answer",
  segments: [{ text: "图谱里没有相关信息：没有张伟配偶的记录。" }],
  citations: [],
  persons: [],
  follow_ups: [],
};

export const LONG_NAME = LONG;
