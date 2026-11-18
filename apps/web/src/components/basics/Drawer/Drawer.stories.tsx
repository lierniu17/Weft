import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, screen, userEvent, waitFor, within } from "storybook/test";
import { motionMs } from "../../../lib/motion.ts";
import { token } from "../../../test/color.ts";
import { canEmulateReducedMotion } from "../../../test/reducedMotion.ts";
import { tokens } from "../../../tokens.gen.ts";
import { Button } from "../Button/Button.tsx";
import { Drawer, type DrawerProps } from "./Drawer.tsx";

function WithTrigger(props: Omit<DrawerProps, "open" | "onOpenChange">) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        查看并确认
      </Button>
      <Drawer {...props} open={open} onOpenChange={setOpen} />
    </>
  );
}

const meta = {
  title: "Basics/Drawer",
  component: Drawer,
  render: (args) => <WithTrigger {...args} />,
  args: {
    open: false,
    onOpenChange: () => {},
    title: "确认草稿",
    description: "今天 · 确认后才会写进图谱",
    children: <p className="text-body-md">张伟 · 喜欢钓鱼</p>,
    footer: (
      <>
        <Button variant="secondary" size="lg" className="flex-1">
          放弃
        </Button>
        <Button size="lg" className="flex-1">
          确认入图谱
        </Button>
      </>
    ),
  },
  parameters: { a11y: { context: "body" } },
} satisfies Meta<typeof Drawer>;

export default meta;
type Story = StoryObj<typeof meta>;

export const BottomSheet: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "查看并确认" }));
    const sheet = await screen.findByRole("dialog", { name: "确认草稿" });
    await expect(sheet).toHaveAccessibleDescription("今天 · 确认后才会写进图谱");
    const style = getComputedStyle(sheet);
    await expect(style.borderTopLeftRadius).toBe(tokens.radius.xl);
    await expect(style.borderTopRightRadius).toBe(tokens.radius.xl);
    await expect(style.borderBottomLeftRadius).toBe("0px");
    await expect(style.backgroundColor).toBe(token("neutral-bg-container"));
    // A floating surface: shadow.lg.
    await expect(style.boxShadow).toContain("rgba(0, 0, 0, 0.1) 0px 12px 32px 0px");
    // Anchored to the bottom of the viewport.
    await waitFor(() =>
      expect(Math.round(sheet.getBoundingClientRect().bottom)).toBe(window.innerHeight),
    );
  },
};

export const FocusTrapAndEsc: Story = {
  name: "Focus trap · Esc closes",
  play: async ({ canvasElement }) => {
    const trigger = within(canvasElement).getByRole("button", { name: "查看并确认" });
    await userEvent.click(trigger);
    const sheet = await screen.findByRole("dialog", { name: "确认草稿" });

    await waitFor(() => expect(sheet).toContainElement(document.activeElement as HTMLElement));
    // Tab through every control and wrap: focus never leaves the sheet.
    for (let i = 0; i < 5; i++) {
      await userEvent.tab();
      await expect(sheet).toContainElement(document.activeElement as HTMLElement);
    }

    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(trigger).toHaveFocus());
  },
};

export const CloseButton: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "查看并确认" }));
    const sheet = await screen.findByRole("dialog");
    await userEvent.click(within(sheet).getByRole("button", { name: "关闭" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  },
};

export const SidePanel: Story = {
  args: { variant: "side-panel", title: "出处" },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "查看并确认" }));
    const panel = await screen.findByRole("dialog", { name: "出处" });
    // DESIGN.md: the right column is 380px.
    await expect(panel.getBoundingClientRect().width).toBe(380);
    await expect(getComputedStyle(panel).borderLeftColor).toBe(token("neutral-divider"));
    // Anchored to the right edge once the slide-in settles.
    await waitFor(() =>
      expect(Math.round(panel.getBoundingClientRect().right)).toBe(window.innerWidth),
    );
  },
};

/**
 * Desktop right column (wireframe D1/D2): `modal={false}` renders the panel in the page
 * flow — no mask, the rest of the page stays interactive. Focus moves in on open, Esc and
 * ✕ close it, focus returns to the trigger.
 */
function Inline(props: Omit<DrawerProps, "open" | "onOpenChange">) {
  const [open, setOpen] = useState(false);
  const [clicks, setClicks] = useState(0);
  return (
    <div className="flex h-[600px] w-[1000px] border border-neutral-divider">
      <div className="flex flex-1 flex-col items-start gap-sm p-md">
        <Button variant="secondary" onClick={() => setOpen(true)}>
          查看并确认
        </Button>
        <Button variant="secondary" onClick={() => setClicks((c) => c + 1)}>
          对话里的按钮 {clicks}
        </Button>
        <textarea aria-label="对话输入" className="border border-neutral-border" />
      </div>
      <Drawer {...props} open={open} onOpenChange={setOpen} />
    </div>
  );
}

