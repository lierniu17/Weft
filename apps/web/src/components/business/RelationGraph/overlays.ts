/**
 * The renderer's Canvas 2D layers around Sigma's WebGL ones: background, stars, rings,
 * sectors, halos (graph-bg); the answer path and flowing dots (graph-path); initials,
 * names, arcs, dots, pulses and the pair label (graph-fx).
 */
import type { Category } from "../../../contracts/draft.ts";
import { CATEGORY_TOKEN } from "../../../lib/graph/edgeStyle.ts";
import { graphLabels } from "../../../lib/graph/graphLabels.ts";
import type { PlacedLabel } from "../../../lib/graph/labelPlacement.ts";
import { withAlpha } from "../../../lib/graph/scene.ts";
import { tokens } from "../../../tokens.gen.ts";
import type { GraphRenderer } from "./renderer.ts";
import { labelRadius, worldRadius } from "./sceneRules.ts";
import { tweenValue } from "./tween.ts";
import { CURVE, type GraphScene, PATH_STEP_MS } from "./types.ts";

type OverlayHost = GraphRenderer;

const glyphs = new Map<string, HTMLCanvasElement>();

/** A person's initial pre-rendered at 2× (drawImage is much cheaper than fillText). */
function glyph(char: string, px: number, color: string, font: string): HTMLCanvasElement {
  const key = `${char}|${px}|${color}|${font}`;
  let c = glyphs.get(key);
  if (!c) {
    if (glyphs.size > 2000) glyphs.clear();
    c = document.createElement("canvas");
    const size = Math.ceil(px * 1.4) * 2;
    c.width = size;
    c.height = size;
    const g = c.getContext("2d") as CanvasRenderingContext2D;
    g.scale(2, 2);
    g.font = `600 ${px}px ${font}`;
    g.fillStyle = color;
    g.textAlign = "center";
    g.textBaseline = "middle";
    g.fillText(char, size / 4, size / 4);
    glyphs.set(key, c);
  }
  return c;
}

function prepare(host: OverlayHost, canvas: HTMLCanvasElement) {
  const { width, height } = host.sigma.getDimensions();
  const dpr = Math.min(2, window.devicePixelRatio || 1);
  if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
  }
  const ctx = canvas.getContext("2d") as CanvasRenderingContext2D;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, width, height);
  return { ctx, width, height };
}

/** Redraw the three overlay canvases for the current camera and time. */
export function drawOverlays(
  host: OverlayHost,
  now: number,
  force = false,
  /** The loop's own frames: the foreground only changes when something pulses. */
  foreground = true,
) {
  const scene = host.scene;
  if (!scene) return;
  if (!force && now - host.lastOverlay < 4) return;
  host.lastOverlay = now;
  const T = now / 1000;
  const ratio = host.sigma.getGraphToViewportRatio();
  const zoom = 1 / host.sigma.getCamera().ratio;
  const origin = host.sigma.graphToViewport({ x: 0, y: 0 });
  const toScreen = (x: number, y: number) => host.sigma.graphToViewport({ x, y: -y });
  host.font ||= getComputedStyle(host.container).fontFamily || "sans-serif";
  const font = host.font;
  // names move only when something moves: place them on the frames that redraw people
  if (foreground) host.placed = placeNames(host, scene, now, ratio, zoom, origin, font);
  drawBackground(host, scene, now, T, ratio, origin, toScreen, font);
  drawPath(host, scene, now, T, origin, toScreen);
  if (foreground) drawForeground(host, scene, now, T, ratio, toScreen, font);
}

