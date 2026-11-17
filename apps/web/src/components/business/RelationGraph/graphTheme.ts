/**
 * Cytoscape theme for RelationGraph, derived from the DESIGN.md tokens.
 * Nodes look like Avatar (initial on secondary-1, secondary-6 ring); 本人 looks like
 * Avatar.self (「我」 on primary-1, primary-6 ring); edge width follows closeness.
 */
import type { StylesheetJson } from "cytoscape";
import type { ClosenessLevel } from "../../../contracts/draft.ts";
import { tokens } from "../../../tokens.gen.ts";

const c = tokens.color;
const FONT = "'PingFang SC', 'Inter', 'Noto Sans SC', 'Microsoft YaHei', sans-serif";

export type NodeKind = "self" | "center" | "person";

/** Edge width per closeness: 至交 thickest → 疏远 thinnest; unknown = thinnest. */
export const EDGE_WIDTH: Record<ClosenessLevel, number> = {
  intimate: 4,
  close: 3,
  familiar: 2,
  casual: 1.5,
  distant: 1,
};
export const DEFAULT_EDGE_WIDTH = 1;

const NODE_SIZE = 32;
const CENTER_SIZE = 44;

/** The initial drawn as an SVG background so the node reads like an Avatar. */
export function avatarImage(glyph: string, kind: NodeKind): string {
  const fill = kind === "self" ? c["primary-7"] : c["secondary-7"];
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><text x="32" y="33" text-anchor="middle" dominant-baseline="central" font-family="${FONT.replace(/'/g, "")}" font-size="26" font-weight="600" fill="${fill}">${glyph}</text></svg>`;
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

export const graphStyle: StylesheetJson = [
  {
    selector: "node",
    style: {
      width: NODE_SIZE,
      height: NODE_SIZE,
      shape: "ellipse",
      "background-color": c["secondary-1"],
      "background-image": "data(avatar)",
      "background-fit": "cover",
      "border-width": 1.5,
      "border-color": c["secondary-6"],
      label: "data(label)",
      color: c["neutral-text-secondary"],
      "font-family": FONT,
      "font-size": 11,
      "text-valign": "bottom",
      "text-margin-y": 4,
      "text-max-width": "72px",
      "text-wrap": "ellipsis",
    },
  },
  {
    selector: 'node[kind = "center"]',
    style: { width: CENTER_SIZE, height: CENTER_SIZE, "border-width": 2.5 },
  },
  {
    selector: 'node[kind = "self"]',
    style: {
      "background-color": c["primary-1"],
      "border-color": c["primary-6"],
      "border-width": 2.5,
      color: c["primary-7"],
    },
  },
  {
    selector: 'node[?center][kind = "self"]',
    style: { width: CENTER_SIZE, height: CENTER_SIZE },
  },
  {
    selector: "edge",
    style: {
      width: "data(width)",
      "line-color": c["neutral-border"],
      "curve-style": "bezier",
    },
  },
  {
    selector: "edge[?toCenter]",
    style: { "line-color": c["primary-5"] },
  },
  {
    selector: "node:active",
    style: { "overlay-color": c["primary-6"], "overlay-opacity": 0.12, "overlay-padding": 6 },
  },
];
