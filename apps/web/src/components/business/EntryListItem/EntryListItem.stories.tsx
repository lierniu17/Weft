import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { rgb } from "../../../test/color.ts";
import { EntryListItem } from "./EntryListItem.tsx";

const today = new Date(2026, 10, 16);

const meta = {
  title: "Business/EntryListItem",
  component: EntryListItem,
  args: {
    text: "今天和老张、小李吃饭，老张说他迷上钓鱼了",
    occurredOn: "2026-11-16",
    today,
    itemCount: 3,
    status: "confirmed",
    onClick: fn(),
  },
  decorators: [
    (Story) => (
      <div className="w-[375px] bg-neutral-bg-container">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof EntryListItem>;

export default meta;
type Story = StoryObj<typeof meta>;

const status = (root: HTMLElement) => root.querySelector("[data-entry-status]") as HTMLElement;

/** AC-9: text, date with precision, number of facts, draft status. */
export const Confirmed: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const row = canvas.getByRole("button", { name: /今天和老张/ });
    await expect(row).toHaveTextContent("今天 · 3 条信息");
    await expect(status(canvasElement)).toHaveTextContent("已确认");
    await expect(getComputedStyle(status(canvasElement)).color).toBe(rgb("#5B6475"));
    await userEvent.click(row);
    await expect(args.onClick).toHaveBeenCalled();
  },
};

/** AC-UI-2: 待确认 is red with a dot. */
export const Pending: Story = {
  args: {
    status: "pending",
    itemCount: undefined,
    occurredOn: "2026-11-08",
    text: "周末和小李打球",
  },
  play: async ({ canvasElement }) => {
    const s = status(canvasElement);
    await expect(s).toHaveTextContent("待确认");
    await expect(getComputedStyle(s).color).toBe(rgb("#C81E1E"));
    await expect(within(canvasElement).getByRole("img", { name: "有待确认的草稿" })).toBeVisible();
    await expect(within(canvasElement).getByRole("button")).toHaveTextContent("11-08");
  },
};

/** Discarded reads secondary (text-disabled fails 4.5:1 contrast for body text). */
export const Discarded: Story = {
  args: {
    status: "discarded",
    itemCount: undefined,
    occurredOn: "2026-11-15",
    text: "随手写的一句话",
  },
  play: async ({ canvasElement }) => {
    await expect(status(canvasElement)).toHaveTextContent("已放弃");
    await expect(getComputedStyle(status(canvasElement)).color).toBe(rgb("#5B6475"));
    await expect(within(canvasElement).queryByRole("img")).toBeNull();
  },
};

export const Failed: Story = {
  args: { status: "failed", itemCount: undefined },
  play: async ({ canvasElement }) => {
    await expect(status(canvasElement)).toHaveTextContent("整理失败");
    await expect(getComputedStyle(status(canvasElement)).color).toBe(rgb("#C81E1E"));
  },
};

/** 补记 with year precision (BOT-12). */
export const Backfilled: Story = {
  args: { text: "读大学时在社团认识了小李", occurredOn: "2015", backfilled: true, itemCount: 2 },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole("button")).toHaveTextContent(
      "2015 年 · 2 条信息 · 补记",
    );
  },
};

/** BOT-6: edits made on the profile page appear as 手动编辑 entries. */
export const ManualEdit: Story = {
  args: { text: "把张伟的生日改为 3 月 5 日", manual: true, itemCount: 1 },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByRole("button")).toHaveTextContent("手动编辑");
  },
};

const LONG = "今天和老张、小李、王芳一起在公司楼下的川菜馆吃饭，".repeat(12).slice(0, 300);

/** AC-UI-8: a 300-character entry is clamped to two lines in the list. */
export const LongTextClamps: Story = {
  args: { text: LONG },
  play: async ({ canvasElement }) => {
    await expect(Array.from(LONG).length).toBe(300);
    const text = canvasElement.querySelector("[data-entry-text]") as HTMLElement;
    const lineHeight = Number.parseFloat(getComputedStyle(text).lineHeight);
    await expect(text.getBoundingClientRect().height).toBe(lineHeight * 2);
    await expect(text.scrollHeight).toBeGreaterThan(text.clientHeight);
    // The full text is still the row's accessible name.
    await expect(within(canvasElement).getByRole("button")).toHaveAccessibleName(
      expect.stringContaining(LONG),
    );
  },
};
