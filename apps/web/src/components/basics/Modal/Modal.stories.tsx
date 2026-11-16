import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test";
import { rgb } from "../../../test/color.ts";
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
    await expect(getComputedStyle(dialog).borderRadius).toBe("16px");

    // Cancel left, action right, equal width.
    const [cancel, action] = within(dialog).getAllByRole("button");
    await expect(cancel).toHaveTextContent("取消");
    await expect(action).toHaveTextContent("放弃");
    await expect(cancel.getBoundingClientRect().width).toBe(action.getBoundingClientRect().width);
    await expect(getComputedStyle(action).backgroundColor).toBe(rgb("#4F46E5"));

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
    await expect(getComputedStyle(action).color).toBe(rgb("#C81E1E"));
    await expect(getComputedStyle(action).backgroundColor).toBe(rgb("#FFFFFF"));
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
