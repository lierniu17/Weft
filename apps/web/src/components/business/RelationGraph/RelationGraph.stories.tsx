import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { answerHighlight } from "../../../lib/graph/answerHighlight.ts";
import { overlappingLabels } from "../../../lib/graph/labelPlacement.ts";
import { graphTheme } from "../../../lib/graph/scene.ts";
import { tokens } from "../../../tokens.gen.ts";
import { CROWD_30, CROWD_200, PATH_ANSWER, SAMPLE, SEED, SELF } from "./graphFixtures.ts";
import { RelationGraph } from "./RelationGraph.tsx";
import { clickAt, clickPerson, live, onReady, ready, sleep } from "./storyHelpers.ts";

const meta = {
  // a fresh handle per story: never assert on the previous story's graph
  beforeEach: () => {
    live.graph = undefined;
  },
  title: "Business/RelationGraph",
  component: RelationGraph,
  args: {
    variant: "panorama",
    data: SAMPLE,
    onOpenPerson: fn(),
    onReady,
    compact: false,
    reducedMotion: false,
  },
  decorators: [
    (Story) => (
      <div className="h-[640px] w-[960px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof RelationGraph>;

export default meta;
type Story = StoryObj<typeof meta>;

const ALL = SAMPLE.nodes.length;

/**
 * Panorama, 清蓝: rings by closeness, sectors by category, encoded lines, halos behind
 * groups (AC-5, AC-6, AC-8, AC-UI-2). The canvas has a readable name.
 */
export const Panorama: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("img", { name: `全景图，共 ${ALL} 人` })).toBeVisible();
    const g = await ready(ALL);
    const s = g.state();
    // theme parameters come from the DESIGN.md tokens
    await expect(s.theme.name).toBe("light");
    await expect(s.theme.categories).toEqual(graphTheme("light").categories);
    await expect(s.theme.glow).toBe(false);
    await expect(s.theme.stars).toBe(0);
    // 我 → 他: category colour; tense is red; widths at each end; dash by confidence
    const self = (id: string) =>
      Object.values(s.edges).find(
        (e) => (e.source === SELF && e.target === id) || (e.target === SELF && e.source === id),
      );
    await expect(self("wife")?.color).toBe(tokens.color["graph-kin"]);
    await expect(self("ex")?.color).toBe(tokens.color["graph-romance"]);
    await expect(self("zk")?.color).toBe(tokens.color["graph-interest"]);
    await expect(self("mc")?.color).toBe(tokens.color["graph-hostile"]);
    await expect(self("gj")?.dash).toBe("dashed");
    await expect(self("long")?.dash).toBe("dotted");
    await expect(self("wife")?.widthSource).toBeGreaterThan(self("zt")?.widthSource ?? 99);
    // asymmetric: 我对小李 亲近, 小李对我 至交 → the far end is wider (AC-7)
    const li = self("li");
    await expect(li?.source).toBe(SELF);
    await expect(li?.widthTarget).toBeGreaterThan(li?.widthSource ?? 99);
    // third parties: thin, bent outwards, same dash and tension rules (AC-8)
    const third = Object.values(s.edges).find((e) => e.source === "zw" && e.target === "li");
    await expect(third).toMatchObject({ curved: true, dash: "dashed", tense: true });
    await expect(third?.color).toBe(tokens.color["graph-tense"]);
    await expect(self("zw")?.curved).toBe(false);
    // hearsay dot, multi-type arcs, halos with names
    await expect(s.hearsay).toEqual(expect.arrayContaining(["gj", "li", "zw", "zl"]));
    await expect(s.arcs).toEqual({ zw: ["social"], zk: ["social"] });
    await waitFor(() =>
      expect(live.graph?.state().halos.sort()).toEqual(["字节跳动", "家人", "浙江大学"]),
    );
    // nothing animates in the light theme at rest
    await waitFor(() => expect(live.graph?.state().animating).toBe(false));
  },
};

/** AC-5: on phones (< 768px) no halos and no flowing dots. */
export const PanoramaPhone: Story = {
  args: { compact: true, theme: "starfield" },
  decorators: [
    (Story) => (
      <div className="h-[640px] w-[375px]">
        <Story />
      </div>
    ),
  ],
  play: async () => {
    const g = await ready(ALL);
    await sleep(100);
    await expect(g.state().halos).toEqual([]);
    await expect(g.state().theme.flowingDots).toBe(0);
  },
};

