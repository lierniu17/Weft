/**
 * The RelationGraph renderer: Sigma.js (WebGL) + graphology, driven by a declarative scene.
 *
 * React computes *what* to show (layout from `layoutGraph`, who is visible, focus, answer
 * highlight, theme); this class owns Sigma and three overlay canvases and animates between
 * scenes:
 *
 *   graph-bg   (under the lines)   background, stars, rings + ring names, sector lines +
 *                                   names, group halos + names
 *   edges      (Sigma, WebGL)     every line, GraphEdgeProgram
 *   graph-path (over the lines)    answer path lit link by link, particles, starfield flow
 *   nodes      (Sigma, WebGL)     every person, GraphNodeProgram
 *   graph-fx   (over everything)  initials, names, multi-type arcs, hearsay dots, pulses,
 *                                   pair label
 *
 * Positions come from the layout (never a force simulation). The animation loop only runs
 * while something moves: a transition (focus fade 200 ms, time travel radial easing), the
 * answer path, pulses, or the starfield's stars and flowing dots — and never with reduced
 * motion. `state()` exposes what is shown for tests, instead of pixels.
 */
import Graph from "graphology";
import type { Attributes } from "graphology-types";
import Sigma from "sigma";
import { edgeKey } from "../../../lib/graph/answerHighlight.ts";
import {
  CATEGORY_TOKEN,
  DASH,
  type EdgeStyle,
  edgeStyle,
  THIRD_PARTY_WIDTH,
} from "../../../lib/graph/edgeStyle.ts";
import type { PlacedLabel } from "../../../lib/graph/labelPlacement.ts";
import { groupHalos, type Halo, hearsayNodes } from "../../../lib/graph/scene.ts";
import { debugState } from "./debugState.ts";
import { drawOverlays } from "./overlays.ts";
import { createGraphEdgeProgram, GraphNodeProgram } from "./programs.ts";
import {
  edgeColor,
  emphasis,
  labelRadius,
  type Star,
  seedStars,
  worldRadius,
} from "./sceneRules.ts";
import { nearestAngle, type Tween, tween, tweening, tweenTo, tweenValue } from "./tween.ts";
import {
  APPEAR_MS,
  CURVE,
  FADE_MS,
  type GraphCallbacks,
  type GraphDebugState,
  type GraphScene,
  MAX_ZOOM,
  MIN_ZOOM,
  MOVE_MS,
  PATH_STEP_MS,
} from "./types.ts";

export type { GraphDebugState, GraphScene };

type NodeState = {
  angle: Tween;
  radius: Tween;
  alpha: Tween;
  scale: Tween;
  leaving: boolean;
};

type EdgeState = { alpha: Tween; leaving: boolean };

export class GraphRenderer {
  readonly graph = new Graph({ multi: true, type: "undirected" });
  readonly sigma: Sigma;
  readonly bg: HTMLCanvasElement;
  readonly mid: HTMLCanvasElement;
  readonly fx: HTMLCanvasElement;
  scene: GraphScene | null = null;
  nodes = new Map<string, NodeState>();
  edgeStates = new Map<string, EdgeState>();
  styles = new Map<string, EdgeStyle>();
  ringTweens: Tween[] = [];
  emphasized: Set<string> | null = null;
  hearsay = new Set<string>();
  halos: Halo[] = [];
  stars: Star[] = [];
  highlightStart = 0;
  bbox = 0;
  raf = 0;
  lastLabels: string[] = [];
  lastTruncated: Record<string, string> = {};
  lastHalos: string[] = [];
  /** Every name drawn in the last frame and where (no two overlap). */
  placed: PlacedLabel[] = [];
  flowingDots = 0;
  /** When the overlays were last drawn, and with which font (read once). */
  lastOverlay = 0;
  font = "";
  readonly unsubscribe: () => void;

