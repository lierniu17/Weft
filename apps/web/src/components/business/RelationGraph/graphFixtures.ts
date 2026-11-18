/**
 * Story / test data for the relationship graph, shaped like GET /api/graph: the prototype's
 * cast mapped onto the five taxonomy categories, with groups, hearsay and inferred lines, an
 * asymmetric feeling, a person with two categories, someone only known through 老张, a tense
 * pair and a name longer than seven characters.
 */
import type { Answer } from "../../../contracts/answer.ts";
import { crowd, edge, graph, node, SELF, seedGraph } from "../../../lib/graph/fixtures.ts";
import type { GraphView } from "./RelationGraph.tsx";

export { SELF };

const P = (id: string, name: string, met: string | null, extra = {}) =>
  node(id, { name, met_at: met, ...extra });

export const SAMPLE: GraphView = graph(
  [
    P("mom", "王秀英", "1990"),
    P("dad", "陈建国", "1990"),
    P("sis", "陈晓", "1992"),
    P("wife", "刘婷", "2019"),
    P("ex", "苏珊", "2014"),
    P("li", "李明", "2015"),
    P("cj", "陈静", "2015"),
    P("zt", "周涛", "2015"),
    P("zw", "张伟", "2018-03"),
    P("wh", "吴昊", "2019"),
    P("gj", "郭佳", "2020"),
    P("wang", "王浩", "2024-05"),
    P("zk", "郑凯", "2024"),
    P("hw", "何伟", "2026-09"),
    P("mc", "马超", "2017"),
    P("long", "赵一二三四五六七八九十", "2021"),
    P("lf", "林芳", "2026-10"),
    P("kid", "老张的女儿", "2026-11", { anchor_person_id: "zw" }),
    P("zl", "赵磊", "2021-04", { anchor_person_id: "zt" }),
  ],
  [
    edge("mom", SELF, { types: [["kin", "父母"]], mine: null, theirs: "intimate" }),
    edge(SELF, "dad", { types: [["kin", "父母"]], mine: "intimate" }),
    edge(SELF, "sis", { types: [["kin", "兄弟姐妹"]], mine: "close" }),
    edge(SELF, "wife", { types: [["kin", "配偶"]], mine: "intimate" }),
    edge(SELF, "ex", { types: [["romantic", "前任"]], mine: "distant", status: "distant" }),
    edge(SELF, "li", { types: [["social", "同学"]], mine: "close", theirs: "intimate" }),
    edge(SELF, "cj", { types: [["social", "同学"]], mine: "familiar" }),
    edge(SELF, "zt", { types: [["social", "同学"]], mine: "casual" }),
    edge(SELF, "zw", {
      types: [
        ["social", "同事"],
        ["social", "朋友"],
      ],
      mine: "intimate",
      theirs: "close",
    }),
    edge(SELF, "wh", { types: [["social", "同事"]], mine: "familiar" }),
    edge(SELF, "gj", { types: [["social", "同事"]], mine: "familiar", confidence: "hearsay" }),
    edge(SELF, "wang", { types: [["social", "朋友"]], mine: "familiar" }),
    edge(SELF, "zk", {
      types: [
        ["interest", "合伙人"],
        ["social", "朋友"],
      ],
      mine: "close",
    }),
    edge(SELF, "hw", { types: [["interest", "客户"]], mine: "casual" }),
    edge(SELF, "mc", { types: [["hostile", "竞争"]], mine: "distant" }),
    edge(SELF, "long", { types: [["social", "邻居"]], mine: "casual", confidence: "inferred" }),
    edge(SELF, "lf", { types: [["social", "邻居"]], mine: "casual" }),
    edge("dad", "mom", { types: [["kin", "配偶"]] }),
    edge("zw", "li", { types: [["social", "室友"]], confidence: "hearsay", status: "tense" }),
    edge("zw", "wang", { types: [["social", "朋友"]], confidence: "self_told" }),
    edge("zw", "wh", { types: [["social", "同事"]] }),
    edge("zw", "kid", { types: [["kin", "父母"]], confidence: "self_told" }),
    edge("zt", "zl", { types: [["social", "同事"]], confidence: "hearsay" }),
    edge("li", "cj", { types: [["social", "同学"]], confidence: "inferred" }),
  ],
  {
    groups: [
      { id: "fam", kind: "family", name: "家人", member_ids: ["mom", "dad", "sis"] },
      { id: "zju", kind: "school", name: "浙江大学", member_ids: ["li", "cj", "zt"] },
      { id: "bd", kind: "organization", name: "字节跳动", member_ids: ["zw", "wh", "gj"] },
    ],
    timeline: { from: "1990", to: "2026-11-16" },
  },
);

/** A local graph: 张伟's neighbourhood, two hops. */
export const LOCAL_TWO_HOPS: GraphView = {
  ...SAMPLE,
  center_id: "zw",
  timeline: null,
  groups: [],
  nodes: SAMPLE.nodes.filter((n) => ["zw", SELF, "li", "wang", "wh", "kid", "cj"].includes(n.id)),
  edges: SAMPLE.edges.filter(
    (e) =>
      ["zw", SELF, "li", "wang", "wh", "kid", "cj"].includes(e.source) &&
      ["zw", SELF, "li", "wang", "wh", "kid", "cj"].includes(e.target) &&
      !(e.source === SELF && e.target !== "zw"),
  ),
};

export const LOCAL_ONE_HOP: GraphView = {
  ...LOCAL_TWO_HOPS,
  nodes: LOCAL_TWO_HOPS.nodes.filter((n) => n.id !== "cj"),
  edges: LOCAL_TWO_HOPS.edges.filter((e) => e.source !== "cj" && e.target !== "cj"),
};

export const CROWD_30 = crowd(30);
export const CROWD_200 = crowd(200);
/** The e2e seed graph (30 people, the crowded 亲属 sector of the walkthrough screenshots). */
export const SEED = seedGraph();

const ref = (person_id: string, name: string) => ({ person_id, name });

/** 「我是怎么认识小王的？」 */
export const PATH_ANSWER: Answer = {
  kind: "path",
  segments: [{ text: "你是通过老张认识小王的：老张 2024 年把他介绍给你。", citations: [1] }],
  citations: [],
  persons: [ref("zw", "张伟"), ref("wang", "王浩")],
  path: [ref(SELF, "我"), ref("zw", "张伟"), ref("wang", "王浩")],
  follow_ups: [],
} as unknown as Answer;

/** 「谁喜欢露营？」 */
export const LIST_ANSWER: Answer = {
  kind: "list",
  segments: [{ text: "有 3 个人喜欢露营：刘婷、李明、郑凯。" }],
  citations: [],
  persons: [],
  items: [
    { ...ref("wife", "刘婷"), citations: [] },
    { ...ref("li", "李明"), citations: [] },
    { ...ref("zk", "郑凯"), citations: [] },
  ],
  follow_ups: [],
} as unknown as Answer;

/** 「老张和小李什么关系？」 */
export const PAIR_ANSWER: Answer = {
  kind: "text",
  segments: [{ text: "他们是大学室友，2025 年因借钱闹掰，目前关系紧张。", citations: [1] }],
  citations: [
    {
      index: 1,
      pair: [ref("zw", "张伟"), ref("li", "李明")],
      entry_excerpt: "老张和小李以前是大学室友",
      confidence: "hearsay",
      occurred_on: "2026-10-08",
    },
  ],
  persons: [ref("zw", "张伟"), ref("li", "李明")],
  follow_ups: [],
} as unknown as Answer;
