/**
 * 线型编码 (graph-viz AC-6..AC-8): a relationship → how its line is drawn.
 *
 * - 我 → 他: width grows with closeness (至交 widest); the end near me uses 我对他, the end
 *   near them 他对我 (unknown → same as mine), so asymmetric feelings taper (prototype
 *   `taper`). Colour = the category of `types[0]` (`colors.graph.<token>`, starfield:
 *   `colors.graph-dark.<token>`).
 * - 转述 = dashed 6/5, 推测 = dotted 1.5/4, 亲历 / 本人说 = solid (prototype `dashFor`).
 * - status 紧张 → `colors.graph.tense`.
 * - Between two other people: a thin line (`THIRD_PARTY_WIDTH`), same dash / tension rules.
 */
import type { Schemas } from "../../api/client.ts";
import type { Category, ClosenessLevel, Confidence } from "../../contracts/draft.ts";
import { directions } from "./layout.ts";

type GraphEdge = Schemas["GraphEdgeOut"];

/** Keys of `colors.graph` / `colors.graph-dark` in DESIGN.md. */
export type GraphColorToken = "kin" | "romance" | "social" | "interest" | "hostile" | "tense";

export const CATEGORY_TOKEN: Record<Category, Exclude<GraphColorToken, "tense">> = {
  kin: "kin",
  romantic: "romance",
  social: "social",
  interest: "interest",
  hostile: "hostile",
};

export type DashStyle = "solid" | "dashed" | "dotted";
export const DASH: Record<DashStyle, number[]> = {
  solid: [],
  dashed: [6, 5],
  dotted: [1.5, 4],
};
const DASH_BY_CONFIDENCE: Record<Confidence, DashStyle> = {
  witnessed: "solid",
  self_told: "solid",
  hearsay: "dashed",
  inferred: "dotted",
};

/** Line width per closeness (prototype: (6 − ring) × 0.75 + 0.4). */
const WIDTH: Record<ClosenessLevel, number> = {
  intimate: 4.15,
  close: 3.4,
  familiar: 2.65,
  casual: 1.9,
  distant: 1.15,
};
export const THIRD_PARTY_WIDTH = 1.1;

export function closenessWidth(level: ClosenessLevel | null | undefined): number {
  return WIDTH[level ?? "casual"];
}

export type EdgeStyle = {
  touchesSelf: boolean;
  /** At my end (我对他); for other edges: at `source`. */
  widthNearSelf: number;
  /** At their end (他对我); for other edges: at `target`. */
  widthNearOther: number;
  asymmetric: boolean;
  mine: ClosenessLevel | null;
  theirs: ClosenessLevel | null;
  colorToken: GraphColorToken;
  categoryToken: Exclude<GraphColorToken, "tense">;
  dashStyle: DashStyle;
  dash: number[];
  tense: boolean;
};

export function edgeStyle(e: GraphEdge, selfId: string): EdgeStyle {
  const category = e.types[0]?.category ?? "social";
  const tense = e.status === "tense";
  const dashStyle = DASH_BY_CONFIDENCE[e.confidence];
  const common = {
    colorToken: tense ? ("tense" as const) : CATEGORY_TOKEN[category],
    categoryToken: CATEGORY_TOKEN[category],
    dashStyle,
    dash: DASH[dashStyle],
    tense,
  };
  if (e.source !== selfId && e.target !== selfId) {
    return {
      touchesSelf: false,
      widthNearSelf: THIRD_PARTY_WIDTH,
      widthNearOther: THIRD_PARTY_WIDTH,
      asymmetric: false,
      mine: null,
      theirs: null,
      ...common,
    };
  }
  const { mine, theirs } = directions(e, selfId);
  const near = closenessWidth(mine);
  const far = theirs ? closenessWidth(theirs) : near;
  return {
    touchesSelf: true,
    widthNearSelf: near,
    widthNearOther: far,
    asymmetric: near !== far,
    mine,
    theirs,
    ...common,
  };
}