/** Where every name goes now (graph-viz AC-11): no two overlap, none covers a disc. */
function placeNames(
  host: OverlayHost,
  scene: GraphScene,
  now: number,
  ratio: number,
  zoom: number,
  origin: { x: number; y: number },
  font: string,
): PlacedLabel[] {
  const drawn: { id: string; x: number; y: number; scale: number }[] = [];
  for (const n of scene.data.nodes) {
    const s = host.nodes.get(n.id);
    if (!s) continue;
    const scale = tweenValue(s.scale, now);
    if (tweenValue(s.alpha, now) < 0.02 || scale < 0.02) continue;
    drawn.push({ id: n.id, ...host.position(n.id, now), scale });
  }
  const halos = host.halos.map((h) => {
    const { x, y, reach } = haloNow(host, h.members, now);
    return { id: h.id, name: h.name, x, y, r: reach };
  });
  const placed = graphLabels({
    data: scene.data,
    layout: scene.layout,
    drawn,
    ringRadii: host.ringTweens.map((t) => tweenValue(t, now)),
    sectorRadius: labelRadius(scene.layout),
    halos,
    emphasized: host.emphasized,
    focusId: scene.focusId,
    compact: scene.compact,
    zoom,
    origin,
    ratio,
    measure: (text, px) => measure(host, text, px, font),
  });
  host.lastLabels = placed.filter((l) => l.kind === "person").map((l) => l.id);
  host.lastTruncated = {};
  for (const n of scene.data.nodes) {
    const l = placed.find((p) => p.id === n.id);
    if (l && l.text !== n.name) host.lastTruncated[n.id] = n.name;
  }
  return placed;
}

const widths = new Map<string, number>();

function measure(host: OverlayHost, text: string, px: number, font: string): number {
  const key = `${px}|${font}|${text}`;
  let w = widths.get(key);
  if (w === undefined) {
    if (widths.size > 4000) widths.clear();
    const ctx = host.fx.getContext("2d") as CanvasRenderingContext2D;
    // measured semibold (sector names are): a regular name fits its box with room to spare
    ctx.font = `600 ${px}px ${font}`;
    w = Math.ceil(ctx.measureText(text).width);
    widths.set(key, w);
  }
  return w;
}

/** A halo around where its members are now (world units, y down). */
function haloNow(host: OverlayHost, members: string[], now: number) {
  const pts = members.map((id) => host.position(id, now));
  const x = pts.reduce((s, p) => s + p.x, 0) / pts.length;
  const y = pts.reduce((s, p) => s + p.y, 0) / pts.length;
  const reach = Math.max(...pts.map((p) => Math.hypot(p.x - x, p.y - y))) + 30;
  return { x, y, reach };
}

/** Draw a placed name: left-aligned in its box, vertically centred. */
function drawLabel(ctx: CanvasRenderingContext2D, l: PlacedLabel) {
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(l.text, l.box.x, l.box.y + l.box.h / 2);
}

function drawBackground(
  host: OverlayHost,
  scene: GraphScene,
  now: number,
  T: number,
  ratio: number,
  origin: { x: number; y: number },
  toScreen: (x: number, y: number) => { x: number; y: number },
  font: string,
) {
  const { ctx, width, height } = prepare(host, host.bg);
  const { theme, layout } = scene;
  if (theme.stars) {
    const g = ctx.createRadialGradient(
      origin.x,
      origin.y,
      0,
      origin.x,
      origin.y,
      Math.max(width, height) * 0.75,
    );
    g.addColorStop(0, theme.background[0]);
    g.addColorStop(1, theme.background[1]);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = theme.star ?? tokens.color["graph-dark-star"];
    for (const s of host.stars) {
      ctx.globalAlpha = scene.reducedMotion ? 0.6 : 0.4 + 0.4 * Math.sin(T * 1.3 + s.t);
      ctx.fillRect(s.x - s.r, s.y - s.r, s.r * 2, s.r * 2);
    }
    ctx.globalAlpha = 1;
  } else {
    ctx.fillStyle = theme.background[0];
    ctx.fillRect(0, 0, width, height);
  }

  // rings + ring names (位置有含义：离中心越近越亲密)
  const radii = host.ringTweens.map((t) => tweenValue(t, now) * ratio);
  ctx.lineWidth = 1;
  radii.forEach((r, i) => {
    ctx.strokeStyle = theme.ring;
    ctx.setLineDash(i === radii.length - 1 ? [3, 4] : []);
    ctx.beginPath();
    ctx.arc(origin.x, origin.y, r, 0, Math.PI * 2);
    ctx.stroke();
  });
  ctx.setLineDash([]);
  const placed = host.placed;
  ctx.font = `11px ${font}`;
  ctx.fillStyle = theme.ringLabel;
  for (const l of placed) if (l.kind === "ring") drawLabel(ctx, l);

  // sector lines + names
  const outer = labelRadius(layout) * ratio;
  ctx.font = `600 12px ${font}`;
  for (const s of layout.sectors) {
    ctx.strokeStyle = theme.ring;
    ctx.globalAlpha = 0.6;
    ctx.beginPath();
    ctx.moveTo(origin.x, origin.y);
    ctx.lineTo(origin.x + Math.cos(s.start) * outer, origin.y + Math.sin(s.start) * outer);
    ctx.stroke();
    const l = placed.find((p) => p.id === `sector:${s.category}`);
    if (!l) continue;
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = theme.categories[CATEGORY_TOKEN[s.category]];
    drawLabel(ctx, l);
  }
  ctx.globalAlpha = 1;

  // group halos (not on phones)
  const drawn: string[] = [];
  const lit = host.emphasized;
  for (const h of host.halos) {
    const { x: cx, y: cy, reach } = haloNow(host, h.members, now);
    const c = toScreen(cx, cy);
    const rad = reach * ratio;
    const color = theme.categories[CATEGORY_TOKEN[h.category]];
    const a = lit ? 0.04 : theme.glow ? 0.16 : 0.08;
    const g = ctx.createRadialGradient(c.x, c.y, rad * 0.2, c.x, c.y, rad);
    g.addColorStop(0, withAlpha(color, a));
    g.addColorStop(1, withAlpha(color, 0));
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(c.x, c.y, rad, 0, Math.PI * 2);
    ctx.fill();
    // its name on the outer edge, unless it would cover another name or someone
    const l = placed.find((p) => p.id === `group:${h.id}`);
    if (l) {
      ctx.fillStyle = withAlpha(color, lit ? 0.3 : 0.8);
      ctx.font = `11px ${font}`;
      drawLabel(ctx, l);
    }
    drawn.push(h.name);
  }
  host.lastHalos = drawn;
}

