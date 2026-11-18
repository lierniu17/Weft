import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { answerHighlight } from "../../../lib/graph/answerHighlight.ts";
import { Button } from "../../basics/Button/Button.tsx";
import {
  LIST_ANSWER,
  LOCAL_ONE_HOP,
  LOCAL_TWO_HOPS,
  PAIR_ANSWER,
  PATH_ANSWER,
  SAMPLE,
  SELF,
} from "./graphFixtures.ts";
import { RelationGraph, type RelationGraphProps } from "./RelationGraph.tsx";
import { clickPerson, live, onReady, ready } from "./storyHelpers.ts";

const meta = {
  // a fresh handle per story: never assert on the previous story's graph
  beforeEach: () => {
    live.graph = undefined;
  },
  title: "Business/RelationGraph/States",
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
 * AC-17: a path answer lights 我 → 老张 → 小王 link by link (0.7s each) with flowing
 * particles; everyone else fades; their names stay.
 */
export const AnswerPath: Story = {
  args: { highlight: answerHighlight(PATH_ANSWER) },
  play: async () => {
    const g = await ready(ALL);
    const s = g.state();
    await expect(new Set(s.emphasized)).toEqual(new Set([SELF, "zw", "wang"]));
    await expect(s.durations.pathStep).toBe(700);
    await expect(s.highlight).toMatchObject({ kind: "path", steps: 2, particles: true });
    await expect(s.highlight?.litSteps).toBeLessThan(2);
    await waitFor(() => expect(g.state().highlight?.litSteps).toBe(2), { timeout: 3000 });
    await expect(g.state().animating).toBe(true);
    await expect(g.state().faded).toContain("wife");
    await expect(new Set(g.state().labels)).toEqual(new Set(["zw", "wang"]));
  },
};

/** AC-17: a list answer pulses its people. */
export const AnswerList: Story = {
  args: { highlight: answerHighlight(LIST_ANSWER) },
  play: async () => {
    const g = await ready(ALL);
    await expect(g.state().highlight?.pulsing.sort()).toEqual(["li", "wife", "zk"]);
    await expect(g.state().animating).toBe(true);
  },
};

/** AC-17: a pair answer lights the line between the two and names the relationship. */
export const AnswerPair: Story = {
  args: { highlight: answerHighlight(PAIR_ANSWER) },
  play: async () => {
    const g = await ready(ALL);
    const s = g.state();
    await expect(s.highlight?.pairLabel).toBe("室友 · 紧张");
    const pair = Object.values(s.edges).find((e) => e.source === "zw" && e.target === "li");
    await expect(pair?.alpha).toBe(1);
    await expect(Object.values(s.edges).find((e) => e.target === "zw")?.alpha).toBeLessThan(1);
  },
};

const SOCIAL = new Set(
  SAMPLE.edges
    .filter((e) => e.source === SELF && e.types[0].category === "social")
    .map((e) => e.target),
);

/** AC-13: filtered — people who don't match fade (default) … */
export const FilterFade: Story = {
  args: { matching: SOCIAL, filterMode: "fade" },
  play: async () => {
    const g = await ready(ALL);
    await expect(g.state().faded).toContain("wife");
    await expect(g.state().faded).not.toContain("zw");
  },
};

/** … or only matching people are shown. */
export const FilterOnly: Story = {
  args: { matching: SOCIAL, filterMode: "only" },
  play: async () => {
    const g = await ready(SOCIAL.size + 1);
    await expect(g.state().visible).not.toContain("wife");
    await expect(g.state().visible).toContain(SELF);
  },
};

/** AC-14 / AC-15: a time point shows only the people met by then. */
export const TimePoint: Story = {
  args: { year: 2016 },
  play: async () => {
    const g = await ready(SAMPLE.nodes.filter((n) => !n.met_at || n.met_at < "2017").length);
    await expect(g.state().visible).not.toContain("zw");
    await expect(g.state().visible).toContain("li");
  },
};

function Travel() {
  const [year, setYear] = useState(2016);
  return (
    <div className="flex h-full flex-col gap-sm">
      <Button variant="secondary" onClick={() => setYear(2027)}>
        到今天
      </Button>
      <RelationGraph
        variant="panorama"
        data={SAMPLE}
        year={year}
        onOpenPerson={() => {}}
        onReady={onReady}
        compact={false}
        reducedMotion={false}
      />
    </div>
  );
}

/** AC-15: people met later fade in at their place; the loop stops once settled. */
export const TimeTravel: Story = {
  render: () => <Travel />,
  play: async ({ canvasElement }) => {
    const g = await ready(SAMPLE.nodes.filter((n) => !n.met_at || n.met_at < "2017").length);
    await waitFor(() => expect(g.state().animating).toBe(false));
    await userEvent.click(within(canvasElement).getByRole("button", { name: "到今天" }));
    await waitFor(() => expect(g.state().visible).toHaveLength(ALL));
    await expect(g.state().animating).toBe(true);
    await expect(g.state().durations.move).toBeGreaterThan(0);
    await waitFor(() => expect(g.state().animating).toBe(false), { timeout: 3000 });
  },
};

function LocalHops(props: Partial<RelationGraphProps>) {
  const [hops, setHops] = useState<1 | 2>(1);
  return (
    <RelationGraph
      variant="local"
      data={hops === 1 ? LOCAL_ONE_HOP : LOCAL_TWO_HOPS}
      hops={hops}
      onHopsChange={setHops}
      onOpenPerson={props.onOpenPerson ?? (() => {})}
      onReady={onReady}
      compact
      reducedMotion={false}
    />
  );
}

/**
 * AC-12: the person page's local graph — same encoding, focus and card; 1 / 2 layers; the
 * card's 查看人物页 opens the person. Mobile: 200px high.
 */
export const Local: Story = {
  args: { onOpenPerson: fn() },
  render: (args) => <LocalHops onOpenPerson={args.onOpenPerson} />,
  decorators: [
    (Story) => (
      <div className="w-[343px]">
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("img", { name: "张伟的关系图，共 6 人" })).toBeVisible();
    const frame = canvasElement.querySelector("[data-graph-frame]") as HTMLElement;
    await expect(frame.getBoundingClientRect().height).toBe(200);
    const g = await ready(6);
    await expect(Object.values(g.state().edges).some((e) => e.tense)).toBe(true);
    await userEvent.click(canvas.getByRole("radio", { name: "2 层" }));
    await ready(7);
    await expect(canvas.getByRole("img", { name: "张伟的关系图，共 7 人" })).toBeVisible();
    await clickPerson(g, "李明");
    const card = await canvas.findByRole("region", { name: "李明的卡片" });
    await expect(card).toHaveTextContent("张伟对他：一般");
    await userEvent.click(within(card).getByRole("button", { name: "查看人物页" }));
    await expect(args.onOpenPerson).toHaveBeenCalledWith("li");
  },
};

/** The canvas is mirrored by buttons for keyboard and screen-reader users (local). */
export const LocalKeyboard: Story = {
  args: { variant: "local", data: LOCAL_ONE_HOP, compact: true },
  decorators: [
    (Story) => (
      <div className="w-[343px]">
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const list = canvas.getByRole("list", { name: "图中的人物" });
    const buttons = within(list).getAllByRole("button");
    await expect(buttons.map((b) => b.textContent)).toEqual([
      "我",
      "李明",
      "张伟",
      "吴昊",
      "王浩",
      "老张的女儿",
    ]);
    buttons[1].focus();
    await userEvent.keyboard("{Enter}");
    await expect(await canvas.findByRole("region", { name: "李明的卡片" })).toBeVisible();
    await expect(buttons[1]).toHaveAttribute("aria-pressed", "true");
  },
};

/** AC-12: over 50 people only the closest 50 are shown, and the graph says so. */
export const Truncated: Story = {
  args: { variant: "local", data: LOCAL_ONE_HOP, truncatedCount: 12 },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole("status")).toHaveTextContent(
      "已省略 12 人，仅显示亲密度最高的 50 人",
    );
  },
};

function Unmountable(props: RelationGraphProps) {
  const [shown, setShown] = useState(true);
  return (
    <>
      <Button variant="secondary" onClick={() => setShown(false)}>
        隐藏
      </Button>
      {shown && <RelationGraph {...props} />}
    </>
  );
}

/** Unmounting kills Sigma: its canvases are gone and no loop keeps running. */
export const DestroysOnUnmount: Story = {
  render: (args) => <Unmountable {...args} />,
  args: { theme: "starfield" },
  play: async ({ canvasElement }) => {
    await ready(ALL);
    await expect(canvasElement.querySelectorAll("canvas").length).toBeGreaterThan(3);
    await userEvent.click(within(canvasElement).getByRole("button", { name: "隐藏" }));
    await waitFor(() => expect(canvasElement.querySelectorAll("canvas")).toHaveLength(0));
  },
};
