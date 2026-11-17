import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test";
import type { Confidence } from "../../../contracts/draft.ts";
import { rgb } from "../../../test/color.ts";
import { ConfidenceBadge } from "./ConfidenceBadge.tsx";

const meta = {
  title: "Business/ConfidenceBadge",
  component: ConfidenceBadge,
  args: { level: "witnessed" },
} satisfies Meta<typeof ConfidenceBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

const LOOKS: [Confidence, string, string, string][] = [
  ["witnessed", "亲历", "#EEF2FF", "#4338CA"],
  ["self_told", "本人说", "#E6F6F4", "#08635A"],
  ["hearsay", "转述", "#FFF7E6", "#B45309"],
  ["inferred", "推测", "#F5F6F8", "#5B6475"],
];

/** AC-UI-5: four looks, colour AND full text; 推测 additionally has a dashed border. */
export const FourLevels: Story = {
  render: () => (
    <div className="flex gap-sm">
      {LOOKS.map(([level]) => (
        <ConfidenceBadge key={level} level={level} />
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    for (const [, label, bg, text] of LOOKS) {
      const badge = canvas.getByText(label).closest("[data-confidence]") as HTMLElement;
      const style = getComputedStyle(badge);
      await expect(style.backgroundColor).toBe(rgb(bg));
      await expect(style.color).toBe(rgb(text));
      await expect(style.borderTopLeftRadius).toBe("9999px");
      // Never truncated to a colour swatch.
      await expect(badge.scrollWidth).toBeLessThanOrEqual(badge.clientWidth + 1);
      await expect(badge).toHaveAccessibleName(`可信度：${label}`);
    }
    const inferred = canvas.getByText("推测").closest("[data-confidence]") as HTMLElement;
    await expect(getComputedStyle(inferred).borderTopStyle).toBe("dashed");
    await expect(getComputedStyle(inferred).borderTopColor).toBe(rgb("#DDE1E8"));
    const witnessed = canvas.getByText("亲历").closest("[data-confidence]") as HTMLElement;
    await expect(getComputedStyle(witnessed).borderTopStyle).not.toBe("dashed");
  },
};

/** 转述 with who said it, as in the CitationSheet: 「转述 · 据老张说」. */
export const WithSource: Story = {
  args: { level: "hearsay", toldBy: "老张" },
  play: async ({ canvasElement }) => {
    await expect(within(canvasElement).getByText("转述 · 据老张说")).toBeVisible();
  },
};

function Editable() {
  const [level, setLevel] = useState<Confidence>("self_told");
  return <ConfidenceBadge level={level} onChange={setLevel} />;
}

/** In a draft the badge is pickable (US-18, AC-11): a menu with the four levels. */
export const Pickable: Story = {
  render: () => <Editable />,
  parameters: { a11y: { context: "body" } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("button", { name: "可信度：本人说，点按修改" });
    await userEvent.click(trigger);
    const menu = await screen.findByRole("menu");
    const options = within(menu).getAllByRole("menuitemradio");
    await expect(options.map((o) => o.textContent)).toEqual(["亲历", "本人说", "转述", "推测"]);
    await expect(within(menu).getByRole("menuitemradio", { name: "本人说" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await userEvent.click(within(menu).getByRole("menuitemradio", { name: "亲历" }));
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
    await expect(canvas.getByRole("button", { name: "可信度：亲历，点按修改" })).toBeVisible();
  },
};

export const PickableByKeyboard: Story = {
  args: { level: "hearsay", onChange: fn() },
  parameters: { a11y: { context: "body" } },
  play: async ({ canvasElement, args }) => {
    within(canvasElement).getByRole("button").focus();
    await userEvent.keyboard("{Enter}");
    await screen.findByRole("menu");
    await userEvent.keyboard("{ArrowDown}{ArrowDown}{ArrowDown}{Enter}");
    await waitFor(() => expect(args.onChange).toHaveBeenCalled());
  },
};
