import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, screen, userEvent, waitFor, within } from "storybook/test";
import { rgb } from "../../../test/color.ts";
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
    await expect(style.borderTopLeftRadius).toBe("16px");
    await expect(style.borderTopRightRadius).toBe("16px");
    await expect(style.borderBottomLeftRadius).toBe("0px");
    await expect(style.backgroundColor).toBe(rgb("#FFFFFF"));
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
    await expect(panel.getBoundingClientRect().width).toBe(360);
    await expect(getComputedStyle(panel).borderLeftColor).toBe(rgb("#EBEEF2"));
    // Anchored to the right edge once the slide-in settles.
    await waitFor(() =>
      expect(Math.round(panel.getBoundingClientRect().right)).toBe(window.innerWidth),
    );
  },
};
