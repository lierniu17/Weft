import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test";
import type { Confidence } from "../../../contracts/draft.ts";
import { type ColorToken, TRANSPARENT, token } from "../../../test/color.ts";
import { ConfidenceBadge } from "./ConfidenceBadge.tsx";

const meta = {
  title: "Business/ConfidenceBadge",
  component: ConfidenceBadge,
  args: { level: "witnessed" },
} satisfies Meta<typeof ConfidenceBadge>;

export default meta;
type Story = StoryObj<typeof meta>;

const LOOKS: [Confidence, string, ColorToken][] = [
  ["witnessed", "亲历", "neutral-text-tertiary"],
  ["self_told", "本人说", "neutral-text-tertiary"],
  ["hearsay", "转述", "status-warning-6"],
  ["inferred", "推测", "neutral-text-tertiary"],
];

/**
 * Style refresh AC-3: four levels, each with its full text, as trailing grey meta text
 * (no fill); 转述 in warning text; 推测 grey with a dashed outline. Contrast is checked by axe.
 */
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
    for (const [, label, text] of LOOKS) {
      const badge = canvas.getByText(label).closest("[data-confidence]") as HTMLElement;
      const style = getComputedStyle(badge);
      await expect(style.backgroundColor).toBe(TRANSPARENT);
      await expect(style.color).toBe(token(text));
      await expect(style.fontSize).toBe("13px");
      await expect(style.borderTopLeftRadius).toBe("9999px");
      // Never truncated to a colour swatch.
      await expect(badge.scrollWidth).toBeLessThanOrEqual(badge.clientWidth + 1);
      await expect(badge).toHaveAccessibleName(`可信度：${label}`);
    }
    const inferred = canvas.getByText("推测").closest("[data-confidence]") as HTMLElement;
    await expect(getComputedStyle(inferred).borderTopStyle).toBe("dashed");
    await expect(getComputedStyle(inferred).borderTopColor).toBe(token("neutral-border"));
    const witnessed = canvas.getByText("亲历").closest("[data-confidence]") as HTMLElement;
    await expect(getComputedStyle(witnessed).borderTopColor).toBe(TRANSPARENT);
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
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
  },
};

/**
 * Style refresh AC-8: the sentence layout of draft lines — 「张伟喜欢钓鱼 · 本人说」, the level
 * as trailing meta grey after the sentence; with `onChange` the whole line is the button.
 */
export const SentenceLine: Story = {
  args: { level: "self_told", sentence: "张伟喜欢钓鱼", onChange: fn() },
  parameters: { a11y: { context: "body" } },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const row = canvas.getByRole("button", { name: "张伟喜欢钓鱼 · 本人说（可信度，点按修改）" });
    await expect(row).toHaveTextContent(/^张伟喜欢钓鱼 · /);
    const level = row.querySelector("[data-confidence]") as HTMLElement;
    await expect(getComputedStyle(level).color).toBe(token("neutral-text-tertiary"));
    await expect(getComputedStyle(level).fontSize).toBe("13px");
    await expect(getComputedStyle(row).backgroundColor).toBe(TRANSPARENT);
    await userEvent.click(within(row).getByText("张伟喜欢钓鱼")); // tapping the sentence opens it
    const menu = await screen.findByRole("menu");
    await userEvent.click(within(menu).getByRole("menuitemradio", { name: "转述" }));
    await expect(args.onChange).toHaveBeenCalledWith("hearsay");
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
  },
};

/** DESIGN.md: the four-level menu fades out (motion.exit) instead of vanishing. */
export const MenuExit: Story = {
  args: { level: "self_told", onChange: fn() },
  parameters: { a11y: { context: "body" }, motion: true },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button"));
    const menu = await screen.findByRole("menu");
    await expect(getComputedStyle(menu).animationName).toBe("fade-in");
    await userEvent.keyboard("{Escape}");
    await expect(menu).toHaveAttribute("data-state", "closed");
    await expect(getComputedStyle(menu).animationName).toBe("fade-out");
    await expect(getComputedStyle(menu).animationDuration).toBe("0.15s"); // motion.exit
    // Unmounted when the fade ends (Storybook's test runner may hold animations; end it here).
    for (const a of menu.getAnimations()) a.finish();
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
  },
};