export const NonModalSidePanel: Story = {
  name: "Side panel · non-modal (desktop column)",
  args: { variant: "side-panel", modal: false },
  render: (args) => <Inline {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("button", { name: "查看并确认" });
    await userEvent.click(trigger);
    const panel = await canvas.findByRole("dialog", { name: "确认草稿" });
    // In the page flow, not portalled; a dialog that does not block the page.
    await expect(canvasElement).toContainElement(panel);
    await expect(panel).not.toHaveAttribute("aria-modal", "true");
    await expect(panel.getBoundingClientRect().width).toBe(380);
    await expect(getComputedStyle(panel).borderLeftColor).toBe(token("neutral-divider"));
    await expect(getComputedStyle(panel).position).not.toBe("fixed");
    await expect(getComputedStyle(panel).boxShadow).not.toContain("12px 32px");
    // No mask; focus moved into the panel.
    await expect(document.querySelector("[data-drawer-mask]")).toBeNull();
    await waitFor(() => expect(panel).toContainElement(document.activeElement as HTMLElement));

    // The page beside it stays interactive; the panel stays open.
    await userEvent.click(canvas.getByRole("button", { name: /对话里的按钮/ }));
    await expect(canvas.getByRole("button", { name: "对话里的按钮 1" })).toBeVisible();
    await expect(panel).toBeVisible();

    // Esc (from inside the panel) closes it and focus returns to the trigger.
    await userEvent.click(within(panel).getByRole("button", { name: "关闭" }));
    await waitFor(() => expect(canvas.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(trigger).toHaveFocus());

    await userEvent.click(trigger);
    const again = await canvas.findByRole("dialog", { name: "确认草稿" });
    await waitFor(() => expect(again).toContainElement(document.activeElement as HTMLElement));
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(canvas.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(trigger).toHaveFocus());
  },
};

/**
 * Non-modal: Esc belongs to whatever has focus. Pressed in the page beside the panel (e.g.
 * the chat composer) it leaves the panel open; pressed inside the panel it closes it.
 */
export const NonModalEscOnlyInside: Story = {
  name: "Side panel · non-modal · Esc only closes from inside",
  args: { variant: "side-panel", modal: false },
  render: (args) => <Inline {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("button", { name: "查看并确认" });
    await userEvent.click(trigger);
    const panel = await canvas.findByRole("dialog", { name: "确认草稿" });
    await waitFor(() => expect(panel).toContainElement(document.activeElement as HTMLElement));

    // Esc in the composer beside the panel: the panel stays open, focus and text stay put.
    const composer = canvas.getByRole("textbox", { name: "对话输入" });
    await userEvent.click(composer);
    await userEvent.type(composer, "还在写");
    await userEvent.keyboard("{Escape}");
    await new Promise((r) => setTimeout(r, 100));
    await expect(canvas.getByRole("dialog", { name: "确认草稿" })).toBeVisible();
    await expect(composer).toHaveFocus();
    await expect(composer).toHaveValue("还在写");

    // Esc with nothing focused (the page body): still open.
    composer.blur();
    await userEvent.keyboard("{Escape}");
    await new Promise((r) => setTimeout(r, 100));
    await expect(canvas.getByRole("dialog", { name: "确认草稿" })).toBeVisible();

    // Esc from a control inside the panel closes it.
    within(panel).getByRole("button", { name: "放弃" }).focus();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(canvas.queryByRole("dialog")).toBeNull());
  },
};

/** Modal panels (tablet drawer, mobile sheet) keep closing on Esc. */
export const ModalSidePanelEsc: Story = {
  name: "Side panel · modal · Esc closes",
  args: { variant: "side-panel" },
  play: async ({ canvasElement }) => {
    const trigger = within(canvasElement).getByRole("button", { name: "查看并确认" });
    await userEvent.click(trigger);
    const panel = await screen.findByRole("dialog", { name: "确认草稿" });
    await expect(document.querySelector("[data-drawer-mask]")).not.toBeNull();
    await waitFor(() => expect(panel).toContainElement(document.activeElement as HTMLElement));
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(trigger).toHaveFocus());
  },
};

/** The wide right column (560px) holds the panorama beside the chat (graph-viz AC-17). */
export const NonModalWide: Story = {
  name: "Side panel · non-modal, wide",
  args: { variant: "side-panel", modal: false, width: "wide" },
  render: (args) => <Inline {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "查看并确认" }));
    const panel = await canvas.findByRole("dialog", { name: "确认草稿" });
    await expect(panel.getBoundingClientRect().width).toBe(560);
  },
};

