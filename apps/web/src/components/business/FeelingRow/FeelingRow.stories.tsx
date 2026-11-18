import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { token } from "../../../test/color.ts";
import { FeelingRow } from "./FeelingRow.tsx";

const TODAY = new Date(2026, 10, 16);

const meta = {
  title: "Business/FeelingRow",
  component: FeelingRow,
  args: {
    from: "张伟",
    to: "李明",
    today: TODAY,
    dimensions: [
      {
        dimension: "closeness",
        level: "distant",
        confidence: "hearsay",
        history: [
          { id: "h2", level: "distant", occurred_on: "2025-03", confidence: "hearsay" },
          { id: "h1", level: "intimate", occurred_on: "2012", confidence: "self_told" },
        ],
      },
      {
        dimension: "affinity",
        level: "dislike",
        confidence: "hearsay",
        history: [{ id: "h3", level: "dislike", occurred_on: "2025-03", confidence: "hearsay" }],
      },
    ],
  },
  decorators: [
    (Story) => (
      <div className="w-[375px] bg-neutral-bg-container p-md">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof FeelingRow>;

export default meta;
type Story = StoryObj<typeof meta>;

/** AC-30: one direction, only recorded dimensions; trust is absent so it is not shown. */
export const Recorded: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("张伟 → 李明")).toBeVisible();
    await expect(canvasElement).toHaveTextContent("张伟 → 李明：疏远 · 反感");
    await expect(canvasElement).not.toHaveTextContent("信任");
    // Collapsed by default.
    const toggle = canvas.getByRole("button", { name: "历史" });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(canvas.queryByRole("list", { name: "张伟 → 李明 的感受变化" })).toBeNull();
  },
};

/** AC-30: expanding shows every change with its date and confidence, oldest first. */
export const ExpandHistory: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const toggle = canvas.getByRole("button", { name: "历史" });
    await userEvent.click(toggle);
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    const list = canvas.getByRole("list", { name: "张伟 → 李明 的感受变化" });
    const items = within(list).getAllByRole("listitem");
    await expect(items).toHaveLength(3);
    await expect(items[0]).toHaveTextContent("2012 年");
    await expect(items[0]).toHaveTextContent("亲密度 至交");
    await expect(within(items[0]).getByRole("img", { name: "可信度：本人说" })).toBeVisible();
    await expect(items[1]).toHaveTextContent("2025 年 3 月");
    await expect(items[1]).toHaveTextContent("亲密度 疏远");

    await userEvent.click(toggle);
    await expect(canvas.queryByRole("list")).toBeNull();
  },
};

/** Trust reads 「信任高」 so a bare 高 / 中 / 低 is never ambiguous. */
export const WithTrust: Story = {
  args: {
    from: "我",
    to: "张伟",
    dimensions: [
      { dimension: "closeness", level: "close", confidence: "witnessed" },
      { dimension: "trust", level: "high", confidence: "witnessed" },
    ],
  },
  play: async ({ canvasElement }) => {
    await expect(canvasElement).toHaveTextContent("我 → 张伟：亲近 · 信任高");
    // No history recorded: nothing to expand.
    await expect(within(canvasElement).queryByRole("button", { name: "历史" })).toBeNull();
  },
};

/** AC-30: a direction with nothing recorded says so instead of disappearing. */
export const Unrecorded: Story = {
  args: { from: "李明", to: "张伟", dimensions: [] },
  play: async ({ canvasElement }) => {
    await expect(canvasElement).toHaveTextContent("李明 → 张伟：（未记录）");
    const empty = within(canvasElement).getByText("（未记录）");
    await expect(getComputedStyle(empty).color).toBe(token("neutral-text-secondary"));
    await expect(within(canvasElement).queryByRole("button")).toBeNull();
  },
};
