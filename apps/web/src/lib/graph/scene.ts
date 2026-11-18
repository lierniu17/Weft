/**
 * What the relationship graph shows around the layout (graph-viz AC-3, AC-5, AC-7, AC-8,
 * AC-10, AC-11, AC-12, AC-18): the person card's wording, the hearsay dot, anchors for a
 * local graph's second ring, semantic-zoom labels, group halos and the two themes'
 * parameters (all from DESIGN.md tokens). Pure, so the component only draws.
 */
import type { Schemas } from "../../api/client.ts";
import type { Category, ClosenessLevel } from "../../contracts/draft.ts";
import { tokens } from "../../tokens.gen.ts";
import { confidenceLabel } from "../confidence.ts";
import { categoryLabel, FEELING_LEVELS, relationshipStatusLabel } from "../labels.ts";
import { CATEGORY_TOKEN, type GraphColorToken } from "./edgeStyle.ts";

export { MAX_NAME_LENGTH, truncateName } from "./labelPlacement.ts";

import { DEFAULT_CLOSENESS, directions, type GraphLayout, selfEdge } from "./layout.ts";

type GraphData = Schemas["GraphOut"];
type GraphEdge = Schemas["GraphEdgeOut"];

const CLOSENESS_LABEL = Object.fromEntries(FEELING_LEVELS.closeness) as Record<
  ClosenessLevel,
  string
>;

const nameOf = (g: Pick<GraphData, "nodes">, id: string) => {
  const n = g.nodes.find((x) => x.id === id);
  return n ? (n.is_self ? "我" : n.name) : "";
};

const other = (e: GraphEdge, id: string) => (e.source === id ? e.target : e.source);

export type PersonSummary = {
  id: string;
  name: string;
  /** 「社会 · 同事」 per type of the centre's relationship with them (AC-3). */
  types: string[];
  /** 「我对他：至交 · 他对我：熟悉」 when the two feel differently (AC-7). */
  closeness: string;
  met: string | null;
  confidence: string | null;
  status: string | null;
  groups: string[];
  /** Their other relationships: 「李明 · 室友（紧张）」. */
  relations: string[];
};

/** The person card's content (AC-10): from the graph data alone. */
export function personSummary(g: GraphData, id: string): PersonSummary {
  const center = g.center_id;
  const subject = nameOf(g, center);
  const node = g.nodes.find((n) => n.id === id);
  const e = selfEdge(g, id);
  let closeness: string;
  if (e) {
    const { mine, theirs } = directions(e, center);
    const m = CLOSENESS_LABEL[mine ?? DEFAULT_CLOSENESS];
    closeness =
      theirs && theirs !== (mine ?? DEFAULT_CLOSENESS)
        ? `${subject}对他：${m} · 他对${subject}：${CLOSENESS_LABEL[theirs]}`
        : subject === "我"
          ? m
          : `${subject}对他：${m}`;
  } else {
    const via = node?.anchor_person_id ? nameOf(g, node.anchor_person_id) : "";
    closeness = via ? `间接认识 · 经${via}` : "间接认识";
  }
  const met = node?.met_at ? `${Number.parseInt(node.met_at, 10)} 年认识` : null;
  const relations = g.edges
    .filter((x) => x !== e && (x.source === id || x.target === id) && other(x, id) !== center)
    .map((x) => {
      const type = x.types[0]?.subtype ?? "";
      const tense = x.status === "tense" ? `（${relationshipStatusLabel("tense")}）` : "";
      return `${nameOf(g, other(x, id))} · ${type}${tense}`;
    });
  return {
    id,
    name: nameOf(g, id),
    types: (e?.types ?? []).map((t) => `${categoryLabel(t.category)} · ${t.subtype}`),
    closeness,
    met,
    confidence: e ? confidenceLabel(e.confidence) : null,
    status: e?.status && e.status !== "active" ? relationshipStatusLabel(e.status) : null,
    groups: (g.groups ?? []).filter((x) => x.member_ids.includes(id)).map((x) => x.name),
    relations,
  };
}

/** People with any relationship known only by hearsay: a small dot on the node (AC-8). */
export function hearsayNodes(g: Pick<GraphData, "edges" | "center_id">): Set<string> {
  const out = new Set<string>();
  for (const e of g.edges) {
    if (e.confidence !== "hearsay") continue;
    for (const id of [e.source, e.target]) if (id !== g.center_id) out.add(id);
  }
  return out;
}

/**
 * A local graph (人物页) is centred on a person, and the API gives no anchors for its second
 * ring: anchor each person not linked to the centre to a neighbour that is (AC-12).
 */
export function withLocalAnchors(g: GraphData): GraphData {
  const center = g.center_id;
  const direct = new Set(
    g.edges.flatMap((e) =>
      e.source === center ? [e.target] : e.target === center ? [e.source] : [],
    ),
  );
  return {
    ...g,
    nodes: g.nodes.map((n) => {
      if (n.id === center || direct.has(n.id) || n.anchor_person_id) return n;
      const via = g.edges
        .filter((e) => e.source === n.id || e.target === n.id)
        .map((e) => other(e, n.id))
        .find((id) => direct.has(id));
      return via ? { ...n, anchor_person_id: via } : n;
    }),
  };
}

