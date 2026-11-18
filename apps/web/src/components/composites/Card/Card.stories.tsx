import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";
import { token } from "../../../test/color.ts";
import { Card } from "./Card.tsx";

const meta = {
  title: "Composites/Card",
  component: Card,
  args: { children: <p className="text-body-md">他们是大学室友。</p> },
} satisfies Meta<typeof Card>;

export default meta;
type Story = StoryObj<typeof meta>;

const card = (root: HTMLElement) => root.querySelector("[data-card]") as HTMLElement;

/** AC-UI-4: card #FFFFFF, radius 10px, padding 16px. */
export const Outlined: Story = {
  play: async ({ canvasElement }) => {
    const style = getComputedStyle(card(canvasElement));
    await expect(style.backgroundColor).toBe(token("neutral-bg-container"));
    await expect(style.borderTopLeftRadius).toBe("12px");
    await expect(style.paddingTop).toBe("16px");
    await expect(style.borderTopColor).toBe(token("neutral-divider"));
  },
};

export const Plain: Story = {
  args: { variant: "plain" },
  play: async ({ canvasElement }) => {
    const style = getComputedStyle(card(canvasElement));
    await expect(style.borderTopColor).toBe("rgba(0, 0, 0, 0)");
    await expect(style.boxShadow).toBe("none");
  },
};

export const Highlighted: Story = {
  args: { variant: "highlighted" },
  play: async ({ canvasElement }) => {
    await expect(getComputedStyle(card(canvasElement)).borderTopColor).toBe(token("primary-6"));
  },
};
