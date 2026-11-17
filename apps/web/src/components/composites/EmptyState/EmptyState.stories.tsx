import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { EmptyState } from "./EmptyState.tsx";

const meta = {
  title: "Composites/EmptyState",
  component: EmptyState,
  args: { variant: "no-people", onAction: fn() },
  decorators: [
    (Story) => (
      <div className="w-[375px] bg-neutral-bg-container">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof EmptyState>;

export default meta;
type Story = StoryObj<typeof meta>;

const EXAMPLES = [
  "今天和老张吃饭，他说女儿明年高考",
  "读大学时在社团认识了小李",
  "小王是我通过老张认识的客户",
];

/** AC-UI-3: first use has an illustration, one sentence and three clickable examples. */
export const FirstUse: Story = {
  args: { variant: "first-use", examples: EXAMPLES, onExample: fn(), onAction: undefined },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvasElement.querySelector("[data-illustration=first-use]")).not.toBeNull();
    await expect(canvas.getByRole("heading", { name: "随手记下和人有关的事" })).toBeVisible();
    const list = canvas.getByRole("list", { name: "示例记录" });
    const buttons = within(list).getAllByRole("button");
    await expect(buttons).toHaveLength(3);
    await userEvent.click(buttons[1]);
    await expect(args.onExample).toHaveBeenCalledWith("读大学时在社团认识了小李");
  },
};

/** AC-UI-3 / AC-20: only 本人 in the list → 「去记一笔」. */
export const NoPeople: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvasElement.querySelector("[data-illustration=no-people]")).not.toBeNull();
    await expect(canvas.getByRole("heading", { name: "还没有记录任何人" })).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "去记一笔" }));
    await expect(args.onAction).toHaveBeenCalled();
  },
};

/** AC-UI-3: opening a person that does not exist (or someone else's). */
export const NotFound: Story = {
  args: { variant: "not-found" },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvasElement.querySelector("[data-illustration=not-found]")).not.toBeNull();
    await expect(canvas.getByRole("heading", { name: "这个人物不存在" })).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "回到人物列表" }));
    await expect(args.onAction).toHaveBeenCalled();
  },
};
