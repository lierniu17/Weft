import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { rgb } from "../../../test/color.ts";
import { Divider } from "./Divider.tsx";

const meta = {
  title: "Basics/Divider",
  component: Divider,
  decorators: [
    (Story) => (
      <div className="w-[343px] bg-neutral-bg-container">
        <p className="p-md">老张 → 张伟</p>
        <Story />
        <p className="p-md">小李 → 李明</p>
      </div>
    ),
  ],
} satisfies Meta<typeof Divider>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Full: Story = {
  play: async ({ canvasElement }) => {
    const line = within(canvasElement).getByRole("separator");
    await expect(getComputedStyle(line).backgroundColor).toBe(rgb("#EBEEF2"));
    await expect(line.getBoundingClientRect().width).toBe(343);
  },
};

export const Inset: Story = {
  args: { variant: "inset" },
  play: async ({ canvasElement }) => {
    const line = within(canvasElement).getByRole("separator");
    await expect(getComputedStyle(line).marginLeft).toBe("16px");
  },
};
