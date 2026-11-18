import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, userEvent, within } from "storybook/test";
import { motionMs } from "../../../lib/motion.ts";
import { token } from "../../../test/color.ts";
import { QuotaMeter } from "./QuotaMeter.tsx";

const meta = {
  title: "Business/QuotaMeter",
  component: QuotaMeter,
  args: { record: { used: 12, limit: 50 }, ask: { used: 63, limit: 100 } },
  decorators: [
    (Story) => (
      <div className="w-[343px] bg-neutral-bg-container">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof QuotaMeter>;

export default meta;
type Story = StoryObj<typeof meta>;

const value = (root: HTMLElement, kind: string) =>
  root.querySelector(`[data-quota=${kind}] [data-quota-value]`) as HTMLElement;

/** 「记录 12 / 50」「提问 63 / 100」, numbers right-aligned (S6 ③ 额度数字右对齐). */
export const Normal: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("heading", { name: "今日额度" })).toBeVisible();
    const record = value(canvasElement, "record");
    const ask = value(canvasElement, "ask");
    await expect(record).toHaveTextContent("12 / 50");
    await expect(ask).toHaveTextContent("63 / 100");
    await expect(getComputedStyle(record).textAlign).toBe("right");
    await expect(getComputedStyle(record).fontVariantNumeric).toBe("tabular-nums");
    // Right edges line up.
    await expect(record.getBoundingClientRect().right).toBe(ask.getBoundingClientRect().right);
    await expect(getComputedStyle(record).color).toBe(token("neutral-text-primary"));
  },
};

/** Less than 10% left turns warning. */
export const Low: Story = {
  args: { record: { used: 46, limit: 50 } },
  play: async ({ canvasElement }) => {
    const record = value(canvasElement, "record");
    await expect(getComputedStyle(record).color).toBe(token("status-warning-6"));
    await expect(canvasElement.querySelector("[data-quota=record]")).toHaveTextContent("即将用完");
    await expect(getComputedStyle(value(canvasElement, "ask")).color).toBe(
      token("neutral-text-primary"),
    );
  },
};

/** Used up turns error, with the reset time written out. */
export const Exhausted: Story = {
  args: { record: { used: 50, limit: 50 }, resetHint: "北京时间 0 点重置" },
  play: async ({ canvasElement }) => {
    const record = value(canvasElement, "record");
    await expect(getComputedStyle(record).color).toBe(token("status-error-6"));
    await expect(canvasElement.querySelector("[data-quota=record]")).toHaveTextContent("已用完");
    await expect(within(canvasElement).getByText("北京时间 0 点重置")).toBeVisible();
  },
};

function Counting() {
  const [used, setUsed] = useState(12);
  return (
    <div className="flex flex-col gap-sm">
      <QuotaMeter record={{ used, limit: 50 }} ask={{ used: 63, limit: 100 }} />
      <button type="button" onClick={() => setUsed((n) => n + 1)}>
        再记一条
      </button>
    </div>
  );
}

/** Style refresh AC-15: a changed count rolls in from below (motion.emphasis); not on first paint. */
export const NumberRoll: Story = {
  render: () => <Counting />,
  parameters: { motion: true },
  play: async ({ canvasElement }) => {
    const used = () =>
      canvasElement.querySelector("[data-quota=record] [data-quota-used]") as HTMLElement;
    await expect(getComputedStyle(used()).animationName).toBe("none");
    await userEvent.click(within(canvasElement).getByRole("button", { name: "再记一条" }));
    await expect(used()).toHaveTextContent("13");
    await expect(getComputedStyle(used()).animationName).toBe("number-roll");
    await expect(getComputedStyle(used()).animationDuration).toBe(
      `${motionMs("emphasis") / 1000}s`,
    );
    await expect(value(canvasElement, "record")).toHaveTextContent("13 / 50");
  },
};
