import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect } from "storybook/test";
import type { RelationshipStatus } from "../../../contracts/draft.ts";
import { type ColorToken, TRANSPARENT, token } from "../../../test/color.ts";
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
  (label: string, bg: ColorToken | null, text: ColorToken, dashed = false) =>
  async ({ canvasElement }: { canvasElement: HTMLElement }) => {
    const el = tag(canvasElement);
    await expect(el).toHaveTextContent(label);
    const style = getComputedStyle(el);
    await expect(style.backgroundColor).toBe(bg ? token(bg) : TRANSPARENT);
    await expect(style.color).toBe(token(text));
    if (dashed) {
      await expect(style.borderTopStyle).toBe("dashed");
      await expect(style.borderTopColor).toBe(token("neutral-border"));
    } else {
      // AC-3: tags carry no outline.
      await expect(style.borderTopColor).toBe(TRANSPARENT);
    }
  };

const story = (status: RelationshipStatus, play: Story["play"]): Story => ({
  args: { status },
  play,
});

export const Active = story("active", check("活跃", "status-success-1", "status-success-6"));
export const Distant = story(
  "distant",
  check("疏远", "neutral-bg-muted", "neutral-text-secondary"),
);
export const Tense = story("tense", check("紧张", "status-error-1", "status-error-6"));
/** 断联: grey with a dashed border, so it differs from 疏远 without colour. */
export const Lost = story("estranged", check("断联", null, "neutral-text-secondary", true));
