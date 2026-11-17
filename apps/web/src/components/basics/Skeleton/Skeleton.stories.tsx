import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, within } from "storybook/test";
import { Skeleton } from "./Skeleton.tsx";

const meta = {
  title: "Basics/Skeleton",
  component: Skeleton,
  // The loading region announces itself; the placeholders inside are decorative.
  decorators: [
    (Story) => (
      <div
        role="status"
        aria-label="加载中"
        aria-busy="true"
        className="flex w-[343px] flex-col gap-sm"
      >
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Skeleton>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Text: Story = {
  render: () => (
    <>
      <Skeleton />
      <Skeleton />
      <Skeleton width="60%" />
    </>
  ),
  play: async ({ canvasElement }) => {
    const region = within(canvasElement).getByRole("status", { name: "加载中" });
    // Placeholders are hidden from assistive tech, so the region has no readable content.
    await expect(region).toHaveTextContent("");
    const lines = region.querySelectorAll("[aria-hidden='true']");
    await expect(lines).toHaveLength(3);
    await expect((lines[0] as HTMLElement).getBoundingClientRect().height).toBe(12);
  },
};

export const Avatar: Story = {
  args: { variant: "avatar", size: "lg" },
  play: async ({ canvasElement }) => {
    const shape = within(canvasElement).getByRole("status").firstElementChild as HTMLElement;
    await expect(getComputedStyle(shape).borderRadius).toBe("9999px");
    await expect(shape.getBoundingClientRect().width).toBe(56);
  },
};

export const Card: Story = {
  args: { variant: "card", height: "120px" },
  play: async ({ canvasElement }) => {
    const shape = within(canvasElement).getByRole("status").firstElementChild as HTMLElement;
    await expect(getComputedStyle(shape).borderRadius).toBe("10px");
  },
};
