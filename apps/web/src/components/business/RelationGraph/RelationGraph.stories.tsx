import type { Meta, StoryObj } from "@storybook/react-vite";
import type { Core } from "cytoscape";
import { useState } from "react";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { Button } from "../../basics/Button/Button.tsx";
import {
  type GraphEdge,
  type GraphNode,
  RelationGraph,
  type RelationGraphProps,
} from "./RelationGraph.tsx";

const NODES: GraphNode[] = [
  { id: "zw", name: "张伟" },
  { id: "self", name: "小明", is_self: true },
  { id: "lm", name: "李明" },
  { id: "wf", name: "王芳" },
  { id: "cj", name: "陈静" },
];
const EDGES: GraphEdge[] = [
  { id: "e1", source: "self", target: "zw", closeness: "intimate" },
  { id: "e2", source: "zw", target: "lm", closeness: "distant" },
  { id: "e3", source: "zw", target: "wf", closeness: "familiar" },
  { id: "e4", source: "zw", target: "cj" },
];
const TWO_HOP_NODES: GraphNode[] = [...NODES, { id: "ll", name: "刘磊" }];
const TWO_HOP_EDGES: GraphEdge[] = [...EDGES, { id: "e5", source: "lm", target: "ll" }];

/** Captures the Cytoscape instance so play() can drive and inspect it. */
const ready: { cy?: Core } = {};
const onReady = (cy: Core) => {
  ready.cy = cy;
};
const color = (c: string) => c.replace(/\s/g, "");
/** Waits for the current story's live instance (a previous story's one is destroyed). */
const live = (count: number) =>
  waitFor(() => {
    expect(ready.cy?.destroyed()).toBe(false);
    expect(ready.cy?.nodes()).toHaveLength(count);
  });

const meta = {
  title: "Business/RelationGraph",
  component: RelationGraph,
  args: {
    variant: "local",
    nodes: NODES,
    edges: EDGES,
    centerId: "zw",
    hops: 1,
    onHopsChange: fn(),
    onNodeClick: fn(),
    onReady,
  },
  decorators: [
    (Story) => (
      <div className="w-[343px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof RelationGraph>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Local graph on the person page: 200px high, themed from the tokens. Node = Avatar look,
 * 本人 = Avatar.self, edge width = closeness.
 */
export const Local: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const graph = canvas.getByRole("img", { name: "张伟的关系图，共 5 人" });
    // The bordered frame is 200px high (DESIGN.md RelationGraph.local).
    await expect(graph.parentElement?.getBoundingClientRect().height).toBe(200);
    await live(5);
    const cy = ready.cy as Core;

    const self = cy.$id("self");
    await expect(color(self.style("background-color"))).toBe("rgb(238,242,255)");
    await expect(color(self.style("border-color"))).toBe("rgb(79,70,229)");
    await expect(self.style("label")).toBe("我");
    const person = cy.$id("lm");
    await expect(color(person.style("background-color"))).toBe("rgb(230,246,244)");
    await expect(color(person.style("border-color"))).toBe("rgb(11,122,110)");
    await expect(person.style("label")).toBe("李明");
    // The centre person is emphasised.
    await expect(cy.$id("zw").width()).toBeGreaterThan(person.width());

    // Closeness drives edge width: 至交 thickest, 疏远 thinnest, unknown = thinnest.
    const w = (id: string) => Number.parseFloat(cy.$id(id).style("width"));
    await expect(w("e1")).toBeGreaterThan(w("e3"));
    await expect(w("e3")).toBeGreaterThan(w("e2"));
    await expect(w("e4")).toBe(w("e2"));
  },
};

/** AC-33: tapping a person in the graph navigates to them. */
export const TapNode: Story = {
  play: async ({ args }) => {
    await live(5);
    ready.cy?.$id("lm").emit("tap");
    await expect(args.onNodeClick).toHaveBeenCalledWith("lm");
  },
};

/** The canvas is not accessible: the same people are buttons for keyboard and screen readers. */
export const AccessibleFallback: Story = {
  play: async ({ canvasElement, args }) => {
    const list = within(canvasElement).getByRole("list", { name: "图中的人物" });
    const buttons = within(list).getAllByRole("button");
    await expect(buttons.map((b) => b.textContent)).toEqual(["张伟", "我", "李明", "王芳", "陈静"]);
    buttons[3].focus();
    await userEvent.keyboard("{Enter}");
    await expect(args.onNodeClick).toHaveBeenCalledWith("wf");
  },
};

function HopsSwitch() {
  const [hops, setHops] = useState<1 | 2>(1);
  return (
    <RelationGraph
      variant="local"
      nodes={hops === 1 ? NODES : TWO_HOP_NODES}
      edges={hops === 1 ? EDGES : TWO_HOP_EDGES}
      centerId="zw"
      hops={hops}
      onHopsChange={setHops}
      onNodeClick={() => {}}
      onReady={onReady}
    />
  );
}

/** AC-33: one layer by default, switch to two; the graph re-renders with more people. */
export const OneToTwoHops: Story = {
  render: () => <HopsSwitch />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const one = canvas.getByRole("radio", { name: "1 层" });
    await expect(one).toHaveAttribute("aria-checked", "true");
    await live(5);
    await userEvent.click(canvas.getByRole("radio", { name: "2 层" }));
    await live(6);
    await expect(canvas.getByRole("img", { name: "张伟的关系图，共 6 人" })).toBeVisible();
  },
};

/** AC-33: over 50 nodes only the closest 50 are shown, and the graph says so. */
export const Truncated: Story = {
  args: { truncatedCount: 12 },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole("status")).toHaveTextContent(
      "已省略 12 人，仅显示亲密度最高的 50 人",
    );
  },
};

/** AC-34 / AC-35: panorama centred on 本人, fills its container, pan and pinch zoom on. */
export const Panorama: Story = {
  args: {
    variant: "panorama",
    centerId: undefined,
    hops: undefined,
    toolbar: (
      <Button variant="secondary" size="sm">
        筛选
      </Button>
    ),
  },
  decorators: [
    (Story) => (
      <div className="h-[480px]">
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const graph = canvas.getByRole("img", { name: "全景图，共 5 人" });
    await expect(graph.getBoundingClientRect().height).toBeGreaterThanOrEqual(400);
    await expect(canvas.queryByRole("radiogroup")).toBeNull();
    await expect(canvas.getByRole("button", { name: "筛选" })).toBeVisible();
    await live(5);
    const cy = ready.cy as Core;
    await expect(cy.userPanningEnabled()).toBe(true);
    await expect(cy.userZoomingEnabled()).toBe(true);
    // Centred on 本人: the self node sits at the middle of the viewport.
    const pos = cy.$id("self").renderedPosition();
    await expect(Math.abs(pos.x - cy.width() / 2)).toBeLessThan(2);
    await expect(Math.abs(pos.y - cy.height() / 2)).toBeLessThan(2);
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

/** Unmounting destroys the Cytoscape instance (no leaked listeners / canvases). */
export const DestroysOnUnmount: Story = {
  render: (args) => <Unmountable {...args} />,
  play: async ({ canvasElement }) => {
    await live(5);
    const cy = ready.cy as Core;
    await userEvent.click(within(canvasElement).getByRole("button", { name: "隐藏" }));
    await waitFor(() => expect(cy.destroyed()).toBe(true));
  },
};
