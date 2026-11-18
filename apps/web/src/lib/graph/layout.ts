/**
 * 全景图布局 (graph-viz AC-1..AC-4): a deterministic star layout around 我, no force
 * simulation, so that a position *means* something and tests can assert it.
 *
 * - Rings: 5 closeness rings (至交 innermost → 疏远), by *my* closeness to the person at the
 *   time shown (the API's directional closeness); no record → 一般. People with no
 *   relationship to me sit on a 6th, outermost ring 间接认识.
 * - Sectors: the five relationship categories, clockwise from the top in the taxonomy's
 *   order; width ∝ the number of people (by primary type) with a minimum width
 *   (`MIN_SECTOR_ANGLE`) so an empty category keeps its label; the people of one ring and
 *   sector are spread evenly across the sector (each ring on its own, as in the prototype:
 *   inner rings are short, a shared angle grid would crowd them).
 * - Primary type = `types[0]` of my relationship with the person; other types become arcs.
 * - 间接认识: angle near the anchor person (`anchor_person_id`, resolved through chains),
 *   several around one anchor spread just enough not to overlap.
 * - Spacing: any two nodes stay at least a node diameter apart. Rings start from the
 *   viewport (prototype proportions) and only grow when a ring is too crowded. The rings
 *   named at the base zoom (至交, 亲近) also grow so that neighbours' names fit side by
 *   side — by at most two ring steps; label placement handles the rest.
 *
 * Coordinates are world units centred on 我 (x right, y down; angle 0 = 3 o'clock, growing
 * clockwise on screen). The renderer pans / zooms; `extent` tells it how far nodes reach.
 */
import type { Schemas } from "../../api/client.ts";
import type { Category, ClosenessLevel } from "../../contracts/draft.ts";
import { CATEGORIES, categoryLabel } from "../labels.ts";
import { estimateTextWidth, truncateName } from "./labelPlacement.ts";

type GraphData = Pick<Schemas["GraphOut"], "center_id" | "nodes" | "edges"> &
  Partial<Pick<Schemas["GraphOut"], "groups">>;
type GraphEdge = Schemas["GraphEdgeOut"];

/** 0 = 我, 1..5 = closeness rings, 6 = 间接认识. */
export type Ring = 0 | 1 | 2 | 3 | 4 | 5 | 6;

export const CLOSENESS_RING: Record<ClosenessLevel, 1 | 2 | 3 | 4 | 5> = {
  intimate: 1,
  close: 2,
  familiar: 3,
  casual: 4,
  distant: 5,
};
export const INDIRECT_RING = 6;
export const DEFAULT_CLOSENESS: ClosenessLevel = "casual"; // 缺省落在“一般”
export const RING_LABELS = ["至交", "亲近", "熟悉", "一般", "疏远", "间接认识"] as const;
export const SECTOR_ORDER: readonly Category[] = CATEGORIES;
/** An empty or tiny category still gets this much of the circle (≈ 22°). */
export const MIN_SECTOR_ANGLE = (Math.PI * 2) / 16;
/** Largest node radius (亲近 and closer, prototype) and 我's radius, in world units. */
export const NODE_RADIUS = 13;
export const SELF_RADIUS = 18;
/** Rings named at the base zoom (至交, 亲近) also make room for their names, side by side. */
const NAMED_RINGS = 2;
/** Name font (px) and the gap between two names, for that room. */
const NAME_PX = 12;
const NAME_GAP = 8;
/** Even rings are nudged by this share of a slot so neighbouring rings do not line up. */
const STAGGER = 0.08;
const USABLE = 1 - 2 * STAGGER;
const TOP = -Math.PI / 2;
const TAU = Math.PI * 2;

export type NodeLayout = {
  id: string;
  ring: Ring;
  /** Radians; 0 = 3 o'clock, clockwise on screen. */
  angle: number;
  radius: number;
  x: number;
  y: number;
  /** The sector the node sits in (间接认识: its anchor's); null for 我 and the unattached. */
  sector: Category | null;
  /** Category of types[0] of my relationship (间接认识: of the link to the anchor). */
  primaryCategory: Category | null;
  /** One entry per further type of my relationship (drawn as short arcs). */
  otherCategories: Category[];
  /** My closeness to the person as placed (缺省 一般); null for 我 and 间接认识. */
  closeness: ClosenessLevel | null;
  anchorId: string | null;
  visible: boolean;
};

