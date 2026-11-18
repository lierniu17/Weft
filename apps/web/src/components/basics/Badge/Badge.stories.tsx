import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { token } from "../../../test/color.ts";
import { Badge } from "./Badge.tsx";

const meta = {
  title: "Basics/Badge",
  component: Badge,
  args: { variant: "dot", label: "有待确认的草稿" },
} satisfies Meta<typeof Badge>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Dot: Story = {
  play: async ({ canvasElement }) => {
    // Not colour alone: the dot carries a readable name.
    const dot = within(canvasElement).getByRole("img", { name: "有待确认的草稿" });
    const box = dot.getBoundingClientRect();
    await expect(box.width).toBe(8);
    await expect(getComputedStyle(dot).backgroundColor).toBe(token("status-error-graphic"));
  },
};

export const Count: Story = {
  args: { variant: "count", count: 3, label: "条待确认" },
  play: async ({ canvasElement }) => {
    const badge = within(canvasElement).getByRole("status");
    await expect(badge).toHaveTextContent("3");
    await expect(within(badge).getByText("3 条待确认")).toBeInTheDocument();
    await expect(getComputedStyle(badge).color).toBe(token("on-primary"));
    await expect(badge.getBoundingClientRect().width).toBeGreaterThanOrEqual(16);
  },
};

export const CountOverflow: Story = {
  args: { variant: "count", count: 120, label: "条待确认" },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole("status")).toHaveTextContent("99+");
  },
};

export const CountZero: Story = {
  args: { variant: "count", count: 0, label: "条待确认" },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByRole("status")).toBeNull();
  },
};
