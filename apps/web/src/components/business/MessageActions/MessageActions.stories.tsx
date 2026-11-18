import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { TRANSPARENT, token } from "../../../test/color.ts";
import { MessageActions } from "./MessageActions.tsx";

const meta = {
  title: "Business/MessageActions",
  component: MessageActions,
  args: {
    label: "纠正",
    actions: [{ target: "ask", label: "改为提问" }],
    onAction: fn(),
  },
  decorators: [
    (Story) => (
      <div className="w-[375px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof MessageActions>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * AC-10: a 记录 shows 改为提问 — a low-key text button: neutral grey caption text, no
 * fill and no border until hovered; clicking it asks the page to re-route the message.
 */
export const ChangeToAsk: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const group = canvas.getByRole("group", { name: "纠正" });
    const button = within(group).getByRole("button", { name: "改为提问" });
    const style = getComputedStyle(button);
    await expect(style.color).toBe(token("neutral-text-secondary"));
    await expect(style.backgroundColor).toBe(TRANSPARENT);
    await expect(button.getBoundingClientRect().height).toBe(28);
    await userEvent.click(button);
    await expect(args.onAction).toHaveBeenCalledWith("ask");
  },
};

/** AC-10: a 提问 shows 改为记录. */
export const ChangeToRecord: Story = {
  args: { actions: [{ target: "record", label: "改为记录" }] },
  play: async ({ canvasElement, args }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "改为记录" }));
    await expect(args.onAction).toHaveBeenCalledWith("record");
  },
};

/** 记录 + 提问, or a confirmed 记录: nothing to offer, nothing rendered. */
export const Nothing: Story = {
  args: { actions: [] },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).queryByRole("group")).toBeNull();
    await expect(within(canvasElement).queryByRole("button")).toBeNull();
  },
};

/** While the re-route runs, its button spins and the other waits; no second click goes out. */
export const Pending: Story = {
  args: {
    label: "怎么处理这条消息",
    actions: [
      { target: "record", label: "记下来" },
      { target: "ask", label: "帮我查" },
    ],
    pending: "record",
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const record = canvas.getByRole("button", { name: "记下来" });
    await expect(record).toHaveAttribute("aria-busy", "true");
    await expect(record).toBeDisabled();
    await expect(canvas.getByRole("button", { name: "帮我查" })).toBeDisabled();
    await userEvent.click(record);
    await expect(args.onAction).not.toHaveBeenCalled();
  },
};
