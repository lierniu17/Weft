import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { TRANSPARENT, token } from "../../../test/color.ts";
import { ClarifyReply } from "./ClarifyReply.tsx";

const QUESTION = "你是想记下“老周最近不太顺”，还是想查老周最近怎么样？";

const meta = {
  title: "Business/ClarifyReply",
  component: ClarifyReply,
  args: {
    question: QUESTION,
    options: [
      { target: 0, label: "记下：老周最近不太顺" },
      { target: 1, label: "查：老周最近怎么样" },
    ],
    onOption: fn(),
  },
  decorators: [
    (Story) => (
      <div className="w-[375px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ClarifyReply>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * AC-1: an open 反问 — the concrete question as plain text on the page (not boxed), then its
 * options as low-key grey text buttons, in order.
 */
export const Open: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const question = canvas.getByText(QUESTION);
    await expect(getComputedStyle(question).backgroundColor).toBe(TRANSPARENT);
    await expect(getComputedStyle(question).color).toBe(token("neutral-text-primary"));
    const group = canvas.getByRole("group", { name: "选一个，或直接回答" });
    const buttons = within(group).getAllByRole("button");
    await expect(buttons.map((b) => b.textContent)).toEqual([
      "记下：老周最近不太顺",
      "查：老周最近怎么样",
    ]);
    for (const b of buttons) {
      await expect(getComputedStyle(b).color).toBe(token("neutral-text-secondary"));
      await expect(getComputedStyle(b).backgroundColor).toBe(TRANSPARENT);
    }
    // No 记下来 / 帮我查 beside the options.
    await expect(canvas.queryByRole("button", { name: "记下来" })).toBeNull();
  },
};

/** AC-3: clicking an option hands its index back to the page (the first one is 0). */
export const ClickOption: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "查：老周最近怎么样" }));
    await expect(args.onOption).toHaveBeenLastCalledWith(1);
    await userEvent.click(canvas.getByRole("button", { name: "记下：老周最近不太顺" }));
    await expect(args.onOption).toHaveBeenLastCalledWith(0);
  },
};

/** While an option runs (even the first, index 0), it spins and the others wait. */
export const Pending: Story = {
  args: { pending: 0 },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const record = canvas.getByRole("button", { name: "记下：老周最近不太顺" });
    await expect(record).toHaveAttribute("aria-busy", "true");
    const ask = canvas.getByRole("button", { name: "查：老周最近怎么样" });
    await expect(ask).toBeDisabled();
    await userEvent.click(ask);
    await expect(args.onOption).not.toHaveBeenCalled();
  },
};

/** AC-3, AC-8: once resolved (clicked or answered) the question stays, the options are gone. */
export const Resolved: Story = {
  args: { options: [] },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText(QUESTION)).toBeVisible();
    await expect(canvas.queryByRole("group")).toBeNull();
    await expect(canvas.queryByRole("button")).toBeNull();
  },
};

/** Three options with the longest labels (30 characters) wrap inside a 375px phone. */
export const LongOptions: Story = {
  args: {
    question: "你是想记下阿杰最近换了岗位、搬去了杭州这件事，还是想查他现在在哪个部门？",
    options: [
      { target: 0, label: "记下：阿杰最近换了岗位，搬去了杭州，和老婆孩子一起住在滨江那边" },
      { target: 1, label: "查：阿杰现在在哪个部门" },
      { target: 2, label: "记下并查：阿杰换岗位了，他现在在哪个部门" },
    ],
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const group = canvas.getByRole("group", { name: "选一个，或直接回答" });
    const width = canvasElement.querySelector("div")?.getBoundingClientRect().right ?? 0;
    for (const b of within(group).getAllByRole("button")) {
      await expect(b.getBoundingClientRect().right).toBeLessThanOrEqual(width + 0.5);
    }
  },
};
