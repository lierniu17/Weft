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
