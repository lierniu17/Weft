/** Test data builders for the graph pure functions (API-shaped, like GET /api/graph). */
import type { Schemas } from "../../api/client.ts";
import type { Category, ClosenessLevel, Confidence } from "../../contracts/draft.ts";

export type GraphData = Schemas["GraphOut"];
export type GraphEdge = Schemas["GraphEdgeOut"];
export type GraphNode = Schemas["GraphNodeOut"];

export const SELF = "me";

export function node(id: string, extra: Partial<GraphNode> = {}): GraphNode {
  return {
    id,
    name: id,
    is_self: id === SELF,
    met_at: null,
    anchor_person_id: null,
    ...extra,
  };
}

type EdgeOptions = {
  types?: [Category, string][];
  mine?: ClosenessLevel | null;
  theirs?: ClosenessLevel | null;
  confidence?: Confidence;
  status?: GraphEdge["status"];
};

/** An edge source → target; `mine` = source's closeness to target, `theirs` the other way. */
export function edge(source: string, target: string, o: EdgeOptions = {}): GraphEdge {
  const mine = o.mine ?? null;
  const theirs = o.theirs ?? null;
  const order: (ClosenessLevel | null)[] = ["distant", "casual", "familiar", "close", "intimate"];
  const closer = order.indexOf(mine) >= order.indexOf(theirs) ? mine : theirs;
  return {
    id: `${source}-${target}`,
    source,
    target,
    types: (o.types ?? [["social", "朋友"]]).map(([category, subtype]) => ({
      category,
      subtype,
      original: subtype,
    })),
    status: o.status ?? "active",
    closeness: closer,
    confidence: o.confidence ?? "witnessed",
    source_closeness: mine,
    target_closeness: theirs,
  };
}

export function graph(
  nodes: GraphNode[],
  edges: GraphEdge[],
  extra: Partial<GraphData> = {},
): GraphData {
  return {
    center_id: SELF,
    nodes: [node(SELF), ...nodes.filter((n) => n.id !== SELF)],
    edges,
    omitted: 0,
    groups: [],
    timeline: null,
    at: null,
    ...extra,
  };
}

const CATS: Category[] = ["social", "social", "social", "interest", "kin", "romantic", "hostile"];
const LEVELS: ClosenessLevel[] = ["intimate", "close", "familiar", "familiar", "casual", "distant"];

/** `n` persons around me, deterministic mix of categories and closeness; every 6th is
 *  known only through the person before them. */
export function crowd(n: number): GraphData {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  for (let i = 0; i < n; i++) {
    const id = `p${i}`;
    if (i % 6 === 5) {
      nodes.push(node(id, { anchor_person_id: `p${i - 1}` }));
      edges.push(edge(`p${i - 1}`, id));
      continue;
    }
    nodes.push(node(id));
    edges.push(
      edge(SELF, id, {
        types: [[CATS[i % CATS.length], "朋友"]],
        mine: LEVELS[(i * 7) % LEVELS.length],
      }),
    );
  }
  return graph(nodes, edges);
}

/**
 * The e2e seed graph (apps/api/src/weft/services/seed.py) as GET /api/graph shows it today:
 * 30 persons, my closeness and categories, the people only known through others, the
 * groups (two families, three employers, a school) — for label placement at real sizes.
 */
export function seedGraph(): GraphData {
  type Row = [string, string, Category, string, ClosenessLevel, Category?];
  const direct: Row[] = [
    ["li", "李明", "social", "同学", "close"],
    ["cj", "陈静", "social", "同学", "familiar"],
    ["zt", "周涛", "social", "同学", "casual"],
    ["tl", "唐亮", "social", "战友", "distant"],
    ["ss", "苏珊", "romantic", "前任", "distant"],
    ["zw", "张伟", "social", "同事", "intimate", "social"],
    ["mc", "马超", "hostile", "竞争", "distant"],
    ["dad", "陈建国", "kin", "父母", "intimate"],
    ["mom", "王秀英", "kin", "父母", "intimate"],
    ["sis", "陈晓", "kin", "兄弟姐妹", "close"],
    ["wh", "吴昊", "social", "同事", "familiar"],
    ["gj", "郭佳", "social", "同事", "familiar"],
    ["qdd", "钱多多", "social", "同事", "casual"],
    ["wife", "刘婷", "kin", "配偶", "intimate"],
    ["dj", "杜鹃", "social", "朋友", "casual"],
    ["fq", "冯强", "social", "老乡", "casual"],
    ["hmm", "韩梅梅", "social", "网友", "casual"],
    ["wang", "王浩", "social", "朋友", "familiar"],
    ["zk", "郑凯", "interest", "合伙人", "close", "social"],
    ["gf", "高峰", "social", "其他", "casual"],
    ["ljh", "罗建华", "social", "师生", "familiar"],
    ["sy", "孙悦", "social", "朋友", "familiar"],
    ["hw", "何伟", "interest", "客户", "casual"],
    ["lf", "林芳", "social", "邻居", "familiar"],
  ];
  const indirect: [string, string, string, Category][] = [
    ["zl", "赵磊", "zt", "social"],
    ["ly", "刘洋", "wang", "social"],
    ["sj", "宋佳", "li", "social"],
    ["hl", "黄丽", "zw", "kin"],
    ["kid", "老张的女儿", "zw", "kin"],
  ];
  const nodes = [
    ...direct.map(([id, name]) => node(id, { name })),
    ...indirect.map(([id, name, anchor]) => node(id, { name, anchor_person_id: anchor })),
  ];
  const edges = [
    ...direct.map(([id, , cat, sub, mine, other]) =>
      edge(SELF, id, {
        types: other
          ? [
              [cat, sub],
              [other, "朋友"],
            ]
          : [[cat, sub]],
        mine,
      }),
    ),
    ...indirect.map(([id, , anchor, cat]) => edge(anchor, id, { types: [[cat, "同事"]] })),
    edge("dad", "mom", { types: [["kin", "配偶"]] }),
    edge("wife", "dj", { types: [["social", "朋友"]] }),
    edge("zw", "wh", { types: [["social", "同事"]] }),
    edge("zw", "wang", { types: [["social", "朋友"]] }),
    edge("zw", "li", { types: [["social", "室友"]], confidence: "hearsay", status: "tense" }),
  ];
  type Kind = "family" | "organization" | "school";
  const group = (id: string, kind: Kind, name: string, member_ids: string[]) => ({
    id,
    kind,
    name,
    member_ids,
  });
  return graph(nodes, edges, {
    groups: [
      group("family:dad", "family", "我的家人", ["dad", "mom", "sis", "wife"]),
      group("family:hl", "family", "张伟家", ["hl", "kid", "zw"]),
      group("organization:字节跳动", "organization", "字节跳动", ["gj", "qdd", "wh", "zw"]),
      group("organization:阿里巴巴", "organization", "阿里巴巴", ["cj", "li", "sj"]),
      group("organization:华为", "organization", "华为", ["zl", "zt"]),
      group("organization:腾讯", "organization", "腾讯", ["ly", "wang"]),
      group("school:浙江大学", "school", "浙江大学", ["cj", "li", "zt"]),
    ],
  });
}
