import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { TRANSPARENT, token } from "../../../test/color.ts";
import { Button } from "./Button.tsx";

const meta = {
  title: "Basics/Button",
  component: Button,
  args: { children: "确认入图谱", onClick: fn() },
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
  play: async ({ canvasElement, args }) => {
    const button = within(canvasElement).getByRole("button", { name: "确认入图谱" });
    // AC-1: the primary button is the ink colour, a full pill.
    await expect(getComputedStyle(button).backgroundColor).toBe(token("primary-6"));
    await expect(getComputedStyle(button).color).toBe(token("on-primary"));
    await expect(getComputedStyle(button).borderRadius).toBe("9999px");

    await userEvent.click(button);
    await expect(args.onClick).toHaveBeenCalledTimes(1);

    // Keyboard activation.
    button.focus();
    await expect(button).toHaveFocus();
    await userEvent.keyboard("{Enter}");
    await expect(args.onClick).toHaveBeenCalledTimes(2);
  },
};

export const Secondary: Story = {
  args: { variant: "secondary", children: "放弃" },
  play: async ({ canvasElement }) => {
    // A thin outline on white.
    const button = within(canvasElement).getByRole("button", { name: "放弃" });
    await expect(getComputedStyle(button).backgroundColor).toBe(token("neutral-bg-container"));
    await expect(getComputedStyle(button).borderTopColor).toBe(token("neutral-border"));
    await expect(getComputedStyle(button).color).toBe(token("neutral-text-primary"));
  },
};

export const Ghost: Story = {
  args: { variant: "ghost", children: "在图上查看" },
  play: async ({ canvasElement }) => {
    // AC-1: text buttons / links are neutral grey, never coloured.
    const button = within(canvasElement).getByRole("button", { name: "在图上查看" });
    await expect(getComputedStyle(button).color).toBe(token("neutral-text-secondary"));
    await expect(getComputedStyle(button).backgroundColor).toBe(TRANSPARENT);
  },
};

export const Danger: Story = {
  args: { variant: "danger", children: "删除人物" },
  play: async ({ canvasElement }) => {
    // Danger is an outlined secondary, never a solid primary (AC-UI-6).
    const button = within(canvasElement).getByRole("button", { name: "删除人物" });
    const style = getComputedStyle(button);
    await expect(style.color).toBe(token("status-error-6"));
    await expect(style.borderTopColor).toBe(token("neutral-border"));
    await expect(style.backgroundColor).toBe(token("neutral-bg-container"));
  },
};

export const Sizes: Story = {
  render: (args) => (
    <div className="flex items-center gap-sm">
      <Button {...args} size="sm">
        小
      </Button>
      <Button {...args} size="md">
        中
      </Button>
      <Button {...args} size="lg">
        大
      </Button>
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const height = (name: string) =>
      canvas.getByRole("button", { name }).getBoundingClientRect().height;
    await expect(height("小")).toBe(28);
    await expect(height("中")).toBe(36);
    await expect(height("大")).toBe(44);
  },
};

export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ canvasElement, args }) => {
    const button = within(canvasElement).getByRole("button", { name: "确认入图谱" });
    await expect(button).toBeDisabled();
    await expect(getComputedStyle(button).opacity).toBe("0.45");
    await userEvent.click(button);
    await expect(args.onClick).not.toHaveBeenCalled();
  },
};

export const Loading: Story = {
  args: { loading: true },
  play: async ({ canvasElement, args }) => {
    // Spinner + original text; blocks a double submit.
    const button = within(canvasElement).getByRole("button", { name: /确认入图谱/ });
    await expect(button).toHaveAttribute("aria-busy", "true");
    await expect(button).toBeDisabled();
    await userEvent.click(button);
    await expect(args.onClick).not.toHaveBeenCalled();
  },
};
