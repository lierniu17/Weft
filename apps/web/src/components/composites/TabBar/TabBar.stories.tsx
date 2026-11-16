import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { FiMessageSquare, FiUser, FiUsers } from "react-icons/fi";
import { expect, userEvent, within } from "storybook/test";
import { rgb } from "../../../test/color.ts";
import { type NavItem, TabBar } from "./TabBar.tsx";

const ITEMS: NavItem[] = [
  { value: "chat", label: "对话", icon: <FiMessageSquare /> },
  { value: "people", label: "人物", icon: <FiUsers /> },
  { value: "me", label: "我的", icon: <FiUser /> },
];

function Stateful({ items }: { items: NavItem[] }) {
  const [value, setValue] = useState("chat");
  return (
    <div className="w-[375px]">
      <TabBar items={items} value={value} onValueChange={setValue} />
    </div>
  );
}

const meta = {
  title: "Composites/TabBar",
  component: TabBar,
  args: { items: ITEMS, value: "chat", onValueChange: () => {} },
  render: (args) => <Stateful items={args.items} />,
} satisfies Meta<typeof TabBar>;

export default meta;
type Story = StoryObj<typeof meta>;

/** AC-UI-1: tabs 对话 / 人物 / 我的; the active one is primary and aria-current. */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const nav = within(canvasElement).getByRole("navigation", { name: "主导航" });
    const tabs = within(nav).getAllByRole("button");
    await expect(tabs.map((t) => t.textContent)).toEqual(["对话", "人物", "我的"]);
    await expect(tabs[0].getBoundingClientRect().height).toBe(56);
    await expect(tabs[0]).toHaveAttribute("aria-current", "page");
    await expect(getComputedStyle(tabs[0]).color).toBe(rgb("#4F46E5"));
    await expect(getComputedStyle(tabs[1]).color).toBe(rgb("#5B6475"));

    await userEvent.click(tabs[1]);
    await expect(tabs[1]).toHaveAttribute("aria-current", "page");
    await expect(tabs[0]).not.toHaveAttribute("aria-current");
  },
};

export const WithBadgeDot: Story = {
  args: {
    items: ITEMS.map((i) => (i.value === "chat" ? { ...i, dot: "有待确认的草稿" } : i)),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("img", { name: "有待确认的草稿" })).toBeVisible();
    await expect(canvas.getByRole("button", { name: /对话/ })).toHaveAccessibleName(
      /有待确认的草稿/,
    );
  },
};