  constructor(
    readonly container: HTMLElement,
    private readonly callbacks: GraphCallbacks,
  ) {
    const center = () => {
      const p = this.sigma.graphToViewport({ x: 0, y: 0 });
      return { x: p.x, y: p.y };
    };
    this.sigma = new Sigma(this.graph, container, {
      renderLabels: false,
      renderEdgeLabels: false,
      enableEdgeEvents: false,
      allowInvalidContainer: true,
      zIndex: true,
      stagePadding: 16,
      minCameraRatio: 1 / MAX_ZOOM,
      maxCameraRatio: 1 / MIN_ZOOM,
      defaultNodeType: "graph",
      defaultEdgeType: "graph",
      nodeProgramClasses: { graph: GraphNodeProgram },
      edgeProgramClasses: { graph: createGraphEdgeProgram(center) },
      defaultDrawNodeHover: () => {},
      nodeReducer: (id, attrs) => this.nodeDisplay(id, attrs),
      edgeReducer: (id) => this.edgeDisplay(id),
    });
    this.bg = this.sigma.createCanvas("graph-bg", { beforeLayer: "edges" });
    this.mid = this.sigma.createCanvas("graph-path", { afterLayer: "edges" });
    this.fx = this.sigma.createCanvas("graph-fx", { afterLayer: "hoverNodes" });
    for (const c of [this.bg, this.mid, this.fx]) {
      c.style.pointerEvents = "none";
      c.style.inset = "0";
    }
    const onAfterRender = () => drawOverlays(this, performance.now(), true);
    // Hover picking reads the GPU back on every mouse move; while dragging nothing can be
    // hovered, so skip it (keeps panning smooth).
    const picker = this.sigma as unknown as {
      getNodeAtPosition: (p: { x: number; y: number }) => string | null;
      hoveredNode: string | null;
    };
    const pick = picker.getNodeAtPosition.bind(picker);
    const captor = this.sigma.getMouseCaptor();
    picker.getNodeAtPosition = (p) => (captor.isMouseDown ? picker.hoveredNode : pick(p));
    const onClickNode = ({ node }: { node: string }) => this.callbacks.onNodeClick(node);
    const onClickStage = () => this.callbacks.onStageClick();
    const onEnter = ({ node }: { node: string }) => {
      container.style.cursor = "pointer";
      const p = this.screen(node);
      const name = this.nameOf(node);
      if (p) this.callbacks.onHover({ id: node, name, x: p.x, y: p.y });
    };
    const onLeave = () => {
      container.style.cursor = "";
      this.callbacks.onHover(null);
    };
    const onCamera = () => this.callbacks.onHover(null);
    this.sigma.on("afterRender", onAfterRender);
    this.sigma.on("clickNode", onClickNode);
    this.sigma.on("clickStage", onClickStage);
    this.sigma.on("enterNode", onEnter);
    this.sigma.on("leaveNode", onLeave);
    this.sigma.getCamera().on("updated", onCamera);
    this.unsubscribe = () => {
      this.sigma.removeListener("afterRender", onAfterRender);
      this.sigma.getCamera().removeListener("updated", onCamera);
    };
  }

