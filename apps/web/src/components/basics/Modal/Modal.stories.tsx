import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test";
import { motionMs } from "../../../lib/motion.ts";
import { token } from "../../../test/color.ts";
import { canEmulateReducedMotion } from "../../../test/reducedMotion.ts";
import { tokens } from "../../../tokens.gen.ts";
import { Button } from "../Button/Button.tsx";
import { Modal, type ModalProps } from "./Modal.tsx";

function WithTrigger(props: Omit<ModalProps, "open" | "onOpenChange">) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        打开
      </Button>
      <Modal
        {...props}
        open={open}
        onOpenChange={setOpen}
        onAction={() => {
          props.onAction();
          setOpen(false);
        }}
      />
    </>
  );
}

const meta = {
  title: "Basics/Modal",
  component: Modal,
  render: (args) => <WithTrigger {...args} />,
  args: {
    open: false,
    onOpenChange: () => {},
    title: "放弃这份草稿？",
    description: "放弃后，这条记录不会写进图谱，原文会保留。",
    actionText: "放弃",
    onAction: fn(),
  },
  parameters: { a11y: { context: "body" } },
} satisfies Meta<typeof Modal>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Confirm: Story = {
  play: async ({ canvasElement, args }) => {
    const trigger = within(canvasElement).getByRole("button", { name: "打开" });
    await userEvent.click(trigger);

    const dialog = await screen.findByRole("alertdialog", { name: "放弃这份草稿？" });
    await expect(dialog).toHaveAccessibleDescription("放弃后，这条记录不会写进图谱，原文会保留。");
    await expect(getComputedStyle(dialog).borderRadius).toBe(tokens.radius.lg);
    await expect(getComputedStyle(dialog).boxShadow).toContain(
      "rgba(0, 0, 0, 0.1) 0px 12px 32px 0px",
    );

    // Cancel left, action right, equal width.
    const [cancel, action] = within(dialog).getAllByRole("button");
    await expect(cancel).toHaveTextContent("取消");
    await expect(action).toHaveTextContent("放弃");
    await expect(cancel.getBoundingClientRect().width).toBeCloseTo(
      action.getBoundingClientRect().width,
      2,
    );
    await expect(getComputedStyle(action).backgroundColor).toBe(token("primary-6"));

    await userEvent.click(action);
    await expect(args.onAction).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  },
};

export const Danger: Story = {
  args: {
    variant: "danger",
    title: "删除张伟？",
    description: "有 3 条记录提到他，原文会保留。",
    actionText: "删除",
  },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "打开" }));
    const dialog = await screen.findByRole("alertdialog", { name: "删除张伟？" });
    const action = within(dialog).getByRole("button", { name: "删除" });
    // Outlined red, not a solid primary (AC-UI-6).
    await expect(getComputedStyle(action).color).toBe(token("status-error-6"));
    await expect(getComputedStyle(action).backgroundColor).toBe(token("neutral-bg-container"));
  },
};

export const FocusTrapAndEsc: Story = {
  name: "Focus trap · Esc closes",
  play: async ({ canvasElement, args }) => {
    const trigger = within(canvasElement).getByRole("button", { name: "打开" });
    await userEvent.click(trigger);
    const dialog = await screen.findByRole("alertdialog");

    // Safe default: focus lands on 取消, and Tab cycles inside the dialog.
    await waitFor(() => expect(within(dialog).getByRole("button", { name: "取消" })).toHaveFocus());
    await userEvent.tab();
    await expect(within(dialog).getByRole("button", { name: "放弃" })).toHaveFocus();
    await userEvent.tab();
    await expect(dialog).toContainElement(document.activeElement as HTMLElement);

    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    await expect(args.onAction).not.toHaveBeenCalled();
    // Focus returns to what opened it.
    await waitFor(() => expect(trigger).toHaveFocus());
  },
};

const ringOf = (el: Element) => getComputedStyle(el).outlineStyle;

/** AC-6: opened with a pointer, the focused 取消 shows no ring; from the keyboard it does. */
export const FocusRingPointerVsKeyboard: Story = {
  name: "Focus ring · pointer vs keyboard (AC-6)",
  play: async ({ canvasElement }) => {
    const trigger = within(canvasElement).getByRole("button", { name: "打开" });
    await userEvent.click(trigger);
    let dialog = await screen.findByRole("alertdialog");
    let cancel = within(dialog).getByRole("button", { name: "取消" });
    await waitFor(() => expect(cancel).toHaveFocus());
    await expect(ringOf(cancel)).toBe("none");
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());

    await waitFor(() => expect(trigger).toHaveFocus());
    await userEvent.keyboard("{Enter}");
    dialog = await screen.findByRole("alertdialog");
    cancel = within(dialog).getByRole("button", { name: "取消" });
    await waitFor(() => expect(cancel).toHaveFocus());
    const s = getComputedStyle(cancel);
    await expect([s.outlineStyle, s.outlineWidth, s.outlineColor, s.outlineOffset]).toEqual([
      "solid",
      "2px",
      token("primary-6"),
      "2px",
    ]);
  },
};

/** AC-13: the modal scales 0.98 → 1 while fading in; the scrim fades. */
export const Motion: Story = {
  name: "Motion · scale + fade (AC-13)",
  parameters: { motion: true },
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "打开" }));
    const dialog = await screen.findByRole("alertdialog");
    const s = getComputedStyle(dialog);
    await expect([s.animationName, s.animationDuration, s.animationTimingFunction]).toEqual([
      "modal-in",
      `${motionMs("sheet") / 1000}s`,
      tokens.motion["easing-decelerate"],
    ]);
    const keyframes = [...document.styleSheets]
      .flatMap((sheet) => [...sheet.cssRules])
      .flatMap((r) => ("cssRules" in r ? [r, ...(r as CSSGroupingRule).cssRules] : [r]))
      .find((r) => r instanceof CSSKeyframesRule && r.name === "modal-in") as CSSKeyframesRule;
    await expect(keyframes.cssText).toContain("scale(var(--motion-press-scale))");
    await expect(keyframes.cssText).toContain("opacity: 0");
    await expect(tokens.motion["press-scale"]).toBe("0.98");

    await userEvent.keyboard("{Escape}");
    await expect(getComputedStyle(dialog).animationName).toBe("modal-out");
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  },
};

export const ReducedMotion: Story = {
  name: "Motion · reduced (AC-16)",
  parameters: { motion: true, reducedMotion: true },
  play: async ({ canvasElement }) => {
    if (!canEmulateReducedMotion()) return;
    await userEvent.click(within(canvasElement).getByRole("button", { name: "打开" }));
    const dialog = await screen.findByRole("alertdialog");
    await expect(getComputedStyle(dialog).animationName).toBe("none");
    await expect(document.getAnimations()).toEqual([]);
  },
};
