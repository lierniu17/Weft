import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { TRANSPARENT, token } from "../../../test/color.ts";
import { tokens } from "../../../tokens.gen.ts";

import { ChatComposer } from "./ChatComposer.tsx";

const meta = {
  title: "Business/ChatComposer",
  component: ChatComposer,
  args: { onSubmit: fn() },
  decorators: [
    (Story) => (
      <div className="w-[375px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ChatComposer>;

export default meta;
type Story = StoryObj<typeof meta>;

const parts = (root: HTMLElement) => {
  const canvas = within(root);
  return {
    canvas,
    input: canvas.getByRole("textbox"),
    send: canvas.getByRole("button", { name: "发送" }),
  };
};

/**
 * Intent routing AC-1: only the box and send — no 记录 / 提问 switch, no date; the
 * placeholder invites both. Blank cannot be sent.
 */
export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const { canvas, input, send } = parts(canvasElement);
    await expect(input).toHaveAttribute("placeholder", "记点什么，或问点什么……");
    await expect(input).toHaveAccessibleName("消息内容");
    await expect(canvas.queryByRole("radiogroup")).toBeNull();
    await expect(canvas.queryByRole("radio")).toBeNull();
    await expect(canvas.queryByRole("button", { name: /发生日期/ })).toBeNull();
    // the send button is the only control
    await expect(canvas.getAllByRole("button")).toEqual([send]);
    await expect(send).toBeDisabled();
    await userEvent.type(input, "   ");
    await expect(send).toBeDisabled();
    await userEvent.click(send);
    await expect(args.onSubmit).not.toHaveBeenCalled();
  },
};

/** Sends the trimmed text (record or question alike), then clears the box. */
export const Submit: Story = {
  play: async ({ canvasElement, args }) => {
    const { input, send } = parts(canvasElement);
    await userEvent.type(input, " 老张和小李是什么关系？ ");
    await expect(send).toBeEnabled();
    await expect(getComputedStyle(send).backgroundColor).toBe(token("primary-6"));
    await userEvent.click(send);
    await expect(args.onSubmit).toHaveBeenCalledWith("老张和小李是什么关系？");
    await expect(input).toHaveValue("");
    // still no switch after a question: there is nothing to switch back
    await expect(within(canvasElement).queryByRole("radio")).toBeNull();
  },
};

/** Ctrl / ⌘ + Enter sends; plain Enter is a new line. */
export const KeyboardSend: Story = {
  play: async ({ canvasElement, args }) => {
    const { input } = parts(canvasElement);
    await userEvent.type(input, "第一行{Enter}第二行");
    await expect(args.onSubmit).not.toHaveBeenCalled();
    await expect(input).toHaveValue("第一行\n第二行");
    await userEvent.keyboard("{Control>}{Enter}{/Control}");
    await expect(args.onSubmit).toHaveBeenCalledWith("第一行\n第二行");
  },
};

/** AC-7: one quota used up is a notice; the box still sends (the other kind is unaffected). */
export const OneQuotaUsedUp: Story = {
  args: {
    notice: "今日已达上限：今天的 50 条记录已用完，北京时间 0 点重置 · 提问还剩 37 次",
  },
  play: async ({ canvasElement, args }) => {
    const { canvas, input, send } = parts(canvasElement);
    const banner = canvas.getByRole("status");
    await expect(banner).toHaveTextContent("北京时间 0 点重置");
    await expect(getComputedStyle(banner).backgroundColor).toBe(token("status-warning-1"));
    await expect(input).toBeEnabled();
    await userEvent.type(input, "老张是什么样的人？");
    await userEvent.click(send);
    await expect(args.onSubmit).toHaveBeenCalledWith("老张是什么样的人？");
  },
};

/** Both quotas used up: input and send disabled, warning banner with the reset time. */
export const BothQuotasUsedUp: Story = {
  args: { blocked: "今日已达上限：今天的记录和提问都已用完，北京时间 0 点重置" },
  play: async ({ canvasElement }) => {
    const { canvas, input, send } = parts(canvasElement);
    await expect(canvas.getByRole("status")).toHaveTextContent("都已用完");
    await expect(input).toBeDisabled();
    await expect(send).toBeDisabled();
  },
};

/** Sending: the send button spins and blocks a double submit. */
export const Sending: Story = {
  args: { sending: true, defaultValue: "今天和老张吃饭" },
  play: async ({ canvasElement, args }) => {
    const { send } = parts(canvasElement);
    await expect(send).toHaveAttribute("aria-busy", "true");
    await expect(send).toBeDisabled();
    await userEvent.click(send);
    await expect(args.onSubmit).not.toHaveBeenCalled();
  },
};

/** A controlled value lets the page fill the box (first-use examples, follow-ups). */
export const Controlled: Story = {
  args: { value: "2015 年读大学时在社团认识了小李", onValueChange: fn() },
  play: async ({ canvasElement, args }) => {
    const { input } = parts(canvasElement);
    await expect(input).toHaveValue("2015 年读大学时在社团认识了小李");
    await userEvent.type(input, "。");
    await expect(args.onValueChange).toHaveBeenCalledWith("2015 年读大学时在社团认识了小李。");
  },
};

/**
 * Style refresh AC-7: the composer is the page's focal point — one rounded.xl box with a thin
 * border and shadow.md, shadow.lg while focused; the textarea has no box of its own; the
 * round ink send button sits at 25% opacity and cannot be pressed while the box is empty.
 */
export const FocalPoint: Story = {
  play: async ({ canvasElement }) => {
    const { input, send } = parts(canvasElement);
    const box = canvasElement.querySelector("[data-composer-box]") as HTMLElement;
    const style = getComputedStyle(box);
    await expect(style.borderTopLeftRadius).toBe(tokens.radius.xl);
    await expect(style.borderTopColor).toBe(token("neutral-border"));
    await expect(style.boxShadow).toContain("rgba(0, 0, 0, 0.06) 0px 4px 16px 0px"); // shadow.md
    await expect(getComputedStyle(input).borderTopWidth).toBe("0px");
    await expect(getComputedStyle(input).backgroundColor).toBe(TRANSPARENT);
    await expect(getComputedStyle(send).opacity).toBe("0.25");
    await expect(send).toBeDisabled();
    await expect(getComputedStyle(send).borderTopLeftRadius).toBe("9999px");
    await userEvent.click(input);
    await waitFor(() =>
      expect(getComputedStyle(box).boxShadow).toContain("rgba(0, 0, 0, 0.1) 0px 12px 32px 0px"),
    ); // shadow.lg
    await userEvent.type(input, "今天");
    await waitFor(() => expect(getComputedStyle(send).opacity).toBe("1"));
  },
};