export type RingLayout = { ring: Exclude<Ring, 0>; radius: number; label: string };
export type SectorLayout = { category: Category; label: string; start: number; end: number };

export type GraphLayout = {
  nodes: Record<string, NodeLayout>;
  rings: RingLayout[];
  sectors: SectorLayout[];
  nodeRadius: number;
  selfRadius: number;
  /** How far from the centre the outermost node reaches. */
  extent: number;
};

export type LayoutOptions = {
  /** Laid out (so they can fade in at their place) but not visible, e.g. not met yet. */
  hidden?: ReadonlySet<string>;
  nodeRadius?: number;
  selfRadius?: number;
};

export type Viewport = { width: number; height: number };

/** The edge between me and `id`, if any. */
export function selfEdge(g: GraphData, id: string): GraphEdge | undefined {
  const me = g.center_id;
  return g.edges.find(
    (e) => (e.source === me && e.target === id) || (e.target === me && e.source === id),
  );
}

/** 我对他 / 他对我 on an edge touching me. */
export function directions(e: GraphEdge, me: string) {
  const mineFirst = e.source === me;
  return {
    mine: (mineFirst ? e.source_closeness : e.target_closeness) ?? null,
    theirs: (mineFirst ? e.target_closeness : e.source_closeness) ?? null,
  };
}

/** Sector widths: ∝ count, floored at `MIN_SECTOR_ANGLE` (water-filling, so the sectors
 *  above the floor stay exactly proportional to each other). */
function sectorSpans(counts: Record<Category, number>): Record<Category, number> {
  const spans = {} as Record<Category, number>;
  const floored = new Set<Category>();
  for (;;) {
    const open = SECTOR_ORDER.filter((c) => !floored.has(c));
    const rest = TAU - floored.size * MIN_SECTOR_ANGLE;
    const total = open.reduce((sum, c) => sum + counts[c], 0);
    let changed = false;
    for (const c of SECTOR_ORDER) {
      if (floored.has(c)) {
        spans[c] = MIN_SECTOR_ANGLE;
        continue;
      }
      spans[c] = total > 0 ? (rest * counts[c]) / total : rest / open.length;
      if (spans[c] < MIN_SECTOR_ANGLE - 1e-12) {
        floored.add(c);
        changed = true;
      }
    }
    if (!changed) return spans;
  }
}

/** Smallest angle between two nodes on a circle of radius r for them not to overlap. */
function minAngle(r: number, d: number) {
  return 2 * Math.asin(Math.min(1, d / (2 * r)));
}

/** Smallest radius at which `m` nodes fit in `span` radians, a slot apart (stagger kept). */
function radiusFor(m: number, span: number, d: number) {
  if (m <= 1) return 0;
  const half = (span * USABLE) / (2 * m);
  return half >= Math.PI / 2 ? d / 2 : d / (2 * Math.sin(half));
}

type Placed = { id: string; desired: number };

/** Spread nodes wanting `desired` angles on one circle so neighbours are `gap` apart:
 *  overlapping clusters merge and centre on the mean of what their members want. */
function spreadOnCircle(items: Placed[], gap: number): Map<string, number> {
  const out = new Map<string, number>();
  if (!items.length) return out;
  const sorted = [...items].sort((a, b) => a.desired - b.desired || a.id.localeCompare(b.id));
  // cut the circle at its widest empty gap, then work on a line
  let cut = 0;
  let widest = -1;
  for (let i = 0; i < sorted.length; i++) {
    const next = i + 1 < sorted.length ? sorted[i + 1].desired : sorted[0].desired + TAU;
    if (next - sorted[i].desired > widest) {
      widest = next - sorted[i].desired;
      cut = (i + 1) % sorted.length;
    }
  }
  const line = [
    ...sorted.slice(cut),
    ...sorted.slice(0, cut).map((p) => ({ ...p, desired: p.desired + TAU })),
  ];
  type Cluster = { members: Placed[]; center: number };
  let clusters: Cluster[] = line.map((p) => ({ members: [p], center: p.desired }));
  const half = (c: Cluster) => ((c.members.length - 1) * gap) / 2;
  for (let guard = 0; guard < line.length * 4; guard++) {
    let merged = false;
    const next: Cluster[] = [];
    for (const c of clusters) {
      const prev = next[next.length - 1];
      if (prev && c.center - half(c) - (prev.center + half(prev)) < gap - 1e-9) {
        const members = [...prev.members, ...c.members];
        next[next.length - 1] = {
          members,
          center: members.reduce((s, m) => s + m.desired, 0) / members.length,
        };
        merged = true;
      } else {
        next.push(c);
      }
    }
    clusters = next;
    const first = clusters[0];
    const last = clusters[clusters.length - 1];
    if (
      clusters.length > 1 &&
      first.center - half(first) + TAU - (last.center + half(last)) < gap
    ) {
      // they meet across the cut: fold the first cluster behind the last one
      const moved = first.members.map((m) => ({ ...m, desired: m.desired + TAU }));
      clusters = [...clusters.slice(1), { members: moved, center: first.center + TAU }];
      merged = true;
    }
    if (!merged) break;
  }
  for (const c of clusters) {
    c.members.forEach((m, k) => {
      out.set(m.id, c.center + (k - (c.members.length - 1) / 2) * gap);
    });
  }
  return out;
}

