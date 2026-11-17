import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { rgb } from "../../../test/color.ts";
import { Button } from "../Button/Button.tsx";
import { Banner } from "./Banner.tsx";

const meta = {
  title: "Basics/Banner",
  component: Banner,
  args: { children: "今日记录额度已用完，北京时间 0 点重置" },
} satisfies Meta<typeof Banner>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Warning: Story = {
  args: { variant: "warning" },
  play: async ({ canvasElement }) => {
    const banner = within(canvasElement).getByRole("status");
    await expect(banner).toHaveTextContent("今日记录额度已用完，北京时间 0 点重置");
    await expect(getComputedStyle(banner).backgroundColor).toBe(rgb("#FFF7E6"));
    await expect(getComputedStyle(banner).borderRadius).toBe("10px");
  },
};

export const ErrorBanner: Story = {
  name: "Error",
  args: {
    variant: "error",
    children: "网络异常，记录没有发出去",
    action: (
      <Button size="sm" variant="secondary">
        重试
      </Button>
    ),
  },
  play: async ({ canvasElement }) => {
    const banner = within(canvasElement).getByRole("alert");
    await expect(banner).toHaveTextContent("网络异常，记录没有发出去");
    await expect(within(banner).getByRole("button", { name: "重试" })).toBeEnabled();
    await expect(getComputedStyle(banner).color).toBe(rgb("#C81E1E"));
  },
};

export const Info: Story = {
  args: { variant: "info", children: "已省略 12 人，仅显示亲密度最高的 50 人" },
  play: async ({ canvasElement }) => {
    const banner = within(canvasElement).getByRole("status");
    await expect(getComputedStyle(banner).backgroundColor).toBe(rgb("#EFF6FF"));
  },
};
