import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { TRANSPARENT, token } from "../../../test/color.ts";
import { ChitchatReply } from "./ChitchatReply.tsx";

const meta = {
  title: "Business/ChitchatReply",
  component: ChitchatReply,
  args: {
    reply: "不客气，有想记下的事随时告诉我。",
    actions: [
      { target: "record", label: "记下来" },
      { target: "ask", label: "帮我查" },
    ],
    onAction: fn(),
  },
  decorators: [
    (Story) => (
      <div className="w-[375px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ChitchatReply>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * AC-6: a short reply on the page (not boxed, like answers), then 记下来 / 帮我查; each
 * button hands the message back to the page with how to handle it.
 */
export const Chitchat: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const reply = canvas.getByText("不客气，有想记下的事随时告诉我。");
    await expect(getComputedStyle(reply).backgroundColor).toBe(TRANSPARENT);
    await expect(getComputedStyle(reply).color).toBe(token("neutral-text-primary"));
    const group = canvas.getByRole("group", { name: "怎么处理这条消息" });
    await expect(
      within(group)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["记下来", "帮我查"]);
    await userEvent.click(canvas.getByRole("button", { name: "记下来" }));
    await expect(args.onAction).toHaveBeenLastCalledWith("record");
    await userEvent.click(canvas.getByRole("button", { name: "帮我查" }));
    await expect(args.onAction).toHaveBeenLastCalledWith("ask");
  },
};

/** 拿不准: the fixed sentence, and the same two buttons. */
export const Uncertain: Story = {
  args: { reply: "我没确定你是想记下来还是查询" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("我没确定你是想记下来还是查询")).toBeVisible();
    await expect(canvas.getByRole("button", { name: "记下来" })).toBeEnabled();
    await expect(canvas.getByRole("button", { name: "帮我查" })).toBeEnabled();
  },
};

/** 记下来 is running: it spins, 帮我查 waits. */
export const Recording: Story = {
  args: { pending: "record" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("button", { name: "记下来" })).toHaveAttribute(
      "aria-busy",
      "true",
    );
    await expect(canvas.getByRole("button", { name: "帮我查" })).toBeDisabled();
  },
};
