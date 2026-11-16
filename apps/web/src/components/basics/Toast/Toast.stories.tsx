import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, screen, userEvent, waitFor, within } from "storybook/test";
import { Button } from "../Button/Button.tsx";
import { Toast, type ToastVariant } from "./Toast.tsx";

function Demo({
  variant,
  message,
  duration,
}: {
  variant: ToastVariant;
  message: string;
  duration?: number;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        触发
      </Button>
      <Toast open={open} onOpenChange={setOpen} variant={variant} duration={duration}>
        {message}
      </Toast>
    </>
  );
}

const meta = {
  title: "Basics/Toast",
  component: Toast,
  args: { open: true, onOpenChange: () => {}, children: "已复制" },
} satisfies Meta<typeof Toast>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Info: Story = {
  args: { variant: "info", children: "已复制" },
  play: async () => {
    await expect(await screen.findByRole("status")).toHaveTextContent("已复制");
  },
};

export const Success: Story = {
  args: { variant: "success", children: "已删除" },
  play: async () => {
    await expect(await screen.findByRole("status")).toHaveTextContent("已删除");
  },
};

export const ErrorToast: Story = {
  name: "Error",
  args: { variant: "error", children: "删除失败，请重试" },
  play: async () => {
    await expect(await screen.findByRole("alert")).toHaveTextContent("删除失败，请重试");
  },
};

export const AutoDismiss: Story = {
  // Shortened from the 2s default so the run stays fast; the behaviour is the same.
  render: () => <Demo variant="success" message="已删除" duration={300} />,
  play: async ({ canvasElement }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "触发" }));
    await expect(await screen.findByRole("status")).toHaveTextContent("已删除");
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull(), { timeout: 2000 });
  },
};