  /** Show a new scene; transitions start from wherever things are now. */
  update(scene: GraphScene) {
    const now = performance.now();
    const prev = this.scene;
    this.scene = scene;
    const instant = scene.reducedMotion || !prev;
    const { data, layout } = scene;

    // highlight restarts its sequence whenever it changes
    if (scene.highlight !== prev?.highlight) this.highlightStart = now;
    this.emphasized = emphasis(scene);
    this.hearsay = hearsayNodes(data);
    this.halos = scene.compact ? [] : groupHalos(data, layout, scene.visible);
    if (prev?.compact !== scene.compact || !this.stars.length)
      this.stars = seedStars(this.sigma.getDimensions(), scene.compact);

    // nodes: add new, retarget all, let missing ones leave
    const present = new Set(data.nodes.map((n) => n.id));
    for (const n of data.nodes) {
      const l = layout.nodes[n.id];
      if (!l) continue;
      const visible = scene.visible.has(n.id);
      let s = this.nodes.get(n.id);
      if (!s) {
        s = {
          angle: tween(l.angle),
          radius: tween(l.radius),
          alpha: tween(0),
          scale: tween(instant ? (visible ? 1 : 0) : 0),
          leaving: false,
        };
        this.nodes.set(n.id, s);
      }
      if (!this.graph.hasNode(n.id)) this.graph.addNode(n.id, { x: 0, y: 0, size: 1 });
      s.leaving = false;
      const angle = nearestAngle(tweenValue(s.angle, now), l.angle);
      tweenTo(s.angle, angle, now, instant ? 0 : MOVE_MS);
      tweenTo(s.radius, l.radius, now, instant ? 0 : MOVE_MS);
      tweenTo(s.alpha, this.nodeAlpha(n.id, visible), now, instant ? 0 : FADE_MS);
      tweenTo(s.scale, visible ? 1 : 0, now, instant ? 0 : APPEAR_MS);
    }
    for (const [id, s] of this.nodes) {
      if (present.has(id)) continue;
      s.leaving = true;
      tweenTo(s.alpha, 0, now, instant ? 0 : FADE_MS);
      tweenTo(s.scale, 0, now, instant ? 0 : APPEAR_MS);
    }

    // edges
    const edgeIds = new Set<string>();
    for (const e of data.edges) {
      if (!this.graph.hasNode(e.source) || !this.graph.hasNode(e.target)) continue;
      edgeIds.add(e.id);
      this.styles.set(e.id, edgeStyle(e, data.center_id));
      if (!this.graph.hasEdge(e.id)) this.graph.addEdgeWithKey(e.id, e.source, e.target);
      let s = this.edgeStates.get(e.id);
      if (!s) {
        s = { alpha: tween(0), leaving: false };
        this.edgeStates.set(e.id, s);
      }
      s.leaving = false;
      tweenTo(s.alpha, this.edgeAlpha(e.source, e.target), now, instant ? 0 : FADE_MS);
    }
    for (const [id, s] of this.edgeStates) {
      if (edgeIds.has(id)) continue;
      s.leaving = true;
      tweenTo(s.alpha, 0, now, instant ? 0 : FADE_MS);
    }

    // rings ease with the people on them
    layout.rings.forEach((r, i) => {
      if (!this.ringTweens[i]) this.ringTweens[i] = tween(r.radius);
      tweenTo(this.ringTweens[i], r.radius, now, instant ? 0 : MOVE_MS);
    });

    // frame the whole star (rings and sector names), never shrinking while mounted
    const reach = labelRadius(layout) + 28;
    if (reach > this.bbox) {
      this.bbox = reach;
      this.sigma.setCustomBBox({ x: [-reach, reach], y: [-reach, reach] });
    }
    this.prune(now);
    this.redraw(performance.now());
    this.kick();
  }

  /** Read-only view of what is on screen, for tests (never pixels). */
  state(): GraphDebugState {
    return debugState(this);
  }

  /** Where a person is drawn, in viewport (client) coordinates. */
  clientPosition(id: string): { x: number; y: number } | null {
    const p = this.screen(id);
    if (!p) return null;
    const box = this.container.getBoundingClientRect();
    return { x: box.left + p.x, y: box.top + p.y };
  }

  /** Every shown person's disc on screen (container coordinates, radius in px). */
  screenNodes(): { id: string; x: number; y: number; r: number }[] {
    const scene = this.scene;
    if (!scene) return [];
    const ratio = this.sigma.getGraphToViewportRatio();
    const now = performance.now();
    return [...scene.visible].flatMap((id) => {
      const p = this.screen(id);
      const s = this.nodes.get(id);
      if (!p || !s) return [];
      const isCenter = id === scene.data.center_id;
      const r =
        worldRadius(scene.layout.nodes[id], isCenter, scene.layout) *
        tweenValue(s.scale, now) *
        ratio;
      return [{ id, x: p.x, y: p.y, r }];
    });
  }

  /** Zoom (× the fitted view) around the centre. */
  zoomTo(zoom: number) {
    const camera = this.sigma.getCamera();
    camera.setState({ ...camera.getState(), ratio: 1 / zoom });
  }