/** Zoom (× the fitted view) from which every name shows (prototype: 1.15). */
export const BASE_ZOOM_LABEL_ALL = 1.15;

const RANK: Record<ClosenessLevel, number> = {
  intimate: 1,
  close: 2,
  familiar: 3,
  casual: 4,
  distant: 5,
};

/**
 * Semantic zoom (AC-11): zoomed out only 亲近 and closer are named (phone: 至交); zoomed
 * in, everyone; with a focus or an answer lit, exactly the lit people.
 */
export function labelShown(
  n: { closeness: ClosenessLevel | null; isCenter: boolean },
  view: { id: string; zoom: number; compact: boolean; emphasized: ReadonlySet<string> | null },
): boolean {
  if (n.isCenter) return true;
  if (view.emphasized) return view.emphasized.has(view.id);
  if (view.zoom >= BASE_ZOOM_LABEL_ALL) return true;
  if (!n.closeness) return false;
  return RANK[n.closeness] <= (view.compact ? 1 : 2);
}

export type Halo = {
  id: string;
  name: string;
  members: string[];
  x: number;
  y: number;
  radius: number;
  category: Category;
};

/** World units of glow beyond the outermost member (prototype: +30). */
const HALO_PADDING = 30;

/** A soft halo behind each group with two or more visible members (AC-5). */
export function groupHalos(
  g: Pick<GraphData, "groups">,
  layout: GraphLayout,
  visible: ReadonlySet<string>,
): Halo[] {
  const halos: Halo[] = [];
  for (const group of g.groups ?? []) {
    const members = group.member_ids.filter((id) => visible.has(id) && layout.nodes[id]);
    if (members.length < 2) continue;
    const pts = members.map((id) => layout.nodes[id]);
    const x = pts.reduce((s, p) => s + p.x, 0) / pts.length;
    const y = pts.reduce((s, p) => s + p.y, 0) / pts.length;
    const reach = Math.max(...pts.map((p) => Math.hypot(p.x - x, p.y - y)));
    halos.push({
      id: group.id,
      name: group.name,
      members,
      x,
      y,
      radius: reach + HALO_PADDING,
      category: pts.find((p) => p.primaryCategory)?.primaryCategory ?? "social",
    });
  }
  return halos;
}

export type GraphThemeName = "light" | "starfield";

export type GraphTheme = {
  name: GraphThemeName;
  /** Radial gradient, centre → edge (light: plain white). */
  background: [string, string];
  categories: Record<Exclude<GraphColorToken, "tense">, string>;
  tense: string;
  path: string;
  ring: string;
  ringLabel: string;
  text: string;
  /** Lines between two other people. */
  thirdParty: string;
  nodeFill: string;
  selfFill: string;
  selfStroke: string;
  selfText: string;
  hearsayDot: string;
  pulse: string;
  star: string | null;
  fade: number;
  /** Nodes and lines glow in their colour. */
  glow: boolean;
  /** Twinkling star field. */
  stars: boolean;
};

const c = tokens.color;
const FADE = Number(tokens.opacity["graph-fade"]);

function categories(prefix: "graph" | "graph-dark") {
  const out = {} as GraphTheme["categories"];
  for (const t of Object.values(CATEGORY_TOKEN)) out[t] = c[`${prefix}-${t}`];
  return out;
}

/** #RRGGBB + alpha → rgba(); colours stay token values, only their opacity is chosen here. */
export function withAlpha(color: string, alpha: number): string {
  if (!color.startsWith("#")) return color;
  const n = Number.parseInt(color.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}

const THEMES: Record<GraphThemeName, GraphTheme> = {
  light: {
    name: "light",
    background: [c["neutral-bg-container"], c["neutral-bg-container"]],
    categories: categories("graph"),
    tense: c["graph-tense"],
    path: c["graph-path"],
    ring: c["graph-ring"],
    ringLabel: c["neutral-text-disabled"],
    text: c["neutral-text-primary"],
    thirdParty: withAlpha(c["neutral-text-secondary"], 0.45),
    nodeFill: c["neutral-bg-container"],
    selfFill: c["primary-1"],
    selfStroke: c["primary-6"],
    selfText: c["primary-7"],
    hearsayDot: c["status-warning-6"],
    pulse: c["secondary-6"],
    star: null,
    fade: FADE,
    glow: false,
    stars: false,
  },
  starfield: {
    name: "starfield",
    background: [c["graph-dark-bg-inner"], c["graph-dark-bg-outer"]],
    categories: categories("graph-dark"),
    tense: c["graph-dark-tense"],
    path: c["graph-dark-path"],
    ring: c["graph-dark-ring"],
    ringLabel: c["graph-dark-text-muted"],
    text: c["graph-dark-text"],
    thirdParty: withAlpha(c["graph-dark-text-muted"], 0.55),
    nodeFill: c["graph-dark-node-fill"],
    selfFill: c["graph-dark-self-fill"],
    selfStroke: c["graph-dark-self-stroke"],
    selfText: c["graph-dark-text"],
    hearsayDot: c["graph-dark-interest"],
    pulse: c["graph-dark-kin"],
    star: c["graph-dark-star"],
    fade: FADE,
    glow: true,
    stars: true,
  },
};

export function graphTheme(name: GraphThemeName): GraphTheme {
  return THEMES[name];
}
