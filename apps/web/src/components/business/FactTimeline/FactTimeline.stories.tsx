import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { FactTimeline } from "./FactTimeline.tsx";

const TODAY = new Date(2026, 10, 16);

const meta = {
  title: "Business/FactTimeline",
  component: FactTimeline,
  args: {
    today: TODAY,
    // Deliberately out of order: the component sorts by occurred date (AC-29).
    facts: [
      {
        id: "f3",
        occurred_on: "2026-11",
        text: "李明跳槽去腾讯",
        status: "unverified",
        confidence: "hearsay",
      },
      {
        id: "f1",
        occurred_on: "2012",
        text: "大学室友",
        status: "current",
        confidence: "witnessed",
      },
      {
        id: "f2",
        occurred_on: "2025-03-01",
        text: "因借钱闹掰",
        status: "current",
        confidence: "hearsay",
      },
      {
        id: "f0",
        occurred_on: "2012-09",
        text: "在同一个宿舍",
        status: "invalidated",
        confidence: "self_told",
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
} satisfies Meta<typeof FactTimeline>;

export default meta;
type Story = StoryObj<typeof meta>;

/** AC-29: all facts between the two people, sorted by occurred date, invalidated marked. */
export const SortedWithStates: Story = {
  play: async ({ canvasElement }) => {
    const list = within(canvasElement).getByRole("list", { name: "事实时间线" });
    const items = within(list).getAllByRole("listitem");
    await expect(items.map((li) => li.querySelector("[data-fact-text]")?.textContent)).toEqual([
      "大学室友",
      "在同一个宿舍",
      "因借钱闹掰",
      "李明跳槽去腾讯",
    ]);
    await expect(items[0]).toHaveTextContent("2012 年");
    await expect(items[1]).toHaveTextContent("已失效");
    await expect(items[1]).toHaveAttribute("data-timeline-item", "invalidated");
    await expect(items[3]).toHaveTextContent("待核实");
    await expect(items[3]).toHaveAttribute("data-timeline-item", "unverified");
    // Every fact shows its confidence.
    await expect(within(items[0]).getByRole("img", { name: "可信度：亲历" })).toBeVisible();
    await expect(within(items[2]).getByRole("img", { name: "可信度：转述" })).toBeVisible();
  },
};

/** Each fact opens its citation. */
export const Openable: Story = {
  args: { onFactOpen: fn() },
  play: async ({ canvasElement, args }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: /因借钱闹掰/ }));
    await expect(args.onFactOpen).toHaveBeenCalledWith("f2");
  },
};

export const Empty: Story = {
  args: { facts: [] },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText("还没有记录")).toBeVisible();
  },
};
