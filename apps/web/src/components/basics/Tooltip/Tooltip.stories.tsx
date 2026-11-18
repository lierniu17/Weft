import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, screen, userEvent, waitFor, within } from "storybook/test";
import { token } from "../../../test/color.ts";
import { Tooltip } from "./Tooltip.tsx";

const meta = {
  title: "Basics/Tooltip",
  component: Tooltip,
  args: {
    content: "北京字节跳动网络技术有限公司",
    delayDuration: 0,
    children: (
      <button type="button" className="focus-ring w-[96px] truncate text-left text-body-sm">
        北京字节跳动网络技术有限公司
      </button>
    ),
  },
  parameters: { a11y: { context: "body" } },
} satisfies Meta<typeof Tooltip>;

export default meta;
type Story = StoryObj<typeof meta>;

export const OnHover: Story = {
  play: async ({ canvasElement }) => {
    const trigger = within(canvasElement).getByRole("button");
    await userEvent.hover(trigger);
    const tip = await screen.findByRole("tooltip");
    await expect(tip).toHaveTextContent("北京字节跳动网络技术有限公司");
    await expect(trigger).toHaveAccessibleDescription("北京字节跳动网络技术有限公司");
  },
};

export const OnFocusEscCloses: Story = {
  name: "On focus · Esc closes",
  play: async ({ canvasElement }) => {
    await userEvent.tab();
    await expect(within(canvasElement).getByRole("button")).toHaveFocus();
    const tip = await screen.findByRole("tooltip");
    // Inverted surface: text-primary background, container-coloured text.
    // The visible bubble is the tooltip element itself or its styled parent.
    const bubble = tip.closest(".rounded-sm") as HTMLElement;
    await expect(getComputedStyle(bubble).backgroundColor).toBe(token("neutral-text-primary"));
    await expect(getComputedStyle(bubble).borderRadius).toBe("8px");

    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("tooltip")).toBeNull());
  },
};

export const CitationSummary: Story = {
  args: {
    content: "「今天和老张吃饭，他说跟小李闹掰了」· 转述 · 11-16",
    children: (
      <button type="button" className="focus-ring rounded-sm px-xs text-caption text-primary-6">
        [1]
      </button>
    ),
  },
};
