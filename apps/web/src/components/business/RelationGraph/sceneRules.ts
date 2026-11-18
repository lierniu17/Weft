/** Pure rules the renderer applies to a scene. */
import type { EdgeStyle } from "../../../lib/graph/edgeStyle.ts";

export { labelRadius, worldRadius } from "../../../lib/graph/layout.ts";

import type { GraphTheme } from "../../../lib/graph/scene.ts";
import type { GraphScene } from "./types.ts";

/** Kept lit: a focus and its links, an answer's people, or the people matching a 淡化 filter. */
export function emphasis(scene: GraphScene): Set<string> | null {
  const center = scene.data.center_id;
  if (scene.focusId) {
    const lit = new Set([scene.focusId, center]);
    for (const e of scene.data.edges) {
      if (e.source === scene.focusId) lit.add(e.target);
      if (e.target === scene.focusId) lit.add(e.source);
    }
    return lit;
  }
  const h = scene.highlight;
  if (h && h.kind !== "none") return new Set(h.persons);
  if (scene.matching) return new Set([...scene.matching, center]);
  return null;
}

export function edgeColor(theme: GraphTheme | undefined, st: EdgeStyle): string {
  if (!theme) return "#000";
  if (st.tense) return theme.tense;
  return st.touchesSelf ? theme.categories[st.categoryToken] : theme.thirdParty;
}

export type Star = { x: number; y: number; r: number; t: number };

/** A fixed star field (seeded, so it does not jump between renders). */
export function seedStars(
  { width, height }: { width: number; height: number },
  compact: boolean,
): Star[] {
  let seed = 7;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return seed / 2147483647;
  };
  return Array.from({ length: compact ? 70 : 160 }, () => ({
    x: rand() * width,
    y: rand() * height,
    r: rand() * 1.2 + 0.2,
    t: rand() * 6,
  }));
}
