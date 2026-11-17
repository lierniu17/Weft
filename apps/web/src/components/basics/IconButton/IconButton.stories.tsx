import type { Meta, StoryObj } from "@storybook/react-vite";
import { FiArrowUp, FiMoreHorizontal, FiX } from "react-icons/fi";
import { expect, fn, userEvent, within } from "storybook/test";
import { rgb } from "../../../test/color.ts";
import { IconButton } from "./IconButton.tsx";

const meta = {
  title: "Basics/IconButton",
  component: IconButton,
  args: { "aria-label": "发送", icon: <FiArrowUp />, onClick: fn() },
} satisfies Meta<typeof IconButton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Filled: Story = {
  args: { variant: "filled" },
  play: async ({ canvasElement, args }) => {
    // Icon-only: the accessible name comes from aria-label, not from the glyph.
    const button = within(canvasElement).getByRole("button", { name: "发送" });
    await expect(getComputedStyle(button).backgroundColor).toBe(rgb("#4F46E5"));
    await expect(getComputedStyle(button).borderRadius).toBe("9999px");
    await userEvent.click(button);
    await expect(args.onClick).toHaveBeenCalledTimes(1);
  },
};

export const Plain: Story = {
  args: { variant: "plain", "aria-label": "更多", icon: <FiMoreHorizontal /> },
  play: async ({ canvasElement, args }) => {
    const button = within(canvasElement).getByRole("button", { name: "更多" });
    button.focus();
    await userEvent.keyboard(" ");
    await expect(args.onClick).toHaveBeenCalledTimes(1);
  },
};

export const Sizes: Story = {
  render: (args) => (
    <div className="flex items-center gap-sm">
      <IconButton {...args} size="sm" aria-label="关闭" icon={<FiX />} variant="plain" />
      <IconButton {...args} size="md" aria-label="更多" icon={<FiMoreHorizontal />} />
      <IconButton {...args} size="lg" aria-label="发送" icon={<FiArrowUp />} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const box = (name: string) => canvas.getByRole("button", { name }).getBoundingClientRect();
    await expect(box("关闭").width).toBe(28);
    await expect(box("更多").height).toBe(36);
    await expect(box("发送").height).toBe(44);
  },
};

export const Disabled: Story = {
  args: { variant: "filled", disabled: true },
  play: async ({ canvasElement, args }) => {
    const button = within(canvasElement).getByRole("button", { name: "发送" });
    await expect(button).toBeDisabled();
    await expect(getComputedStyle(button).backgroundColor).toBe(rgb("#EBEEF2"));
    await expect(getComputedStyle(button).color).toBe(rgb("#9AA3B2"));
    await userEvent.click(button);
    await expect(args.onClick).not.toHaveBeenCalled();
  },
};

export const Loading: Story = {
  args: { variant: "filled", loading: true },
  play: async ({ canvasElement }) => {
    const button = within(canvasElement).getByRole("button", { name: "发送" });
    await expect(button).toHaveAttribute("aria-busy", "true");
    await expect(button).toBeDisabled();
  },
};