  resize() {
    this.sigma.resize();
    this.stars = seedStars(this.sigma.getDimensions(), this.scene?.compact ?? false);
    this.redraw(performance.now());
  }

  kill() {
    cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.unsubscribe();
    this.sigma.kill();
  }

  // ---------------------------------------------------------------------------------------

  nodeAlpha(id: string, visible: boolean): number {
    if (!visible) return 0;
    const lit = this.emphasized;
    return lit && !lit.has(id) ? (this.scene?.theme.fade ?? 0.15) : 1;
  }

  edgeAlpha(a: string, b: string): number {
    const scene = this.scene;
    if (!scene?.visible.has(a) || !scene.visible.has(b)) return 0;
    const lit = this.emphasized;
    return lit && !(lit.has(a) && lit.has(b)) ? scene.theme.fade : 1;
  }

  nameOf(id: string) {
    const n = this.scene?.data.nodes.find((x) => x.id === id);
    return n ? (n.is_self ? "我" : n.name) : "";
  }

  position(id: string, now: number) {
    const s = this.nodes.get(id);
    if (!s) return { x: 0, y: 0 };
    const a = tweenValue(s.angle, now);
    const r = tweenValue(s.radius, now);
    return { x: Math.cos(a) * r, y: Math.sin(a) * r };
  }

  /** Screen position inside the container. */
  screen(id: string) {
    if (!this.graph.hasNode(id)) return null;
    const p = this.position(id, performance.now());
    return this.sigma.graphToViewport({ x: p.x, y: -p.y });
  }

  nodeDisplay(id: string, attrs: Attributes) {
    const scene = this.scene;
    const now = performance.now();
    const s = this.nodes.get(id);
    if (!scene || !s) return { ...attrs, hidden: true };
    const isCenter = id === scene.data.center_id;
    const l = scene.layout.nodes[id];
    const { theme } = scene;
    const p = this.position(id, now);
    const alpha = tweenValue(s.alpha, now);
    const scale = tweenValue(s.scale, now);
    const isSelf = scene.data.nodes.find((n) => n.id === id)?.is_self ?? false;
    const stroke =
      isCenter && isSelf
        ? theme.selfStroke
        : l?.primaryCategory
          ? theme.categories[CATEGORY_TOKEN[l.primaryCategory]]
          : isCenter
            ? theme.selfStroke
            : theme.thirdParty;
    const inferred =
      !isCenter &&
      scene.data.edges.some(
        (e) =>
          (e.source === id || e.target === id) &&
          (e.source === scene.data.center_id || e.target === scene.data.center_id) &&
          e.confidence === "inferred",
      );
    return {
      x: p.x,
      y: -p.y,
      size: worldRadius(l, isCenter, scene.layout) * scale,
      color: stroke,
      fillColor: isCenter ? theme.selfFill : theme.nodeFill,
      strokeWidth: isCenter ? 3 : 2.2,
      glow: theme.glow ? (isCenter ? 18 : 10) : 0,
      dashed: inferred,
      alpha,
      hidden: alpha < 0.01 || scale < 0.02,
      zIndex: this.emphasized?.has(id) ? 2 : isCenter ? 1 : 0,
    };
  }

  edgeWidths(id: string, source: string, st: EdgeStyle): [number, number] {
    if (!st.touchesSelf) {
      const s = this.graph.hasEdge(id) ? this.graph.extremities(id) : [source, ""];
      const hot = this.emphasized?.has(s[0]) && this.emphasized.has(s[1]);
      const w = hot ? THIRD_PARTY_WIDTH * 2 : THIRD_PARTY_WIDTH;
      return [w, w];
    }
    const centerFirst = source === this.scene?.data.center_id;
    return centerFirst
      ? [st.widthNearSelf, st.widthNearOther]
      : [st.widthNearOther, st.widthNearSelf];
  }

