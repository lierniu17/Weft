import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { rgb } from "../../../test/color.ts";
import { TextArea } from "./TextArea.tsx";

const meta = {
  title: "Basics/TextArea",
  component: TextArea,
  args: { "aria-label": "记录内容", placeholder: "今天和谁发生了什么？" },
  decorators: [
    (Story) => (
      <div className="w-[343px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TextArea>;

export default meta;
type Story = StoryObj<typeof meta>;

export const AutoGrow: Story = {
  play: async ({ canvasElement }) => {
    const box = within(canvasElement).getByRole("textbox", { name: "记录内容" });
    await expect(getComputedStyle(box).borderRadius).toBe("10px");
    const oneLine = box.getBoundingClientRect().height;

    await userEvent.type(box, "今天和老张吃饭{Enter}他说跟小李闹掰了{Enter}第三行");
    const threeLines = box.getBoundingClientRect().height;
    await expect(threeLines).toBeGreaterThan(oneLine);

    // Grows up to 6 rows, then scrolls instead of growing further.
    await userEvent.type(box, "{Enter}4{Enter}5{Enter}6{Enter}7{Enter}8{Enter}9");
    const capped = box.getBoundingClientRect().height;
    await userEvent.type(box, "{Enter}10");
    await expect(box.getBoundingClientRect().height).toBe(capped);
    await expect(box.scrollHeight).toBeGreaterThan(box.clientHeight);
  },
};

export const Disabled: Story = {
  args: { disabled: true, placeholder: "今日记录额度已用完" },
  play: async ({ canvasElement }) => {
    const box = within(canvasElement).getByRole("textbox", { name: "记录内容" });
    await expect(box).toBeDisabled();
    await expect(getComputedStyle(box).backgroundColor).toBe(rgb("#F5F6F8"));
  },
};
