import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { token } from "../../../test/color.ts";
import { MessageActions } from "../MessageActions/MessageActions.tsx";
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

/** 记录 + 提问: both kinds in the meta line. */
export const Both: Story = {
  args: {
    variant: "both",
    children: "老张升职了，他现在在哪个部门？",
    occurredOn: { precision: "day", year: 2026, month: 11, day: 16 },
  },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText("记录 · 今天 · 提问")).toBeVisible();
  },
};

/** 无关: no meta line at all. */
export const Plain: Story = {
  args: { variant: "plain", children: "谢谢", occurredOn: undefined },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByText(/记录|提问/)).toBeNull();
  },
};

const onAction = fn();

/** The 纠正 row sits at the end of the meta line, right-aligned under the bubble. */
export const WithCorrection: Story = {
  args: {
    actions: (
      <MessageActions
        label="纠正"
        actions={[{ target: "ask", label: "改为提问" }]}
        onAction={onAction}
      />
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const meta = canvas.getByText("记录 · 11-14");
    const button = canvas.getByRole("button", { name: "改为提问" });
    await expect(button.getBoundingClientRect().left).toBeGreaterThan(
      meta.getBoundingClientRect().right,
    );
    const bubble = canvasElement.querySelector("[data-bubble]") as HTMLElement;
    await expect(Math.round(button.getBoundingClientRect().right)).toBe(
      Math.round(bubble.getBoundingClientRect().right),
    );
    await userEvent.click(button);
    await expect(onAction).toHaveBeenCalledWith("ask");
  },
};
