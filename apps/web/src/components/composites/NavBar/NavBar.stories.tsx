import type { Meta, StoryObj } from "@storybook/react-vite";
import { FiMoreHorizontal } from "react-icons/fi";
import { expect, fn, screen, userEvent, within } from "storybook/test";
import { token } from "../../../test/color.ts";
import { Button } from "../../basics/Button/Button.tsx";
import { IconButton } from "../../basics/IconButton/IconButton.tsx";
import { NavBar } from "./NavBar.tsx";

const meta = {
  title: "Composites/NavBar",
  component: NavBar,
  args: { title: "Weft" },
  decorators: [
    (Story) => (
      <div className="w-[375px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof NavBar>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Root screen: no back button; 「记录」 text action on the right (AC-UI-1). */
export const Root: Story = {
  args: {
    actions: (
      <Button variant="ghost" size="sm">
        记录
      </Button>
    ),
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const bar = canvas.getByRole("banner");
    // 52px on the white page, no rule underneath.
    await expect(bar.getBoundingClientRect().height).toBe(52);
    await expect(getComputedStyle(bar).backgroundColor).toBe(token("neutral-bg-layout"));
    await expect(getComputedStyle(bar).borderBottomWidth).toBe("0px");
    await expect(canvas.getByRole("heading", { level: 1, name: "Weft" })).toBeVisible();
    await expect(canvas.queryByRole("button", { name: "返回" })).toBeNull();
    await expect(canvas.getByRole("button", { name: "记录" })).toBeVisible();
  },
};

/** Pushed screen: back + title + subtitle + ⋯. */
export const Pushed: Story = {
  args: {
    variant: "pushed",
    title: "张伟",
    subtitle: "别名：老张 · 同事",
    onBack: fn(),
    actions: <IconButton aria-label="更多" icon={<FiMoreHorizontal />} />,
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "返回" }));
    await expect(args.onBack).toHaveBeenCalled();
    await expect(canvas.getByText("别名：老张 · 同事")).toBeVisible();
    await expect(canvas.getByRole("button", { name: "更多" })).toBeVisible();
  },
};

const LONG = "北京字节跳动网络技术有限公司的张伟和李明";

/** AC-UI-8: a long title truncates to one line, full text on focus / hover. */
export const LongTitle: Story = {
  args: { variant: "pushed", title: LONG, onBack: fn() },
  parameters: { a11y: { context: "body" } },
  play: async ({ canvasElement }) => {
    const heading = within(canvasElement).getByRole("heading", { level: 1 });
    await expect(heading.scrollWidth).toBeGreaterThan(heading.clientWidth);
    await expect(getComputedStyle(heading).textOverflow).toBe("ellipsis");
    await userEvent.hover(heading);
    await expect(await screen.findByRole("tooltip")).toHaveTextContent(LONG);
  },
};