function drawPath(
  host: OverlayHost,
  scene: GraphScene,
  now: number,
  T: number,
  origin: { x: number; y: number },
  toScreen: (x: number, y: number) => { x: number; y: number },
) {
  const { ctx } = prepare(host, host.mid);
  const { theme } = scene;
  const h = scene.highlight;
  if (h?.kind === "path") {
    const progress = scene.reducedMotion
      ? Number.POSITIVE_INFINITY
      : (now - host.highlightStart) / PATH_STEP_MS;
    ctx.strokeStyle = theme.path;
    ctx.lineWidth = 4;
    ctx.lineCap = "round";
    h.sequence.forEach(([a, b], i) => {
      const f = Math.max(0, Math.min(1, progress - i));
      if (f <= 0 || !host.graph.hasNode(a) || !host.graph.hasNode(b)) return;
      const pa = host.position(a, now);
      const pb = host.position(b, now);
      const s = toScreen(pa.x, pa.y);
      const e = toScreen(pb.x, pb.y);
      if (theme.glow) {
        ctx.shadowColor = theme.path;
        ctx.shadowBlur = 16;
      }
      ctx.beginPath();
      ctx.moveTo(s.x, s.y);
      ctx.lineTo(s.x + (e.x - s.x) * f, s.y + (e.y - s.y) * f);
      ctx.stroke();
      ctx.shadowBlur = 0;
      if (f >= 1 && !scene.reducedMotion) {
        ctx.fillStyle = theme.glow ? theme.path : theme.nodeFill;
        for (let j = 0; j < 3; j++) {
          const u = (T * 0.6 + j / 3 + i * 0.17) % 1;
          ctx.beginPath();
          ctx.arc(s.x + (e.x - s.x) * u, s.y + (e.y - s.y) * u, 2.4, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    });
  }
  // starfield: slow dots flowing along 亲近 and closer lines (not on phones, not when lit)
  let dots = 0;
  if (theme.stars && !scene.reducedMotion && !scene.compact && !host.emphasized) {
    const center = scene.data.center_id;
    let k = 0;
    for (const e of scene.data.edges) {
      k++;
      if (e.source !== center && e.target !== center) continue;
      const other = e.source === center ? e.target : e.source;
      const l = scene.layout.nodes[other];
      if (!scene.visible.has(other) || !l) continue;
      if (l.closeness !== "intimate" && l.closeness !== "close") continue;
      const st = host.styles.get(e.id);
      const p = host.position(other, now);
      const q = toScreen(p.x, p.y);
      const u = (T * 0.18 + k * 0.137) % 1;
      ctx.fillStyle = withAlpha(st ? theme.categories[st.categoryToken] : theme.selfStroke, 0.9);
      ctx.beginPath();
      ctx.arc(
        origin.x + (q.x - origin.x) * u,
        origin.y + (q.y - origin.y) * u,
        1.6,
        0,
        Math.PI * 2,
      );
      ctx.fill();
      dots++;
    }
  }
  host.flowingDots = dots;
}

function drawForeground(
  host: OverlayHost,
  scene: GraphScene,
  now: number,
  T: number,
  ratio: number,
  toScreen: (x: number, y: number) => { x: number; y: number },
  font: string,
) {
  const { ctx } = prepare(host, host.fx);
  const { theme, layout, data } = scene;
  const names = new Map(
    host.placed.filter((l) => l.kind === "person").map((l) => [l.id, l] as const),
  );
  const pulsing = new Set(host.pulsing());
  ctx.textAlign = "center";
  for (const n of data.nodes) {
    const s = host.nodes.get(n.id);
    if (!s) continue;
    const alpha = tweenValue(s.alpha, now);
    const scale = tweenValue(s.scale, now);
    if (alpha < 0.02 || scale < 0.02) continue;
    const isCenter = n.id === data.center_id;
    const l = layout.nodes[n.id];
    const p = host.position(n.id, now);
    const c = toScreen(p.x, p.y);
    const r = worldRadius(l, isCenter, layout) * scale * ratio;
    const color = l?.primaryCategory
      ? theme.categories[CATEGORY_TOKEN[l.primaryCategory]]
      : theme.thirdParty;
    ctx.globalAlpha = alpha;

    if (pulsing.has(n.id)) {
      const pr = scene.reducedMotion ? 0.3 : (T * 1.2) % 1;
      ctx.strokeStyle = withAlpha(theme.pulse, scene.reducedMotion ? 0.8 : 1 - pr);
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(c.x, c.y, r + 4 + pr * 12, 0, Math.PI * 2);
      ctx.stroke();
    }
    // more than one relationship type: short arcs in the other categories' colours
    if (l?.otherCategories.length) {
      ctx.lineWidth = 2.5;
      l.otherCategories.forEach((cat: Category, k: number) => {
        const a0 = -Math.PI / 2 + 0.35 + k * 0.85;
        ctx.strokeStyle = theme.categories[CATEGORY_TOKEN[cat]];
        ctx.beginPath();
        ctx.arc(c.x, c.y, r + 3.5, a0, a0 + 0.6);
        ctx.stroke();
      });
    }
    // initial
    if (r >= 5) {
      const ink = isCenter ? theme.selfText : theme.glow ? theme.text : color;
      const sprite = glyph(
        n.is_self ? "我" : (Array.from(n.name)[0] ?? ""),
        Math.round(r * 0.95),
        ink,
        font,
      );
      const w = sprite.width / 2;
      ctx.drawImage(sprite, c.x - w / 2, c.y - w / 2 + 0.5, w, w);
    }
    if (!isCenter && host.hearsay.has(n.id)) {
      ctx.fillStyle = theme.hearsayDot;
      ctx.beginPath();
      ctx.arc(c.x + r * 0.75, c.y - r * 0.75, 3, 0, Math.PI * 2);
      ctx.fill();
    }
    // name (semantic zoom; placed so that no two overlap)
    const name = names.get(n.id);
    if (name) {
      ctx.font = `${name.fontSize}px ${font}`;
      ctx.fillStyle = theme.text;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(name.text, name.box.x + name.box.w / 2, name.box.y + name.box.h / 2);
      ctx.textBaseline = "alphabetic";
    }
  }
  ctx.globalAlpha = 1;
  // pair answer: name the relationship on the lit line
  const pair = host.pairLabel();
  const h = scene.highlight;
  if (pair && h?.kind === "pair") {
    const [a, b] = h.edges[0];
    if (host.graph.hasNode(a) && host.graph.hasNode(b)) {
      const pa = toScreen(host.position(a, now).x, host.position(a, now).y);
      const pb = toScreen(host.position(b, now).x, host.position(b, now).y);
      const o = toScreen(0, 0);
      const mx = (pa.x + pb.x) / 2;
      const my = (pa.y + pb.y) / 2;
      const tense = pair.includes("紧张");
      ctx.font = `600 12px ${font}`;
      ctx.textAlign = "left";
      ctx.fillStyle = tense ? theme.tense : theme.text;
      ctx.fillText(pair, mx + (mx - o.x) * CURVE + 6, my + (my - o.y) * CURVE);
    }
  }
}
