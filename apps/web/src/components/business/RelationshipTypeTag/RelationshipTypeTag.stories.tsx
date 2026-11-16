import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { rgb } from "../../../test/color.ts";
import { RelationshipTypeTag } from "./RelationshipTypeTag.tsx";

const meta = {
  title: "Business/RelationshipTypeTag",
  component: RelationshipTypeTag,
  args: { category: "social", subtype: "同事" },
} satisfies Meta<typeof RelationshipTypeTag>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Builtin: Story = {
  play: async ({ canvasElement }) => {
    const tag = canvasElement.querySelector("[data-relationship-type]") as HTMLElement;
    await expect(tag).toHaveTextContent("社会 · 同事");
    const style = getComputedStyle(tag);
    await expect(style.backgroundColor).toBe(rgb("#FFFFFF"));
    await expect(style.borderTopColor).toBe(rgb("#DDE1E8"));
    await expect(style.borderTopLeftRadius).toBe("9999px");
    await expect(within(canvasElement).queryByText("自定义")).toBeNull();
  },
};

/** AC-28 / AC-31: the original wording is kept next to the normalized type. */
export const WithOriginalWording: Story = {
  args: { subtype: "朋友", original: "铁哥们" },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector("[data-relationship-type]")).toHaveTextContent(
      "社会 · 朋友 · “铁哥们”",
    );
  },
};

/** Same wording as the subtype: no duplicate quote. */
export const OriginalSameAsSubtype: Story = {
  args: { subtype: "室友", original: "室友" },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector("[data-relationship-type]")).toHaveTextContent(
      /^社会 · 室友$/,
    );
  },
};

/** AC-32: a custom subtype carries a 自定义 mark. */
export const Custom: Story = {
  args: { subtype: "球友", custom: true },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText("自定义")).toBeVisible();
  },
};
