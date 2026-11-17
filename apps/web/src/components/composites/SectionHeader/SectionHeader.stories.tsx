import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { rgb } from "../../../test/color.ts";
import { Button } from "../../basics/Button/Button.tsx";
import { SectionHeader } from "./SectionHeader.tsx";

const meta = {
  title: "Composites/SectionHeader",
  component: SectionHeader,
  args: { title: "至交", count: 2 },
} satisfies Meta<typeof SectionHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

export const WithCount: Story = {
  play: async ({ canvasElement }) => {
    const heading = within(canvasElement).getByRole("heading", { level: 2, name: "至交 · 2" });
    const style = getComputedStyle(heading);
    await expect(style.fontSize).toBe("12px");
    await expect(style.color).toBe(rgb("#5B6475"));
  },
};

const onAction = fn();

export const WithAction: Story = {
  args: {
    title: "社会角色",
    count: undefined,
    level: 3,
    action: (
      <Button variant="ghost" size="sm" onClick={onAction}>
        编辑
      </Button>
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("heading", { level: 3, name: "社会角色" })).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "编辑" }));
    await expect(onAction).toHaveBeenCalled();
  },
};
