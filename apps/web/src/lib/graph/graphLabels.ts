/**
 * Which names the graph would like to show and where they could go, in screen space
 * (graph-viz AC-11): semantic zoom (`labelShown`), ring / sector / group names, every disc —
 * then `placeLabels` keeps them apart. The renderer passes what is on screen right now
 * (tweened positions, camera); tests pass a layout at rest.
 */
import type { Schemas } from "../../api/client.ts";
import {
  type LabelScene,
  type Measure,
  type PlacedLabel,
  placeLabels,
  truncateName,
} from "./labelPlacement.ts";
import { type GraphLayout, worldRadius } from "./layout.ts";
import { labelShown } from "./scene.ts";

/** Font sizes (px) of the graph's names. */
export const LABEL_FONT = { person: 12, personCompact: 11, ring: 11, sector: 12, group: 11 };
/** Ring names show on phones only zoomed in; group names only not zoomed far out. */
const RING_LABEL_ZOOM_COMPACT = 1.1;
const GROUP_LABEL_ZOOM = 0.7;

export type LabelView = {
  data: Pick<Schemas["GraphOut"], "center_id" | "nodes">;
  layout: GraphLayout;
  /** People drawn now: world position (y down) and size factor (0..1). */
  drawn: { id: string; x: number; y: number; scale: number }[];
  /** Ring radii now (world). */
  ringRadii: number[];
  /** Where sector names sit (world radius). */
  sectorRadius: number;
  /** Group halos now (world). */
  halos: { id: string; name: string; x: number; y: number; r: number }[];
  emphasized: ReadonlySet<string> | null;
  focusId: string | null;
  compact: boolean;
  /** × the fitted view. */
  zoom: number;
  /** World → screen: origin (screen position of 我) and px per world unit. */
  origin: { x: number; y: number };
  ratio: number;
  measure: Measure;
};

export function labelScene(v: LabelView): LabelScene {
  const { origin, ratio, layout, data } = v;
  const at = (x: number, y: number) => ({ x: origin.x + x * ratio, y: origin.y + y * ratio });
  const byId = new Map(data.nodes.map((n) => [n.id, n]));
  const discs = v.drawn.map((d) => {
    const p = at(d.x, d.y);
    const r = worldRadius(layout.nodes[d.id], d.id === data.center_id, layout) * d.scale * ratio;
    return { id: d.id, x: p.x, y: p.y, r };
  });
  const persons: LabelScene["persons"] = [];
  v.drawn.forEach((d, i) => {
    const n = byId.get(d.id);
    const l = layout.nodes[d.id];
    if (!n || n.is_self) return;
    const isCenter = d.id === data.center_id;
    const shown = labelShown(
      { closeness: l?.closeness ?? null, isCenter },
      { id: d.id, zoom: v.zoom, compact: v.compact, emphasized: v.emphasized },
    );
    if (!shown) return;
    persons.push({
      ...discs[i],
      text: truncateName(n.name),
      ring: l?.ring ?? 6,
      focused: d.id === v.focusId,
      lit: v.emphasized?.has(d.id) ?? false,
    });
  });
  const showRings = !v.compact || v.zoom > RING_LABEL_ZOOM_COMPACT;
  return {
    origin,
    rings: showRings
      ? v.ringRadii.map((r, i) => ({ label: layout.rings[i]?.label ?? "", r: r * ratio }))
      : [],
    sectors: layout.sectors.map((s) => ({
      id: s.category,
      label: s.label,
      angle: (s.start + s.end) / 2,
      r: v.sectorRadius * ratio + 6,
    })),
    halos:
      v.zoom > GROUP_LABEL_ZOOM
        ? v.halos.map((h) => ({ ...h, ...at(h.x, h.y), r: h.r * ratio }))
        : [],
    persons,
    discs,
    font: {
      person: v.compact ? LABEL_FONT.personCompact : LABEL_FONT.person,
      ring: LABEL_FONT.ring,
      sector: LABEL_FONT.sector,
      group: LABEL_FONT.group,
    },
    measure: v.measure,
  };
}

/** The names to draw and where. */
export function graphLabels(v: LabelView): PlacedLabel[] {
  return placeLabels(labelScene(v));
}
