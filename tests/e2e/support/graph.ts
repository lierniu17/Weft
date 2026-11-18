/** e2e helpers for the relationship graph: its read-only state and real clicks on people. */
import { expect, type Page } from "@playwright/test";

/** What the graph on the page shows, by name (「我」 for 本人). */
export type GraphView = {
  visible: string[];
  emphasized: string[] | null;
  faded: string[];
  labels: string[];
  /** Pairs of drawn names (people, rings, sectors, groups) whose boxes intersect. */
  labelOverlaps: string[];
  halos: string[];
  theme: string;
  animating: boolean;
  highlight: { kind: string; litSteps: number; steps: number; pairLabel: string | null } | null;
  /** Lines by their two names, sorted: "张伟|李明" → colour etc. */
  edges: Record<string, { color: string; tense: boolean; alpha: number }>;
  rings: Record<string, number>;
  /** Angle around 我 in degrees (0 = 3 o’clock, clockwise). */
  angles: Record<string, number>;
};

type Handle = {
  state: () => {
    visible: string[];
    emphasized: string[] | null;
    faded: string[];
    labels: string[];
    labelBoxes: { id: string; text: string; x: number; y: number; w: number; h: number }[];
    halos: string[];
    theme: { name: string };
    animating: boolean;
    highlight: GraphView["highlight"];
    edges: Record<
      string,
      { source: string; target: string; color: string; tense: boolean; alpha: number }
    >;
  };
  nameOf: (id: string) => string | undefined;
  idOf: (name: string) => string | undefined;
  clientPosition: (id: string) => { x: number; y: number } | null;
  screenNodes: () => { id: string; x: number; y: number; r: number }[];
};

/** The page's graph state (window.__weftGraph, exposed in dev and opted-in e2e builds). */
export async function graphView(page: Page): Promise<GraphView> {
  return page.evaluate(() => {
    const g = (window as unknown as { __weftGraph?: Handle }).__weftGraph;
    if (!g) throw new Error("no graph on the page");
    const s = g.state();
    const name = (id: string) => g.nameOf(id) ?? id;
    const edges: GraphView["edges"] = {};
    for (const e of Object.values(s.edges)) {
      edges[[name(e.source), name(e.target)].sort().join("|")] = {
        color: e.color,
        tense: e.tense,
        alpha: e.alpha,
      };
    }
    // distance from 我 in px, for ring checks
    const discs = g.screenNodes();
    const me = discs.find((d) => g.nameOf(d.id) === "我");
    const rings: Record<string, number> = {};
    const angles: Record<string, number> = {};
    for (const d of discs) {
      if (!me) continue;
      rings[name(d.id)] = Math.round(Math.hypot(d.x - me.x, d.y - me.y));
      angles[name(d.id)] = (Math.atan2(d.y - me.y, d.x - me.x) * 180) / Math.PI;
    }
    const boxes = s.labelBoxes;
    const labelOverlaps: string[] = [];
    for (let i = 0; i < boxes.length; i++) {
      for (let j = i + 1; j < boxes.length; j++) {
        const a = boxes[i];
        const b = boxes[j];
        if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h)
          labelOverlaps.push(`${a.text}|${b.text}`);
      }
    }
    return {
      visible: s.visible.map(name),
      emphasized: s.emphasized ? s.emphasized.map(name) : null,
      faded: s.faded.map(name),
      labels: s.labels.map(name),
      labelOverlaps,
      halos: s.halos,
      theme: s.theme.name,
      animating: s.animating,
      highlight: s.highlight,
      edges,
      rings,
      angles,
    };
  }) as Promise<GraphView>;
}

/** Waits for the graph to be drawn with at least `min` people. */
export async function graphReady(page: Page, min = 2) {
  await expect
    .poll(async () => (await graphView(page).catch(() => null))?.visible.length ?? 0)
    .toBeGreaterThanOrEqual(min);
}

/** Clicks a person where they are drawn, with the real mouse. */
export async function clickPerson(page: Page, name: string) {
  const at = await page.evaluate((n) => {
    const g = (window as unknown as { __weftGraph?: Handle }).__weftGraph;
    const id = g?.idOf(n);
    return id ? (g?.clientPosition(id) ?? null) : null;
  }, name);
  if (!at) throw new Error(`no ${name} on the graph`);
  await page.mouse.click(at.x, at.y);
  // Sigma reads two clicks within 300ms as a double-click zoom.
  await page.waitForTimeout(350);
}
