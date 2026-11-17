import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, userEvent, within } from "storybook/test";
import { rgb } from "../../../test/color.ts";
import { Input } from "./Input.tsx";

const meta = {
  title: "Basics/Input",
  component: Input,
  args: { "aria-label": "称呼", placeholder: "怎么称呼你" },
} satisfies Meta<typeof Input>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement }) => {
    const input = within(canvasElement).getByRole("textbox", { name: "称呼" });
    await expect(input.getBoundingClientRect().height).toBe(40);
    await userEvent.type(input, "小明");
    await expect(input).toHaveValue("小明");
  },
};

export const Search: Story = {
  args: { variant: "search", "aria-label": "搜索人物", placeholder: "搜索人物或别名" },
  play: async ({ canvasElement }) => {
    const input = within(canvasElement).getByRole("searchbox", { name: "搜索人物" });
    await expect(getComputedStyle(input).backgroundColor).toBe(rgb("#F5F6F8"));
    await userEvent.type(input, "老张");
    await expect(input).toHaveValue("老张");
  },
};

export const Password: Story = {
  args: { variant: "password", "aria-label": "密码", placeholder: "至少 8 位" },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const input = canvas.getByLabelText("密码", { selector: "input" });
    await userEvent.type(input, "secret123");
    await expect(input).toHaveAttribute("type", "password");

    const toggle = canvas.getByRole("button", { name: "显示密码" });
    await userEvent.click(toggle);
    await expect(input).toHaveAttribute("type", "text");
    await expect(canvas.getByRole("button", { name: "隐藏密码" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  },
};

export const ErrorState: Story = {
  name: "Error",
  args: { "aria-label": "邀请码", defaultValue: "ABC", error: "邀请码无效" },
  play: async ({ canvasElement }) => {
    const input = within(canvasElement).getByRole("textbox", { name: "邀请码" });
    await expect(input).toHaveAttribute("aria-invalid", "true");
    await expect(input).toHaveAccessibleDescription("邀请码无效");
    await expect(getComputedStyle(input).borderTopColor).toBe(rgb("#C81E1E"));
  },
};

export const Disabled: Story = {
  args: { disabled: true, defaultValue: "小明" },
  play: async ({ canvasElement }) => {
    const input = within(canvasElement).getByRole("textbox", { name: "称呼" });
    await expect(input).toBeDisabled();
    await expect(getComputedStyle(input).backgroundColor).toBe(rgb("#F5F6F8"));
  },
};
