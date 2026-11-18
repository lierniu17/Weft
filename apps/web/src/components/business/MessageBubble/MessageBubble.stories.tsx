import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { token } from "../../../test/color.ts";
import { MessageBubble } from "./MessageBubble.tsx";

const today = new Date(2026, 10, 16);

const meta = {
  title: "Business/MessageBubble",
  component: MessageBubble,
  args: {
    variant: "record",
    children: "今天和老张、小李吃饭，老张说他迷上钓鱼了，小李说他跳槽去了腾讯",
    occurredOn: { precision: "day", year: 2026, month: 11, day: 14 },
    today,
  },
  decorators: [
    (Story) => (
      <div className="w-[375px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof MessageBubble>;

export default meta;
type Story = StoryObj<typeof meta>;

const bubble = (root: HTMLElement) => root.querySelector("[data-bubble]") as HTMLElement;

/** Right-aligned, bg-muted, rounded.bubble (18px with a 6px bottom-right corner), max 78%. */
export const Record: Story = {
  play: async ({ canvasElement }) => {
    const b = bubble(canvasElement);
    const style = getComputedStyle(b);
    await expect(style.backgroundColor).toBe(token("neutral-bg-muted"));
    await expect(style.color).toBe(token("neutral-text-primary"));
    await expect(style.borderTopLeftRadius).toBe("18px");
    await expect(style.borderBottomLeftRadius).toBe("18px");
    await expect(style.borderBottomRightRadius).toBe("6px");
    const row = b.parentElement as HTMLElement;
    await expect(b.getBoundingClientRect().width).toBeLessThanOrEqual(
      row.getBoundingClientRect().width * 0.78 + 0.5,
    );
    await expect(Math.round(b.getBoundingClientRect().right)).toBe(
      Math.round(row.getBoundingClientRect().right),
    );
    await expect(within(canvasElement).getByText("记录 · 11-14")).toBeVisible();
  },
};

export const RecordToday: Story = {
  args: { occurredOn: { precision: "day", year: 2026, month: 11, day: 16 } },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText("记录 · 今天")).toBeVisible();
  },
};

/** 补记 with year precision. */
export const RecordYearPrecision: Story = {
  args: { children: "读大学时在社团认识了小李", occurredOn: { precision: "year", year: 2015 } },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText("记录 · 2015 年")).toBeVisible();
  },
};

export const Question: Story = {
  args: { variant: "question", children: "老张和小李什么关系？", occurredOn: undefined },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("提问")).toBeVisible();
    await expect(canvas.queryByText(/记录/)).toBeNull();
  },
};