/** AC-2: no two people overlap, at 30 and at 200 people. */
function noOverlap(count: number) {
  return async () => {
    const g = await ready(count + 1);
    await sleep(50);
    const discs = g.screenNodes();
    await expect(discs).toHaveLength(count + 1);
    let worst = Number.POSITIVE_INFINITY;
    for (let i = 0; i < discs.length; i++) {
      for (let j = i + 1; j < discs.length; j++) {
        const a = discs[i];
        const b = discs[j];
        worst = Math.min(worst, Math.hypot(a.x - b.x, a.y - b.y) - a.r - b.r);
      }
    }
    await expect(worst).toBeGreaterThanOrEqual(-0.5);
  };
}

/**
 * AC-11: no two drawn names overlap — people, ring names, sector names and group names —
 * on the seed graph's crowded inner rings, zoomed out and in, and at 200 people zoomed in.
 * A name that does not fit is left out (it shows on hover and further in).
 */
function namesApart(count: number, zooms: number[], expected: string[] = []) {
  return async () => {
    const g = await ready(count + 1);
    for (const zoom of zooms) {
      g.zoomTo(zoom);
      await sleep(80);
      const s = g.state();
      const boxes = s.labelBoxes.map((b) => ({ id: b.id, box: b }));
      await expect(s.labels.length).toBeGreaterThan(0);
      await expect(overlappingLabels(boxes)).toEqual([]);
    }
    for (const id of expected) await expect(g.state().labelBoxes.map((b) => b.id)).toContain(id);
  };
}

export const NamesApartSeed: Story = {
  args: { data: SEED },
  decorators: [
    (Story) => (
      <div className="h-[736px] w-[1184px]">
        <Story />
      </div>
    ),
  ],
  play: namesApart(
    SEED.nodes.length - 1,
    [1.3, 2.4, 1],
    // zoomed out: the 亲属 sector names everyone, the family halo and 亲近 are named too
    ["wife", "dad", "mom", "sis", "group:family:dad", "ring:1"],
  ),
};

export const NamesApartSeedPhone: Story = {
  args: { data: SEED, compact: true, theme: "starfield" },
  decorators: [
    (Story) => (
      <div className="h-[592px] w-[344px]">
        <Story />
      </div>
    ),
  ],
  play: namesApart(SEED.nodes.length - 1, [1, 1.3, 2.4]),
};

export const NamesApart200: Story = {
  args: { data: CROWD_200 },
  play: namesApart(200, [1, 1.3, 2.4]),
};

export const NoOverlap30: Story = { args: { data: CROWD_30 }, play: noOverlap(30) };
export const NoOverlap200: Story = { args: { data: CROWD_200 }, play: noOverlap(200) };

/**
 * AC-10: clicking a person keeps them, 我 and their direct links lit and fades the rest to
 * colors.graph.fade in 200ms; their card shows; clicking them again, the background or
 * Esc restores.
 */
export const FocusAndCard: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const g = await ready(ALL);
    await clickPerson(g, "张伟", false);
    await waitFor(() => expect(g.state().emphasized).not.toBeNull());
    await expect(g.state().animating).toBe(true); // the 200ms fade runs …
    await waitFor(() => expect(g.state().animating).toBe(false)); // … and stops
    await sleep(350);
    const s = g.state();
    await expect(new Set(s.emphasized)).toEqual(new Set(["zw", SELF, "li", "wang", "wh", "kid"]));
    await expect(s.faded).toContain("wife");
    await expect(s.faded).not.toContain("li");
    await expect(s.durations.fade).toBe(200);
    await expect(Object.values(s.edges).find((e) => e.target === "mom")?.alpha).toBe(
      Number(tokens.opacity["graph-fade"]),
    );

    const card = canvas.getByRole("region", { name: "张伟的卡片" });
    await expect(card).toHaveTextContent("社会 · 同事；社会 · 朋友");
    await expect(card).toHaveTextContent("我对他：至交 · 他对我：亲近");
    await expect(card).toHaveTextContent("2018 年认识");
    await expect(card).toHaveTextContent("可信度：亲历");
    await expect(card).toHaveTextContent("字节跳动");
    await expect(card).toHaveTextContent("李明 · 室友（紧张）");
    await userEvent.click(within(card).getByRole("button", { name: "查看人物页" }));
    await expect(args.onOpenPerson).toHaveBeenCalledWith("zw");

    // again → restore
    await clickPerson(g, "张伟");
    await waitFor(() => expect(g.state().emphasized).toBeNull());
    await expect(canvas.queryByRole("region", { name: "张伟的卡片" })).toBeNull();
    // background → restore
    await clickPerson(g, "李明");
    await waitFor(() => expect(g.state().emphasized).toContain("li"));
    const box = canvasElement.querySelector("[data-relation-graph]")?.getBoundingClientRect();
    await clickAt((box?.left ?? 0) + 6, (box?.top ?? 0) + 6);
    await waitFor(() => expect(g.state().emphasized).toBeNull());
    await sleep(350);
    // Esc → restore
    await clickPerson(g, "郑凯");
    await waitFor(() => expect(g.state().emphasized).toContain("zk"));
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(g.state().emphasized).toBeNull());
  },
};

