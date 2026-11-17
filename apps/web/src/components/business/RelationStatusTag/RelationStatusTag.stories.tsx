import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";
import type { RelationshipStatus } from "../../../contracts/draft.ts";
import { rgb } from "../../../test/color.ts";
import { RelationStatusTag } from "./RelationStatusTag.tsx";

const meta = {
  title: "Business/RelationStatusTag",
  component: RelationStatusTag,
  args: { status: "active" },
} satisfies Meta<typeof RelationStatusTag>;

export default meta;
type Story = StoryObj<typeof meta>;

const tag = (root: HTMLElement) => root.querySelector("[data-status]") as HTMLElement;

const check =
  (label: string, bg: string, text: string, dashed = false) =>
  async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const el = tag(canvasElement);
    await expect(el).toHaveTextContent(label);
    const style = getComputedStyle(el);
    await expect(style.backgroundColor).toBe(rgb(bg));
    await expect(style.color).toBe(rgb(text));
    await expect(style.borderTopStyle).toBe(dashed ? "dashed" : "solid");
  };

const story = (status: RelationshipStatus, play: Story["play"]): Story => ({
  args: { status },
  play,
});

export const Active = story("active", check("活跃", "#ECFDF3", "#15803D"));
export const Distant = story("distant", check("疏远", "#F5F6F8", "#5B6475"));
export const Tense = story("tense", check("紧张", "#FEF2F2", "#C81E1E"));
/** 断联: grey with a dashed border, so it differs from 疏远 without colour. */
export const Lost = story("estranged", check("断联", "#F5F6F8", "#5B6475", true));