export function layoutGraph(
  g: GraphData,
  viewport: Viewport,
  options: LayoutOptions = {},
): GraphLayout {
  const nodeRadius = options.nodeRadius ?? NODE_RADIUS;
  const selfRadius = options.selfRadius ?? SELF_RADIUS;
  const d = 2 * nodeRadius;
  const me = g.center_id;
  const hidden = options.hidden ?? new Set<string>();
  const byId = new Map(g.nodes.map((n) => [n.id, n]));

  // who is where: rings, primary category, group order
  const groupOf = new Map<string, string>();
  for (const group of g.groups ?? []) {
    for (const m of group.member_ids) if (!groupOf.has(m)) groupOf.set(m, group.id);
  }
  type Direct = {
    id: string;
    ring: 1 | 2 | 3 | 4 | 5;
    closeness: ClosenessLevel;
    category: Category;
    others: Category[];
  };
  const direct: Direct[] = [];
  const indirect: string[] = [];
  for (const n of g.nodes) {
    if (n.id === me) continue;
    const e = selfEdge(g, n.id);
    if (!e) {
      indirect.push(n.id);
      continue;
    }
    const closeness = directions(e, me).mine ?? DEFAULT_CLOSENESS;
    direct.push({
      id: n.id,
      ring: CLOSENESS_RING[closeness],
      closeness,
      category: e.types[0]?.category ?? "social",
      others: e.types.slice(1).map((t) => t.category),
    });
  }

  // sectors
  const counts = Object.fromEntries(SECTOR_ORDER.map((c) => [c, 0])) as Record<Category, number>;
  for (const p of direct) counts[p.category] += 1;
  const spans = sectorSpans(counts);
  const sectors: SectorLayout[] = [];
  let start = TOP;
  for (const c of SECTOR_ORDER) {
    sectors.push({ category: c, label: categoryLabel(c), start, end: start + spans[c] });
    start += spans[c];
  }

  // members of each ring × sector, in a stable order that keeps groups together
  const order = (a: Direct, b: Direct) => {
    const na = byId.get(a.id);
    const nb = byId.get(b.id);
    return (
      (groupOf.get(a.id) ?? "~").localeCompare(groupOf.get(b.id) ?? "~") ||
      (na?.met_at ?? "~").localeCompare(nb?.met_at ?? "~") ||
      (na?.name ?? "").localeCompare(nb?.name ?? "") ||
      a.id.localeCompare(b.id)
    );
  };
  const cells = new Map<string, Direct[]>();
  for (const p of direct) {
    const key = `${p.ring}:${p.category}`;
    cells.set(key, [...(cells.get(key) ?? []), p]);
  }
  for (const list of cells.values()) list.sort(order);

  // ring radii: prototype proportions of the viewport, grown where a ring is crowded
  const outer = Math.min(viewport.width, viewport.height) * 0.44;
  const r0 = outer * 0.22;
  const step = (outer - r0) / 5;
  const radii: number[] = [];
  for (let ring = 1; ring <= 5; ring++) {
    let need = ring === 1 ? Math.max(r0, selfRadius + nodeRadius + 4, d) : radii[ring - 2] + d;
    need = Math.max(need, r0 + step * (ring - 1));
    for (const sector of sectors) {
      const members = cells.get(`${ring}:${sector.category}`) ?? [];
      const span = sector.end - sector.start;
      need = Math.max(need, radiusFor(members.length, span, d));
      if (ring <= NAMED_RINGS && members.length > 1) {
        const widest = Math.max(
          ...members.map((p) =>
            estimateTextWidth(truncateName(byId.get(p.id)?.name ?? ""), NAME_PX),
          ),
        );
        const named = radiusFor(members.length, span, Math.max(d, widest + NAME_GAP));
        need = Math.max(need, Math.min(named, r0 + step * (ring + 1)));
      }
    }
    radii.push(need);
  }
  const indirectNeed =
    indirect.length > 1
      ? d / (2 * Math.sin(Math.min(Math.PI / 2, (USABLE * Math.PI) / (indirect.length + 1))))
      : 0;
  radii.push(Math.max(radii[4] + d, r0 + step * 5, indirectNeed));

  const nodes: Record<string, NodeLayout> = {};
  const put = (n: Omit<NodeLayout, "x" | "y" | "visible">) => {
    nodes[n.id] = {
      ...n,
      x: Math.cos(n.angle) * n.radius,
      y: Math.sin(n.angle) * n.radius,
      visible: n.id === me || !hidden.has(n.id),
    };
  };
  put({
    id: me,
    ring: 0,
    angle: 0,
    radius: 0,
    sector: null,
    primaryCategory: null,
    otherCategories: [],
    closeness: null,
    anchorId: null,
  });
  for (const sector of sectors) {
    const span = sector.end - sector.start;
    for (let ring = 1 as 1 | 2 | 3 | 4 | 5; ring <= 5; ring++) {
      const members = cells.get(`${ring}:${sector.category}`) ?? [];
      const slot = span / Math.max(members.length, 1);
      members.forEach((p, k) => {
        put({
          id: p.id,
          ring,
          angle: sector.start + slot * (k + 0.5) + (ring % 2 ? 0 : slot * STAGGER),
          radius: radii[ring - 1],
          sector: sector.category,
          primaryCategory: p.category,
          otherCategories: p.others,
          closeness: p.closeness,
          anchorId: null,
        });
      });
    }
  }

  // 间接认识: follow anchor chains to someone placed, want that angle, then spread
  const anchorOf = (id: string) => byId.get(id)?.anchor_person_id ?? null;
  const rootOf = (id: string) => {
    const seen = new Set<string>();
    let at: string | null = anchorOf(id);
    while (at && !nodes[at] && !seen.has(at)) {
      seen.add(at);
      at = anchorOf(at);
    }
    return at && nodes[at] && at !== me ? at : null;
  };
  const free = sectors[sectors.length - 1].end - MIN_SECTOR_ANGLE / 2; // the unattached
  const wanted = indirect.map((id) => {
    const root = rootOf(id);
    return { id, desired: root ? nodes[root].angle : free, root };
  });
  const angles = spreadOnCircle(wanted, minAngle(radii[5], d) / USABLE);
  for (const w of wanted) {
    const anchor = anchorOf(w.id);
    const link = anchor
      ? g.edges.find(
          (e) =>
            (e.source === w.id && e.target === anchor) ||
            (e.target === w.id && e.source === anchor),
        )
      : undefined;
    put({
      id: w.id,
      ring: INDIRECT_RING,
      angle: angles.get(w.id) ?? w.desired,
      radius: radii[5],
      sector: w.root ? nodes[w.root].sector : null,
      primaryCategory: link?.types[0]?.category ?? null,
      otherCategories: [],
      closeness: null,
      anchorId: anchor,
    });
  }

  return {
    nodes,
    rings: radii.map((radius, i) => ({
      ring: (i + 1) as Exclude<Ring, 0>,
      radius,
      label: RING_LABELS[i],
    })),
    sectors,
    nodeRadius,
    selfRadius,
    extent: radii[5] + nodeRadius,
  };
}

/** 亲近 and closer are drawn bigger (prototype 13 vs 10.5). */
export const SMALL_NODE = 10.5 / 13;

/** Disc radius in layout units: 我 biggest, 亲近 and closer bigger than the rest. */
export function worldRadius(
  l: NodeLayout | undefined,
  isCenter: boolean,
  layout: GraphLayout,
): number {
  if (isCenter) return layout.selfRadius;
  const big = l?.closeness === "intimate" || l?.closeness === "close";
  return layout.nodeRadius * (big ? 1 : SMALL_NODE);
}

/** Where sector names sit: past the outermost ring. */
export function labelRadius(layout: Pick<GraphLayout, "rings">) {
  const r = layout.rings;
  const outer = r[r.length - 1]?.radius ?? 0;
  const step = r.length > 1 ? outer - r[r.length - 2].radius : 40;
  return outer + step * 0.6;
}