/** AC-3: a person with two categories lists both on the card. */
export const MultiTypeCard: Story = {
  play: async ({ canvasElement }) => {
    const g = await ready(ALL);
    await clickPerson(g, "郑凯");
    const card = await within(canvasElement).findByRole("region", { name: "郑凯的卡片" });
    await expect(card).toHaveTextContent("利益 · 合伙人；社会 · 朋友");
  },
};

/**
 * AC-11: zoomed out only 亲近 and closer are named (phone: 至交), zoomed in everyone;
 * names over 7 characters are cut with … and the full name shows on hover.
 */
export const SemanticZoom: Story = {
  play: async () => {
    const g = await ready(ALL);
    await waitFor(() => expect(g.state().labels.length).toBeGreaterThan(0));
    const out = new Set(g.state().labels);
    await expect(out.has("zw")).toBe(true); // 至交
    await expect(out.has("li")).toBe(true); // 亲近
    await expect(out.has("cj")).toBe(false); // 熟悉
    await expect(out.has("long")).toBe(false);
    g.zoomTo(1.3);
    await waitFor(() => expect(g.state().labels).toContain("long"));
    await expect(g.state().labels).toContain("kid");
    await expect(g.state().truncated).toEqual({ long: "赵一二三四五六七八九十" });
  },
};

export const SemanticZoomPhone: Story = {
  args: { compact: true },
  decorators: [
    (Story) => (
      <div className="h-[640px] w-[375px]">
        <Story />
      </div>
    ),
  ],
  play: async () => {
    const g = await ready(ALL);
    await waitFor(() => expect(g.state().labels.length).toBeGreaterThan(0));
    await expect(g.state().labels).toContain("zw");
    await expect(g.state().labels).not.toContain("li");
  },
};

export const HoverShowsFullName: Story = {
  play: async ({ canvasElement }) => {
    const g = await ready(ALL);
    g.zoomTo(1.3);
    await sleep(100);
    const at = g.clientPosition("long");
    if (!at) throw new Error("not drawn");
    const target = document.elementFromPoint(at.x, at.y) as HTMLElement;
    target.dispatchEvent(
      new MouseEvent("mousemove", { clientX: at.x, clientY: at.y, bubbles: true }),
    );
    await expect(await within(canvasElement).findByRole("tooltip")).toHaveTextContent(
      "赵一二三四五六七八九十",
    );
  },
};

/**
 * AC-18: 星空 — dark gradient, stars, glow, flowing dots on 亲近 and closer lines; all from
 * colors.graph-dark. The loop runs only for these effects.
 */
export const Starfield: Story = {
  args: { theme: "starfield" },
  play: async ({ canvasElement }) => {
    const g = await ready(ALL);
    await waitFor(() => expect(g.state().theme.flowingDots).toBeGreaterThan(0));
    const s = g.state();
    await expect(s.theme.name).toBe("starfield");
    await expect(s.theme.background).toEqual([
      tokens.color["graph-dark-bg-inner"],
      tokens.color["graph-dark-bg-outer"],
    ]);
    await expect(s.theme.categories).toEqual(graphTheme("starfield").categories);
    await expect(s.theme.glow).toBe(true);
    await expect(s.theme.stars).toBeGreaterThan(100);
    await expect(s.animating).toBe(true);
    const frame = canvasElement.querySelector("[data-graph-frame]") as HTMLElement;
    await expect(frame.dataset.graphTheme).toBe("starfield");
  },
};

/** AC-19: reduced motion — no animation loop even in 星空, the path is lit at once. */
export const ReducedMotion: Story = {
  args: {
    theme: "starfield",
    reducedMotion: true,
    highlight: answerHighlight(PATH_ANSWER),
  },
  play: async () => {
    const g = await ready(ALL);
    await sleep(300);
    const s = g.state();
    await expect(s.animating).toBe(false);
    await expect(s.reducedMotion).toBe(true);
    await expect(s.theme.flowingDots).toBe(0);
    await expect(s.highlight?.litSteps).toBe(2);
    await expect(s.highlight?.particles).toBe(false);
  },
};
