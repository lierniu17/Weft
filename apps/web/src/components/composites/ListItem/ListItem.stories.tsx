import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, screen, userEvent, within } from "storybook/test";
import { rgb } from "../../../test/color.ts";
import { Avatar } from "../../basics/Avatar/Avatar.tsx";
import { ListItem } from "./ListItem.tsx";

const meta = {
  title: "Composites/ListItem",
  component: ListItem,
  args: { title: "我的记录", subtitle: "126 条" },
  decorators: [
    (Story) => (
      <div className="w-[343px] bg-neutral-bg-container">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ListItem>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const row = canvasElement.querySelector("[data-list-item]") as HTMLElement;
    await expect(row.getBoundingClientRect().height).toBeGreaterThanOrEqual(56);
    // Not clickable: no button, no hover affordance.
    await expect(within(canvasElement).queryByRole("button")).toBeNull();
  },
};

export const WithAvatar: Story = {
  args: {
    variant: "with-avatar",
    title: "李明",
    subtitle: "大学同学 · 3 天前提到",
    leading: <Avatar name="李明" />,
    onClick: fn(),
  },
  play: async ({ canvasElement, args }) => {
    const row = within(canvasElement).getByRole("button", { name: /李明/ });
    await expect(within(row).getByRole("img", { name: "李明" })).toBeVisible();
    await userEvent.click(row);
    await expect(args.onClick).toHaveBeenCalledTimes(1);
    row.focus();
    await userEvent.keyboard("{Enter}");
    await expect(args.onClick).toHaveBeenCalledTimes(2);
  },
};

export const Navigational: Story = {
  args: { variant: "navigational", title: "关系类型词表", subtitle: "自定义 2 个", onClick: fn() },
  play: async ({ canvasElement }) => {
    const row = within(canvasElement).getByRole("button", { name: /关系类型词表/ });
    await expect(row.querySelector("svg")).not.toBeNull();
    // Whole row is the hit area and changes colour on hover (AC-UI-10).
    await expect(row.getBoundingClientRect().width).toBe(343);
    await expect(getComputedStyle(row).transitionProperty).toContain("background-color");
  },
};

/** Numbers right-aligned (DESIGN.md §2). */
export const Value: Story = {
  args: { variant: "value", title: "记录", subtitle: undefined, value: "12 / 50" },
  play: async ({ canvasElement }) => {
    const value = within(canvasElement).getByText("12 / 50");
    await expect(getComputedStyle(value).textAlign).toBe("right");
    const row = canvasElement.querySelector("[data-list-item]") as HTMLElement;
    const gap = row.getBoundingClientRect().right - value.getBoundingClientRect().right;
    await expect(gap).toBe(16);
  },
};

export const Link: Story = {
  args: { variant: "navigational", title: "退出登录", subtitle: undefined, href: "#logout" },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole("link", { name: "退出登录" })).toHaveAttribute(
      "href",
      "#logout",
    );
  },
};

const LONG = "赵一二三四五六七八九十甲乙丙丁戊己庚辛壬癸";

/** AC-UI-8: a 20+ character name is cut to one line with an ellipsis, full name on hover. */
export const LongTitleTruncates: Story = {
  args: {
    variant: "with-avatar",
    title: LONG,
    subtitle: "邻居 · 2 个月前",
    leading: <Avatar name={LONG} />,
    onClick: fn(),
  },
  parameters: { a11y: { context: "body" } },
  play: async ({ canvasElement }) => {
    const title = canvasElement.querySelector("[data-list-item-title]") as HTMLElement;
    await expect(Array.from(LONG).length).toBeGreaterThanOrEqual(20);
    await expect(getComputedStyle(title).textOverflow).toBe("ellipsis");
    await expect(title.scrollWidth).toBeGreaterThan(title.clientWidth);
    await expect(title.getBoundingClientRect().height).toBe(22); // one line
    await userEvent.hover(within(canvasElement).getByRole("button"));
    await expect(await screen.findByRole("tooltip")).toHaveTextContent(LONG);
  },
};

export const ShortTitleHasNoTooltip: Story = {
  args: { variant: "navigational", title: "张伟", onClick: fn() },
  parameters: { a11y: { context: "body" } },
  play: async ({ canvasElement }) => {
    await userEvent.hover(within(canvasElement).getByRole("button"));
    await new Promise((r) => setTimeout(r, 400));
    await expect(screen.queryByRole("tooltip")).toBeNull();
  },
};

/** First load draws the row's shape (AC-UI-3), hidden from assistive tech. */
export const Loading: Story = {
  args: { variant: "with-avatar", loading: true },
  play: async ({ canvasElement }) => {
    const row = canvasElement.querySelector("[data-list-item=loading]") as HTMLElement;
    await expect(row).toHaveAttribute("aria-hidden", "true");
    await expect(row.querySelectorAll("[data-skeleton]")).toHaveLength(3);
    await expect(
      getComputedStyle(row.querySelector("[data-skeleton]") as Element).backgroundColor,
    ).toBe(rgb("#EBEEF2"));
  },
};
