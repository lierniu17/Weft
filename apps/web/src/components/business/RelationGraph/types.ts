/** Scene, callbacks, timings and the read-only debug state of the graph renderer. */
import type { Schemas } from "../../../api/client.ts";
import { type AnswerHighlight, PATH_STEP_SECONDS } from "../../../lib/graph/answerHighlight.ts";
import type { DashStyle } from "../../../lib/graph/edgeStyle.ts";
import type { Box, LabelKind } from "../../../lib/graph/labelPlacement.ts";
import type { GraphLayout } from "../../../lib/graph/layout.ts";
import type { GraphTheme } from "../../../lib/graph/scene.ts";

type GraphData = Schemas["GraphOut"];

export type GraphScene = {
  data: GraphData;
  layout: GraphLayout;
  /** People on the graph now (time point, 只显示符合的人); the rest fade out. */
  visible: ReadonlySet<string>;
  /** Filter in 淡化 mode: people not matching fade. null = no filter. */
  matching: ReadonlySet<string> | null;
  focusId: string | null;
  highlight: AnswerHighlight | null;
  theme: GraphTheme;
  /** < 768px: no halos, no flowing dots, fewer names. */
  compact: boolean;
  reducedMotion: boolean;
};

export type GraphCallbacks = {
  onNodeClick: (id: string) => void;
  onStageClick: () => void;
  onHover: (hover: { id: string; name: string; x: number; y: number } | null) => void;
};

/** Focus / answer fade (AC-10, AC-UI-3). */
export const FADE_MS = 200;
/** Time travel: radial easing to the new ring. */
export const MOVE_MS = 600;
export const APPEAR_MS = 400;
export const PATH_STEP_MS = PATH_STEP_SECONDS * 1000;
/** Lines between two other people bend away from 我 by this share (prototype 0.18). */
export const CURVE = 0.18;
export { SMALL_NODE } from "../../../lib/graph/layout.ts";
/** Prototype zoom range. */
export const MIN_ZOOM = 0.55;
export const MAX_ZOOM = 2.4;

export type EdgeDebug = {
  source: string;
  target: string;
  color: string;
  widthSource: number;
  widthTarget: number;
  dash: DashStyle;
  curved: boolean;
  tense: boolean;
  alpha: number;
};

export type GraphDebugState = {
  /** Person ids on the graph (targets, not mid-transition values). */
  visible: string[];
  /** Kept lit by a focus, an answer or a 淡化 filter; null = everything as is. */
  emphasized: string[] | null;
  /** Visible but faded to `theme.fade`. */
  faded: string[];
  /** Ids whose name was drawn in the last frame. */
  labels: string[];
  /** Every name drawn in the last frame (people, rings, sectors, groups) and its box on
   *  screen (container px): no two intersect. Ids: person id, ring:<i>, sector:<category>,
   *  group:<id>. */
  labelBoxes: ({ id: string; kind: LabelKind; text: string } & Box)[];
  /** Names that were truncated in the last frame (id → full name). */
  truncated: Record<string, string>;
  /** Group names whose halo was drawn in the last frame. */
  halos: string[];
  /** Id → category tokens of the extra arcs around the node. */
  arcs: Record<string, string[]>;
  hearsay: string[];
  edges: Record<string, EdgeDebug>;
  highlight: {
    kind: AnswerHighlight["kind"];
    /** Links of the path fully lit so far. */
    litSteps: number;
    steps: number;
    pulsing: string[];
    pairLabel: string | null;
    particles: boolean;
  } | null;
  theme: {
    name: GraphTheme["name"];
    background: [string, string];
    categories: GraphTheme["categories"];
    glow: boolean;
    stars: number;
    flowingDots: number;
  };
  animating: boolean;
  durations: { fade: number; pathStep: number; move: number };
  zoom: number;
  reducedMotion: boolean;
};
