import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { token } from "../../../test/color.ts";
import { Avatar } from "./Avatar.tsx";

const meta = {
  title: "Basics/Avatar",
  component: Avatar,
  args: { name: "张伟" },
} satisfies Meta<typeof Avatar>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Initial: Story = {
  play: async ({ canvasElement }) => {
    const avatar = within(canvasElement).getByRole("img", { name: "张伟" });
    await expect(avatar).toHaveTextContent("张");
    await expect(getComputedStyle(avatar).borderRadius).toBe("9999px");
    await expect(getComputedStyle(avatar).backgroundColor).toBe(token("neutral-bg-muted"));
  },
};

export const Self: Story = {
  args: { name: "小明", variant: "self" },
  play: async ({ canvasElement }) => {
    const avatar = within(canvasElement).getByRole("img", { name: "小明（我）" });
    await expect(avatar).toHaveTextContent("我");
    await expect(getComputedStyle(avatar).backgroundColor).toBe(token("neutral-bg-muted"));
  },
};

export const Sizes: Story = {
  render: () => (
    <div className="flex items-center gap-sm">
      <Avatar name="李明" size="sm" />
      <Avatar name="王芳" size="md" />
      <Avatar name="陈静" size="lg" />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const w = (name: string) => canvas.getByRole("img", { name }).getBoundingClientRect().width;
    await expect(w("李明")).toBe(24);
    await expect(w("王芳")).toBe(36);
    await expect(w("陈静")).toBe(56);
  },
};
