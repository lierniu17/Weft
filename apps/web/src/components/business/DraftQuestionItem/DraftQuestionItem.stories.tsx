import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { token } from "../../../test/color.ts";
import { DraftQuestionItem } from "./DraftQuestionItem.tsx";
import { WHEN_QUESTION, XIAOLI_QUESTION } from "./fixtures.ts";

const meta = {
  title: "Business/DraftQuestionItem",
  component: DraftQuestionItem,
  args: { question: XIAOLI_QUESTION, onAnswer: fn() },
  decorators: [
    (Story) => (
      <ul className="w-[343px]">
        <Story />
      </ul>
    ),
  ],
} satisfies Meta<typeof DraftQuestionItem>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * AC-5: the question as a plain sentence, then its candidates as chips and 「自己填」; the
 * input is not there until asked for.
 */
export const Open: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const prompt = canvas.getByText("小李是你的同事还是同学？");
    await expect(getComputedStyle(prompt).color).toBe(token("neutral-text-primary"));
    const group = canvas.getByRole("group", { name: "小李是你的同事还是同学？" });
    await expect(
      within(group)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["同事", "同学", "自己填"]);
    await expect(canvas.getByRole("button", { name: "自己填" })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    await expect(canvas.queryByRole("textbox")).toBeNull();
  },
};

/** AC-6: clicking a candidate hands its index to the sheet (the first one is 0). */
export const ClickOption: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "同学" }));
    await expect(args.onAnswer).toHaveBeenLastCalledWith({ option: 1 });
    await userEvent.click(canvas.getByRole("button", { name: "同事" }));
    await expect(args.onAnswer).toHaveBeenLastCalledWith({ option: 0 });
  },
};

/**
 * AC-7: 「自己填」 opens a single-line input in place; 确定 sends the trimmed text; a blank
 * answer cannot be sent.
 */
export const TypeAnAnswer: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const own = canvas.getByRole("button", { name: "自己填" });
    await userEvent.click(own);
    await expect(own).toHaveAttribute("aria-expanded", "true");
    const input = canvas.getByRole("textbox", { name: "自己填：小李是你的同事还是同学？" });
    await expect(input).toHaveFocus();
    const send = canvas.getByRole("button", { name: "确定" });
    await expect(send).toBeDisabled();
    await userEvent.type(input, "  他是我大学同学 ");
    await userEvent.click(send);
    await expect(args.onAnswer).toHaveBeenCalledWith({ text: "他是我大学同学" });
  },
};

/** Enter sends the typed answer too. */
export const TypeAndEnter: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "自己填" }));
    await userEvent.type(canvas.getByRole("textbox"), "合伙人{Enter}");
    await expect(args.onAnswer).toHaveBeenCalledWith({ text: "合伙人" });
  },
};

/**
 * AC-7: a typed answer the server did not understand: the hint stays under the input (in
 * error red, as the input's description); the input keeps the text to fix.
 */
export const NotUnderstood: Story = {
  args: { hint: "没理解这个回答，可以直接在草稿里改" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "自己填" }));
    const input = canvas.getByRole("textbox");
    await expect(input).toHaveAccessibleDescription("没理解这个回答，可以直接在草稿里改");
    const hint = canvas.getByText("没理解这个回答，可以直接在草稿里改");
    await expect(getComputedStyle(hint).color).toBe(token("status-error-6"));
  },
};

/** While the answer is applied, the candidates wait and the group says it is busy. */
export const Pending: Story = {
  args: { pending: true },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const group = canvas.getByRole("group");
    await expect(group).toHaveAttribute("aria-busy", "true");
    const option = canvas.getByRole("button", { name: "同事" });
    await expect(option).toBeDisabled();
    await userEvent.click(option);
    await expect(args.onAnswer).not.toHaveBeenCalled();
  },
};

/** 「前阵子是什么时候？」: three candidates and 自己填 wrap inside a phone sheet. */
export const OccurredQuestion: Story = {
  args: { question: WHEN_QUESTION },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const right = canvasElement.querySelector("ul")?.getBoundingClientRect().right ?? 0;
    for (const b of canvas.getAllByRole("button")) {
      await expect(b.getBoundingClientRect().right).toBeLessThanOrEqual(right + 0.5);
    }
    await expect(canvas.getByRole("button", { name: "两三个月前" })).toBeVisible();
  },
};