  edgeDisplay(id: string) {
    const st = this.styles.get(id);
    const s = this.edgeStates.get(id);
    if (!st || !s || !this.scene) return { hidden: true };
    const alpha = tweenValue(s.alpha, performance.now());
    const [source] = this.graph.extremities(id);
    const [widthSource, widthTarget] = this.edgeWidths(id, source, st);
    return {
      color: edgeColor(this.scene?.theme, st),
      size: Math.max(widthSource, widthTarget),
      widthSource,
      widthTarget,
      dash: DASH[st.dashStyle],
      curve: st.touchesSelf ? 0 : CURVE,
      glow: this.scene.theme.glow ? 4 : 0,
      alpha: st.touchesSelf ? alpha * 0.9 : alpha * (this.emphasized ? 1 : 0.8),
      hidden: alpha < 0.01,
    };
  }

  litSteps(now: number): number {
    const h = this.scene?.highlight;
    if (!h?.sequence.length) return 0;
    if (this.scene?.reducedMotion) return h.sequence.length;
    return Math.min(h.sequence.length, Math.floor((now - this.highlightStart) / PATH_STEP_MS));
  }

  pulsing(): string[] {
    const h = this.scene?.highlight;
    return h && (h.kind === "list" || h.kind === "person")
      ? h.persons.filter((id) => this.scene?.visible.has(id) && id !== this.scene?.data.center_id)
      : [];
  }

  pairLabel(): string | null {
    const scene = this.scene;
    const h = scene?.highlight;
    if (!scene || h?.kind !== "pair") return null;
    const [a, b] = h.edges[0];
    const e = scene.data.edges.find((x) => edgeKey(x.source, x.target) === edgeKey(a, b));
    if (!e) return null;
    const type = e.types[0]?.subtype ?? "";
    return e.status === "tense" ? `${type} · 紧张` : type;
  }

  /** Something keeps changing on screen without input. */
  continuous(): boolean {
    const scene = this.scene;
    if (!scene || scene.reducedMotion) return false;
    if (scene.theme.stars) return true;
    const h = scene.highlight;
    if (h?.kind === "path" && h.sequence.length) return true;
    return this.pulsing().length > 0;
  }

  transitioning(now: number): boolean {
    for (const s of this.nodes.values()) {
      if (
        tweening(s.alpha, now) ||
        tweening(s.scale, now) ||
        tweening(s.angle, now) ||
        tweening(s.radius, now)
      )
        return true;
    }
    for (const s of this.edgeStates.values()) if (tweening(s.alpha, now)) return true;
    return this.ringTweens.some((t) => tweening(t, now));
  }

  /** Drop people and lines that finished leaving. */
  prune(now: number) {
    for (const [id, s] of this.edgeStates) {
      if (s.leaving && !tweening(s.alpha, now)) {
        this.edgeStates.delete(id);
        this.styles.delete(id);
        if (this.graph.hasEdge(id)) this.graph.dropEdge(id);
      }
    }
    for (const [id, s] of this.nodes) {
      if (s.leaving && !tweening(s.alpha, now) && !tweening(s.scale, now)) {
        this.nodes.delete(id);
        if (this.graph.hasNode(id)) this.graph.dropNode(id);
      }
    }
  }

  /** Start the loop if anything moves; it stops itself when nothing does. */
  kick() {
    if (this.raf) return;
    const now = performance.now();
    if (!this.transitioning(now) && !this.continuous()) return;
    let wasTransitioning = true;
    const tick = () => {
      const t = performance.now();
      const moving = this.transitioning(t);
      if (moving || wasTransitioning) {
        this.prune(t);
        this.redraw(performance.now());
      } else {
        drawOverlays(this, t, false, this.pulsing().length > 0);
      }
      wasTransitioning = moving;
      if (moving || this.continuous()) {
        this.raf = requestAnimationFrame(tick);
      } else {
        this.raf = 0;
      }
    };
    this.raf = requestAnimationFrame(tick);
  }

  /** Sigma takes positions from the graph attributes (reducers cannot move nodes). */
  redraw(now: number) {
    this.graph.updateEachNodeAttributes(
      (id, attrs) => {
        const p = this.position(id, now);
        attrs.x = p.x;
        attrs.y = -p.y;
        return attrs;
      },
      { attributes: ["x", "y"] },
    );
    this.sigma.refresh();
  }
}
