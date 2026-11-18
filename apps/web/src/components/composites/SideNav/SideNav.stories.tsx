import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { FiMap, FiMessageSquare, FiUser, FiUsers } from "react-icons/fi";
import { expect, fn, screen, userEvent, within } from "storybook/test";
import { token } from "../../../test/color.ts";
import type { NavItem } from "../TabBar/TabBar.tsx";
import { SideNav, type SideNavProps } from "./SideNav.tsx";

const ITEMS: NavItem[] = [
  { value: "chat", label: "对话", icon: <FiMessageSquare /> },
  { value: "people", label: "人物", icon: <FiUsers /> },
  { value: "graph", label: "全景图", icon: <FiMap /> },
  { value: "me", label: "我的", icon: <FiUser /> },
];

const onRecentClick = fn();

function Stateful(props: Partial<SideNavProps>) {
  const [value, setValue] = useState("chat");
  return (
    <div className="h-[560px]">
      <SideNav
        items={ITEMS}
        value={value}
        onValueChange={setValue}
        recent={[
          { id: "zw", name: "张伟", alias: "老张" },
          { id: "lm", name: "李明", alias: "小李" },
          { id: "wf", name: "王芳" },
        ]}
        onRecentClick={onRecentClick}
        {...props}
      />
    </div>
  );
}

const meta = {
  title: "Composites/SideNav",
  component: SideNav,
  args: { items: ITEMS, value: "chat", onValueChange: () => {} },
  render: (args) => <Stateful collapsed={args.collapsed} />,
  parameters: { layout: "fullscreen" },
} satisfies Meta<typeof SideNav>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Desktop D1–D3: 232px on bg-subtle, 对话 / 人物 / 全景图 / 我的, then 最近提到. */
export const Desktop: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const nav = canvas.getByRole("navigation", { name: "主导航" });
    await expect(nav.getBoundingClientRect().width).toBe(232);
    await expect(getComputedStyle(nav).backgroundColor).toBe(token("neutral-bg-subtle"));

    const active = canvas.getByRole("button", { name: "对话" });
    await expect(active).toHaveAttribute("aria-current", "page");
    // The current item: a white pill, ink text, shadow.sm.
    await expect(getComputedStyle(active).backgroundColor).toBe(token("neutral-bg-container"));
    await expect(getComputedStyle(active).color).toBe(token("primary-6"));
    await expect(getComputedStyle(active).boxShadow).toContain(
      "rgba(0, 0, 0, 0.04) 0px 1px 2px 0px",
    );
    const other = canvas.getByRole("button", { name: "人物" });
    await expect(getComputedStyle(other).color).toBe(token("neutral-text-secondary"));

    await userEvent.click(canvas.getByRole("button", { name: "全景图" }));
    await expect(canvas.getByRole("button", { name: "全景图" })).toHaveAttribute(
      "aria-current",
      "page",
    );

    const recent = canvas.getByRole("region", { name: "最近提到" });
    await userEvent.click(within(recent).getByRole("button", { name: "张伟（老张）" }));
    await expect(onRecentClick).toHaveBeenCalledWith("zw");
  },
};

/** Tablet (AC-UI-7): folds to icons; labels stay as accessible names and tooltips. */
export const Collapsed: Story = {
  args: { collapsed: true },
  parameters: { a11y: { context: "body" } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const nav = canvas.getByRole("navigation");
    await expect(nav.getBoundingClientRect().width).toBe(64);
    await expect(canvas.queryByText("最近提到")).toBeNull();
    const people = canvas.getByRole("button", { name: "人物" });
    await userEvent.hover(people);
    await expect(await screen.findByRole("tooltip")).toHaveTextContent("人物");
  },
};
