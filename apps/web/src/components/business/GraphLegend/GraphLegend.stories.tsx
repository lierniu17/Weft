import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { GraphLegend } from "./GraphLegend.tsx";

const meta = {
  title: "Business/GraphLegend",
  component: GraphLegend,
  args: {},
} satisfies Meta<typeof GraphLegend>;

export default meta;
type Story = StoryObj<typeof meta>;

/** AC-9: width, colour, dashed, dotted, red, taper and halo explained; collapses to a chip. */
export const Expanded: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const legend = canvas.getByRole("region", { name: "图例" });
    for (const text of [
      "线粗 = 亲密度",
      "虚线 = 转述",
      "点线 = 推测",
      "红色 = 关系紧张",
      "两端粗细不同 = 双方感受不对称",
      "光晕 = 群体",
    ]) {
      await expect(legend).toHaveTextContent(text);
    }
    const colours = within(legend).getByRole("list", { name: "颜色 = 关系大类" });
    await expect(
      within(colours)
        .getAllByRole("listitem")
        .map((li) => li.textContent),
    ).toEqual(["亲属", "情感", "社会", "利益", "敌对"]);
    await userEvent.click(canvas.getByRole("button", { name: "收起图例" }));
    await expect(canvas.queryByRole("region", { name: "图例" })).toBeNull();
    await userEvent.click(canvas.getByRole("button", { name: "展开图例" }));
    await expect(canvas.getByRole("region", { name: "图例" })).toBeVisible();
  },
};

/** Phones start collapsed. */
export const Collapsed: Story = {
  args: { defaultCollapsed: true },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole("button", { name: "展开图例" })).toHaveTextContent(
      "图例",
    );
  },
};

/** 星空: the legend sits on the dark graph (colors.graph-dark). */
export const Starfield: Story = {
  args: { theme: "starfield" },
  decorators: [
    (Story) => (
      <div className="bg-graph-dark-bg-outer p-md">
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    const legend = within(canvasElement).getByRole("region", { name: "图例" });
    await expect(getComputedStyle(legend).backgroundColor).toBe("rgba(14, 20, 40, 0.92)");
  },
};