/** The focus ring as computed: 2px solid ink, 2px away (AC-6). */
const ringOf = (el: Element) => {
  const s = getComputedStyle(el);
  return s.outlineStyle === "none"
    ? "none"
    : `${s.outlineWidth} ${s.outlineStyle} ${s.outlineColor} +${s.outlineOffset}`;
};
const RING = `2px solid ${token("primary-6")} +2px`;

/** AC-6: opened with a pointer, the ✕ that receives focus shows no ring. */
export const PointerOpenNoFocusRing: Story = {
  name: "Focus ring · pointer open shows none (AC-6)",
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "查看并确认" }));
    const sheet = await screen.findByRole("dialog", { name: "确认草稿" });
    const close = within(sheet).getByRole("button", { name: "关闭" });
    await waitFor(() => expect(close).toHaveFocus());
    await expect(close).toHaveFocus();
    await expect(ringOf(close)).toBe("none");

    // Switching to the keyboard brings the ring back on the next stop.
    await userEvent.tab();
    await expect(ringOf(document.activeElement as Element)).toBe(RING);
  },
};

/** AC-6: opened from the keyboard, the focused ✕ shows the ink ring. */
export const KeyboardOpenShowsFocusRing: Story = {
  name: "Focus ring · keyboard open shows it (AC-6)",
  play: async ({ canvasElement }) => {
    const trigger = within(canvasElement).getByRole("button", { name: "查看并确认" });
    await userEvent.tab();
    await expect(trigger).toHaveFocus();
    await expect(ringOf(trigger)).toBe(RING);
    await userEvent.keyboard("{Enter}");
    const sheet = await screen.findByRole("dialog", { name: "确认草稿" });
    const close = within(sheet).getByRole("button", { name: "关闭" });
    await waitFor(() => expect(close).toHaveFocus());
    await expect(ringOf(close)).toBe(RING);
  },
};

const anim = (el: Element) => {
  const s = getComputedStyle(el);
  return {
    name: s.animationName,
    duration: s.animationDuration,
    easing: s.animationTimingFunction,
  };
};
const sec = (ms: number) => `${ms / 1000}s`;
const m = tokens.motion;

/** AC-13: in over 250ms decelerate, out over 200ms accelerate; the scrim fades both ways. */
export const SheetMotion: Story = {
  name: "Motion · bottom sheet (AC-13)",
  parameters: { motion: true },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "查看并确认" }));
    const sheet = await screen.findByRole("dialog", { name: "确认草稿" });
    const mask = document.querySelector("[data-drawer-mask]") as HTMLElement;
    await expect(anim(sheet)).toEqual({
      name: "sheet-in",
      duration: sec(motionMs("sheet")),
      easing: m["easing-decelerate"],
    });
    await expect(anim(mask)).toEqual({
      name: "fade-in",
      duration: sec(motionMs("sheet")),
      easing: m["easing-standard"],
    });

    await userEvent.click(within(sheet).getByRole("button", { name: "关闭" }));
    // Still mounted while it slides out.
    await expect(sheet).toHaveAttribute("data-state", "closed");
    await expect(anim(sheet)).toEqual({
      name: "sheet-out",
      duration: sec(motionMs("sheet-exit")),
      easing: m["easing-accelerate"],
    });
    await expect(anim(mask).name).toBe("fade-out");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  },
};

export const PanelMotion: Story = {
  name: "Motion · side panel (AC-13)",
  args: { variant: "side-panel" },
  parameters: { motion: true },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "查看并确认" }));
    const panel = await screen.findByRole("dialog", { name: "确认草稿" });
    await expect(anim(panel)).toEqual({
      name: "panel-in",
      duration: sec(motionMs("sheet")),
      easing: m["easing-decelerate"],
    });
    await userEvent.click(within(panel).getByRole("button", { name: "关闭" }));
    await expect(anim(panel)).toEqual({
      name: "panel-out",
      duration: sec(motionMs("sheet-exit")),
      easing: m["easing-accelerate"],
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  },
};

/** AC-16: with 「减少动态效果」 the sheet and scrim switch directly, in and out. */
export const ReducedMotion: Story = {
  name: "Motion · reduced (AC-16)",
  parameters: { motion: true, reducedMotion: true },
  play: async ({ canvasElement }) => {
    if (!canEmulateReducedMotion()) return;
    await userEvent.click(within(canvasElement).getByRole("button", { name: "查看并确认" }));
    const sheet = await screen.findByRole("dialog", { name: "确认草稿" });
    await expect(anim(sheet).name).toBe("none");
    await expect(anim(document.querySelector("[data-drawer-mask]") as Element).name).toBe("none");
    await expect(document.getAnimations()).toEqual([]);
    await userEvent.click(within(sheet).getByRole("button", { name: "关闭" }));
    // Gone at once: nothing left to animate out.
    await expect(screen.queryByRole("dialog")).toBeNull();
  },
};
