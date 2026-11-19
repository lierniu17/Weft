import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { TRANSPARENT, token } from "../../../test/color.ts";
import { FollowsLine } from "./FollowsLine.tsx";

const meta = {
  title: "Business/FollowsLine",
  component: FollowsLine,
  args: { question: "老张在哪上班？", onDrop: fn() },
  decorators: [
    (Story) => (
      <div className="w-[375px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof FollowsLine>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * AC-10: 「接着：<上一个问题>」 as grey meta text, then 「不接上文」 as a quiet text button —
 * no fill, no border, on the same line.
 */
export const Default: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const line = canvas.getByText("接着：老张在哪上班？");
    await expect(getComputedStyle(line).color).toBe(token("neutral-text-tertiary"));
    const drop = canvas.getByRole("button", { name: "不接上文" });
    await expect(getComputedStyle(drop).color).toBe(token("neutral-text-secondary"));
    await expect(getComputedStyle(drop).backgroundColor).toBe(TRANSPARENT);
    await expect(
      Math.abs(drop.getBoundingClientRect().top - line.getBoundingClientRect().top),
    ).toBeLessThan(12);
  },
};

/** AC-10: clicking 「不接上文」 asks the page to answer again without the 上文. */
export const Drop: Story = {
  play: async ({ canvasElement, args }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "不接上文" }));
    await expect(args.onDrop).toHaveBeenCalledTimes(1);
  },
};

/** While the new answer is on its way the button spins and takes no second click. */
export const Pending: Story = {
  args: { pending: true },
  play: async ({ canvasElement, args }) => {
    const drop = within(canvasElement).getByRole("button", { name: "不接上文" });
    await expect(drop).toHaveAttribute("aria-busy", "true");
    await expect(drop).toBeDisabled();
    await userEvent.click(drop);
    await expect(args.onDrop).not.toHaveBeenCalled();
  },
};

/** A long earlier question wraps inside a 375px phone; the button stays reachable. */
export const LongQuestion: Story = {
  args: { question: "老张和小李以前是大学室友，后来因为借钱的事闹掰了，他们现在还联系吗？" },
  play: async ({ canvasElement }) => {
    const drop = within(canvasElement).getByRole("button", { name: "不接上文" });
    await expect(drop.getBoundingClientRect().right).toBeLessThanOrEqual(375.5);
  },
};
