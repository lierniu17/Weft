/** The renderer's read-only state for tests: what is shown, never pixels. */
import { CATEGORY_TOKEN } from "../../../lib/graph/edgeStyle.ts";
import type { GraphLayout } from "../../../lib/graph/layout.ts";
import type { GraphTheme } from "../../../lib/graph/scene.ts";
import type { GraphRenderer } from "./renderer.ts";
import { edgeColor } from "./sceneRules.ts";
import { type EdgeDebug, FADE_MS, type GraphDebugState, MOVE_MS, PATH_STEP_MS } from "./types.ts";

export function debugState(r: GraphRenderer): GraphDebugState {
  const scene = r.scene;
  const now = performance.now();
  const visible = scene ? [...scene.visible].filter((id) => r.graph.hasNode(id)) : [];
  const fade = scene?.theme.fade ?? 1;
  const edges: Record<string, EdgeDebug> = {};
  if (scene) {
    for (const e of scene.data.edges) {
      const st = r.styles.get(e.id);
      const s = r.edgeStates.get(e.id);
      if (!st || !s) continue;
      const w = r.edgeWidths(e.id, e.source, st);
      edges[e.id] = {
        source: e.source,
        target: e.target,
        color: edgeColor(r.scene?.theme, st),
        widthSource: w[0],
        widthTarget: w[1],
        dash: st.dashStyle,
        curved: !st.touchesSelf,
        tense: st.tense,
        alpha: s.alpha.to,
      };
    }
  }
  const h = scene?.highlight;
  return {
    visible,
    emphasized: r.emphasized ? [...r.emphasized] : null,
    faded: visible.filter((id) => (r.nodes.get(id)?.alpha.to ?? 1) <= fade + 1e-9),
    labels: r.lastLabels,
    labelBoxes: r.placed.map((l) => ({ id: l.id, kind: l.kind, text: l.text, ...l.box })),
    truncated: r.lastTruncated,
    halos: r.lastHalos,
    arcs: Object.fromEntries(
      Object.values(scene?.layout.nodes ?? ({} as GraphLayout["nodes"]))
        .filter((n) => n.otherCategories.length)
        .map((n) => [n.id, n.otherCategories.map((c) => CATEGORY_TOKEN[c])]),
    ),
    hearsay: [...r.hearsay],
    edges,
    highlight:
      h && h.kind !== "none"
        ? {
            kind: h.kind,
            litSteps: r.litSteps(now),
            steps: h.sequence.length,
            pulsing: r.pulsing(),
            pairLabel: r.pairLabel(),
            particles: h.kind === "path" && !scene?.reducedMotion,
          }
        : null,
    theme: {
      name: scene?.theme.name ?? "light",
      background: scene?.theme.background ?? ["", ""],
      categories: scene?.theme.categories ?? ({} as GraphTheme["categories"]),
      glow: scene?.theme.glow ?? false,
      stars: scene?.theme.stars ? r.stars.length : 0,
      flowingDots: r.flowingDots,
    },
    animating: r.raf !== 0,
    durations: { fade: FADE_MS, pathStep: PATH_STEP_MS, move: MOVE_MS },
    zoom: 1 / r.sigma.getCamera().ratio,
    reducedMotion: scene?.reducedMotion ?? false,
  };
}
