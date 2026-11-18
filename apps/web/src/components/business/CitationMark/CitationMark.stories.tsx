import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, screen, userEvent, within } from "storybook/test";
import { token } from "../../../test/color.ts";
import { CitationMark } from "./CitationMark.tsx";

const meta = {
  title: "Business/CitationMark",
  component: CitationMark,
  args: { index: 2, summary: "「今天和老张吃饭，他说他跟小李闹掰了」· 转述 · 11-16", onOpen: fn() },
  render: (args) => (
    <p className="text-body-md">
      去年因为借钱的事闹掰了
      <CitationMark {...args} />
    </p>
  ),
  parameters: { a11y: { context: "body" } },
} satisfies Meta<typeof CitationMark>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Style refresh AC-7: the 出处 mark is a small bg-muted square with its number, neutral grey. */
export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const mark = within(canvasElement).getByRole("button", { name: "出处 2" });
    await expect(mark).toHaveTextContent(/^2$/);
    const style = getComputedStyle(mark);
    await expect(style.backgroundColor).toBe(token("neutral-bg-muted"));
    await expect(style.color).toBe(token("neutral-text-secondary"));
    await expect(style.fontSize).toBe("12px");
    await expect(style.height).toBe("18px");
    await expect(style.borderTopLeftRadius).toBe("6px");
    await userEvent.click(mark);
    await expect(args.onOpen).toHaveBeenCalledWith(2);
  },
};

/** Hover shows the summary in a Tooltip. */
export const HoverSummary: Story = {
  play: async ({ canvasElement }) => {
    await userEvent.hover(within(canvasElement).getByRole("button", { name: "出处 2" }));
    await expect(await screen.findByRole("tooltip")).toHaveTextContent("闹掰了」· 转述");
  },
};

export const Keyboard: Story = {
  play: async ({ canvasElement, args }) => {
    within(canvasElement).getByRole("button", { name: "出处 2" }).focus();
    await userEvent.keyboard("{Enter}");
    await expect(args.onOpen).toHaveBeenCalledWith(2);
  },
};
