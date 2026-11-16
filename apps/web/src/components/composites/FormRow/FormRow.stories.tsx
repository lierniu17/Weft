import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { Input } from "../../basics/Input/Input.tsx";
import { FormRow } from "./FormRow.tsx";

const meta = {
  title: "Composites/FormRow",
  component: FormRow,
  args: {
    label: "邀请码：",
    htmlFor: "invite",
    children: <Input id="invite" placeholder="WEFT-XXXX" />,
  },
} satisfies Meta<typeof FormRow>;

export default meta;
type Story = StoryObj<typeof meta>;

const parts = (root: HTMLElement) => {
  const label = root.querySelector("label") as HTMLElement;
  const input = within(root).getByRole("textbox");
  return { label, input };
};

/** Label right-aligned beside a left-aligned input; label names the input. */
export const Wide: Story = {
  decorators: [
    (Story) => (
      <div className="w-[375px]">
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    const { label, input } = parts(canvasElement);
    await expect(within(canvasElement).getByLabelText("邀请码：")).toBe(input);
    await expect(getComputedStyle(label).textAlign).toBe("right");
    await expect(label.getBoundingClientRect().width).toBe(96);
    // Side by side: the input starts right of the label, 8px apart.
    await expect(input.getBoundingClientRect().left - label.getBoundingClientRect().right).toBe(8);
  },
};

/** AC-UI-8: labels never exceed 96px; a long one wraps instead of pushing the input. */
export const LongLabel: Story = {
  args: {
    label: "注销前请输入登录密码：",
    htmlFor: "pw",
    children: <Input id="pw" variant="password" />,
  },
  decorators: [
    (Story) => (
      <div className="w-[375px]">
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    const label = canvasElement.querySelector("label") as HTMLElement;
    await expect(label.getBoundingClientRect().width).toBeLessThanOrEqual(96);
  },
};

/** Narrow (< 360px): label stacks above the input. */
export const Narrow: Story = {
  decorators: [
    (Story) => (
      <div className="w-[320px]">
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    const { label, input } = parts(canvasElement);
    await expect(input.getBoundingClientRect().top).toBeGreaterThan(
      label.getBoundingClientRect().bottom - 1,
    );
    await expect(getComputedStyle(label).textAlign).toBe("left");
  },
};
