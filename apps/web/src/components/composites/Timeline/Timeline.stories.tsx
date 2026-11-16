import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { rgb } from "../../../test/color.ts";
import { Timeline } from "./Timeline.tsx";

const meta = {
  title: "Composites/Timeline",
  component: Timeline,
  args: {
    "aria-label": "事实时间线",
    items: [
      { id: "1", time: "2012", content: "大学室友", variant: "current" },
      { id: "2", time: "2023", content: "在字节跳动工作", variant: "invalidated" },
      { id: "3", time: "2026-11", content: "李明跳槽去腾讯", variant: "unverified" },
    ],
  },
  decorators: [
    (Story) => (
      <div className="w-[343px] bg-neutral-bg-container p-md">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Timeline>;

export default meta;
type Story = StoryObj<typeof meta>;

const item = (root: HTMLElement, variant: string) =>
  root.querySelector(`[data-timeline-item=${variant}]`) as HTMLElement;
const dot = (el: HTMLElement) => el.querySelector("[data-timeline-dot]") as HTMLElement;

export const ThreeStates: Story = {
  play: async ({ canvasElement }) => {
    const list = within(canvasElement).getByRole("list", { name: "事实时间线" });
    await expect(within(list).getAllByRole("listitem")).toHaveLength(3);

    await expect(getComputedStyle(dot(item(canvasElement, "current"))).backgroundColor).toBe(
      rgb("#4F46E5"),
    );

    const invalid = item(canvasElement, "invalidated");
    await expect(getComputedStyle(dot(invalid)).backgroundColor).toBe(rgb("#9AA3B2"));
    const struck = within(invalid).getByText("在字节跳动工作");
    await expect(getComputedStyle(struck).textDecorationLine).toBe("line-through");
    await expect(getComputedStyle(struck).color).toBe(rgb("#5B6475"));
    // Not colour alone: the state is written out.
    await expect(invalid).toHaveTextContent("已失效");

    const unverified = item(canvasElement, "unverified");
    await expect(getComputedStyle(dot(unverified)).backgroundColor).toBe(rgb("#B45309"));
    await expect(unverified).toHaveTextContent("待核实");
  },
};
