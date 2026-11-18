import type { Meta, StoryObj } from "@storybook/react-vite";
import { FiCalendar } from "react-icons/fi";
import { expect, fn, userEvent, within } from "storybook/test";
import { TRANSPARENT, token } from "../../../test/color.ts";
import { Chip } from "./Chip.tsx";

const meta = {
  title: "Basics/Chip",
  component: Chip,
  args: { children: "张伟" },
} satisfies Meta<typeof Chip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Neutral: Story = {
  play: async ({ canvasElement }) => {
    const chip = within(canvasElement).getByText("张伟").parentElement as HTMLElement;
    await expect(getComputedStyle(chip).borderRadius).toBe("9999px");
    await expect(chip.getBoundingClientRect().height).toBe(24);
    // AC-3: default chip is a bg-muted pill with no outline.
    await expect(getComputedStyle(chip).backgroundColor).toBe(token("neutral-bg-muted"));
    await expect(getComputedStyle(chip).borderTopColor).toBe(TRANSPARENT);
    await expect(getComputedStyle(chip).color).toBe(token("neutral-text-secondary"));
  },
};

export const Selected: Story = {
  args: { variant: "selected", children: "已匹配" },
  play: async ({ canvasElement }) => {
    const chip = within(canvasElement).getByText("已匹配").parentElement as HTMLElement;
    // The selected state is the ink current state (AC-1).
    await expect(getComputedStyle(chip).backgroundColor).toBe(token("primary-6"));
    await expect(getComputedStyle(chip).color).toBe(token("on-primary"));
  },
};

/** AC-3: status chips use the status-1 background and status-6 text, never an outline. */
const statusChip =
  (text: string, bg: Parameters<typeof token>[0], fg: Parameters<typeof token>[0]): Story["play"] =>
  async ({ canvasElement }) => {
    const chip = within(canvasElement).getByText(text).parentElement as HTMLElement;
    await expect(getComputedStyle(chip).backgroundColor).toBe(token(bg));
    await expect(getComputedStyle(chip).color).toBe(token(fg));
    await expect(getComputedStyle(chip).borderTopColor).toBe(TRANSPARENT);
  };

export const Success: Story = {
  args: { variant: "success", children: "活跃" },
  play: statusChip("活跃", "status-success-1", "status-success-6"),
};

export const Danger: Story = {
  args: { variant: "danger", children: "小李 → ？需选择" },
  play: statusChip("小李 → ？需选择", "status-error-1", "status-error-6"),
};

export const Warning: Story = {
  args: { variant: "warning", children: "待核实" },
  play: statusChip("待核实", "status-warning-1", "status-warning-6"),
};

export const Selectable: Story = {
  name: "Selectable (candidate)",
  args: { children: "李华（邻居）", onClick: fn(), pressed: false },
  play: async ({ canvasElement, args }) => {
    const chip = within(canvasElement).getByRole("button", { name: "李华（邻居）" });
    await expect(chip).toHaveAttribute("aria-pressed", "false");
    await userEvent.click(chip);
    await expect(args.onClick).toHaveBeenCalledTimes(1);
  },
};

export const SelectedToggle: Story = {
  args: { variant: "selected", children: "李明（同学）", onClick: fn(), pressed: true },
  play: async ({ canvasElement }) => {
    const chip = within(canvasElement).getByRole("button", { name: "李明（同学）" });
    await expect(chip).toHaveAttribute("aria-pressed", "true");
  },
};

export const Removable: Story = {
  args: { children: "急性子", onRemove: fn() },
  play: async ({ canvasElement, args }) => {
    const remove = within(canvasElement).getByRole("button", { name: "移除 急性子" });
    await userEvent.click(remove);
    await expect(args.onRemove).toHaveBeenCalledTimes(1);
  },
};

export const Link: Story = {
  args: { children: "张伟", href: "#person-zhangwei" },
  play: async ({ canvasElement }) => {
    const link = within(canvasElement).getByRole("link", { name: "张伟" });
    await expect(link).toHaveAttribute("href", "#person-zhangwei");
  },
};

export const WithIcon: Story = {
  name: "With icon (date trigger)",
  args: { children: "今天", icon: <FiCalendar />, onClick: fn() },
  play: async ({ canvasElement }) => {
    // The icon is decorative: it must not change the accessible name.
    await expect(within(canvasElement).getByRole("button", { name: "今天" })).toBeVisible();
  },
};

export const Disabled: Story = {
  args: { children: "张强（邻居）", onClick: fn(), disabled: true },
  play: async ({ canvasElement, args }) => {
    const chip = within(canvasElement).getByRole("button", { name: "张强（邻居）" });
    await expect(chip).toBeDisabled();
    await userEvent.click(chip);
    await expect(args.onClick).not.toHaveBeenCalled();
  },
};
