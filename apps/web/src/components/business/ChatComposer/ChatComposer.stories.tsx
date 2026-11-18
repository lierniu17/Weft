import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test";
import { token } from "../../../test/color.ts";
import { ChatComposer } from "./ChatComposer.tsx";

const today = new Date(2026, 10, 16);

const meta = {
  title: "Business/ChatComposer",
  component: ChatComposer,
  args: {
    today,
    occurredOn: { precision: "day", year: 2026, month: 11, day: 16 },
    onOccurredOnChange: fn(),
    onSubmit: fn(),
  },
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
    record: canvas.getByRole("radio", { name: "记录" }),
    ask: canvas.getByRole("radio", { name: "提问" }),
    input: canvas.getByRole("textbox"),
    send: canvas.getByRole("button", { name: "发送" }),
  };
};

/** Record mode: placeholder, date chip, filled send button; blank cannot be sent (AC-6). */
export const Record: Story = {
  play: async ({ canvasElement, args }) => {
    const { canvas, record, input, send } = parts(canvasElement);
    await expect(record).toHaveAttribute("aria-checked", "true");
    await expect(input).toHaveAttribute("placeholder", "今天和谁发生了什么？");
    await expect(input).toHaveAccessibleName("记录内容");
    await expect(canvas.getByRole("button", { name: "发生日期：今天" })).toBeVisible();
    await expect(send).toBeDisabled();
    await userEvent.type(input, "   ");
    await expect(send).toBeDisabled();
    await userEvent.click(send);
    await expect(args.onSubmit).not.toHaveBeenCalled();
  },
};

/** Sends text + mode + 发生日期, then clears the box. */
export const SubmitRecord: Story = {
  play: async ({ canvasElement, args }) => {
    const { input, send } = parts(canvasElement);
    await userEvent.type(input, "今天和老张吃饭");
    await expect(send).toBeEnabled();
    await expect(getComputedStyle(send).backgroundColor).toBe(token("primary-6"));
    await userEvent.click(send);
    await expect(args.onSubmit).toHaveBeenCalledWith({
      mode: "record",
      text: "今天和老张吃饭",
      occurredOn: { precision: "day", year: 2026, month: 11, day: 16 },
    });
    await expect(input).toHaveValue("");
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
    await expect(args.onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "record", text: "第一行\n第二行" }),
    );
  },
};

/** AC-UI-1: ask mode has no date chip; after the question is sent it switches back to 记录. */
export const AskThenBackToRecord: Story = {
  play: async ({ canvasElement, args }) => {
    const { canvas, ask, input } = parts(canvasElement);
    await userEvent.click(ask);
    await expect(ask).toHaveAttribute("aria-checked", "true");
    await expect(canvas.queryByRole("button", { name: /发生日期/ })).toBeNull();
    await expect(input).toHaveAttribute("placeholder", "想问关于谁的什么事？");
    await expect(input).toHaveAccessibleName("提问内容");

    await userEvent.type(input, "老张和小李什么关系？");
    await userEvent.click(canvas.getByRole("button", { name: "发送" }));
    await expect(args.onSubmit).toHaveBeenCalledWith({ mode: "ask", text: "老张和小李什么关系？" });
    await waitFor(() =>
      expect(canvas.getByRole("radio", { name: "记录" })).toHaveAttribute("aria-checked", "true"),
    );
    await expect(canvas.getByRole("button", { name: "发生日期：今天" })).toBeVisible();
  },
};

/** The date chip opens the DatePicker sheet (AC-7 component). */
export const ChangeDate: Story = {
  parameters: { a11y: { context: "body" } },
  play: async ({ canvasElement }) => {
    const { canvas } = parts(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "发生日期：今天" }));
    await expect(await screen.findByRole("dialog", { name: "发生日期" })).toBeVisible();
  },
};

/** AC-UI-3 / AC-40: record quota used up → input and send disabled, warning banner with reset time. */
export const RecordQuotaExhausted: Story = {
  args: {
    exhausted: { record: "今天的 50 条记录已用完 · 北京时间 0 点重置 · 提问还剩 37 次" },
  },
  play: async ({ canvasElement }) => {
    const { canvas, input, send, ask } = parts(canvasElement);
    const banner = canvas.getByRole("status");
    await expect(banner).toHaveTextContent("北京时间 0 点重置");
    await expect(getComputedStyle(banner).backgroundColor).toBe(token("status-warning-1"));
    await expect(input).toBeDisabled();
    await expect(send).toBeDisabled();
    // Asking is judged by its own quota (S5 ③).
    await userEvent.click(ask);
    await expect(canvas.queryByRole("status")).toBeNull();
    await expect(canvas.getByRole("textbox")).toBeEnabled();
  },
};

export const AskQuotaExhausted: Story = {
  args: { defaultMode: "ask", exhausted: { ask: "今天的 100 次提问已用完 · 北京时间 0 点重置" } },
  play: async ({ canvasElement }) => {
    const { canvas, input, send } = parts(canvasElement);
    await expect(canvas.getByRole("status")).toHaveTextContent("提问已用完");
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

/** A controlled value lets the page fill the box (first-use examples). */
export const Controlled: Story = {
  args: { value: "读大学时在社团认识了小李", onValueChange: fn() },
  play: async ({ canvasElement, args }) => {
    const { input } = parts(canvasElement);
    await expect(input).toHaveValue("读大学时在社团认识了小李");
    await userEvent.type(input, "。");
    await expect(args.onValueChange).toHaveBeenCalledWith("读大学时在社团认识了小李。");
  },
};
