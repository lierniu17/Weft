import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test";
import type { Confidence } from "../../../contracts/draft.ts";
import { token } from "../../../test/color.ts";
import { DraftFactItem, type DraftFactItemProps } from "./DraftFactItem.tsx";

const meta = {
  title: "Business/DraftFactItem",
  component: DraftFactItem,
  args: {
    title: "张伟 · 喜欢 钓鱼",
    confidence: "self_told",
    onConfidenceChange: fn(),
    onRemove: fn(),
  },
  decorators: [
    (Story) => (
      <ul className="w-[375px] bg-neutral-bg-container px-md">
        <Story />
      </ul>
    ),
  ],
  parameters: { a11y: { context: "body" } },
} satisfies Meta<typeof DraftFactItem>;

export default meta;
type Story = StoryObj<typeof meta>;

const row = (root: HTMLElement) => root.querySelector("[data-draft-item]") as HTMLElement;

/** 新增: title + pickable ConfidenceBadge + ✕ (AC-10, AC-11). */
export const Add: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(row(canvasElement)).toHaveAttribute("data-draft-item", "add");
    await expect(canvas.getByText("张伟 · 喜欢 钓鱼")).toBeVisible();
    await expect(canvas.getByRole("button", { name: "可信度：本人说，点按修改" })).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "删除「张伟 · 喜欢 钓鱼」" }));
    await expect(args.onRemove).toHaveBeenCalledTimes(1);
  },
};

/** 更新 (AC-14): 「将更新：字节跳动 → 阿里巴巴」. */
export const Update: Story = {
  args: {
    title: "小李 · 工作单位 阿里巴巴",
    variant: "update",
    conflictOld: "字节跳动",
    newValue: "阿里巴巴",
  },
  play: async ({ canvasElement }) => {
    await expect(row(canvasElement)).toHaveAttribute("data-draft-item", "update");
    await expect(within(canvasElement).getByText("将更新：字节跳动 → 阿里巴巴")).toBeVisible();
  },
};

/** 待核实 (AC-15): warning accent + the explanation, never only colour. */
export const Unverified: Story = {
  args: {
    title: "小李 · 工作单位 腾讯",
    variant: "unverified",
    conflictOld: "阿里",
    confidence: "hearsay",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const r = row(canvasElement);
    await expect(r).toHaveAttribute("data-draft-item", "unverified");
    const detail = canvas.getByText(/与已有信息冲突且可信度更低，标为待核实/);
    await expect(detail).toHaveTextContent("已有：阿里");
    await expect(getComputedStyle(detail).color).toBe(token("status-warning-6"));
    await expect(canvas.getByText("待核实")).toBeVisible();
    await expect(getComputedStyle(r).borderLeftColor).toBe(token("status-warning-6"));
  },
};

function Editable(props: Partial<DraftFactItemProps>) {
  const [confidence, setConfidence] = useState<Confidence>("self_told");
  return (
    <DraftFactItem
      title="张伟 · 喜欢 钓鱼"
      confidence={confidence}
      onConfidenceChange={setConfidence}
      {...props}
    />
  );
}

/** BOT-2 step 3: change 本人说 → 亲历. */
export const ChangeConfidence: Story = {
  render: () => <Editable />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "可信度：本人说，点按修改" }));
    const menu = await screen.findByRole("menu");
    await userEvent.click(within(menu).getByRole("menuitemradio", { name: "亲历" }));
    await waitFor(() =>
      expect(canvas.getByRole("button", { name: "可信度：亲历，点按修改" })).toBeVisible(),
    );
  },
};

/** Read-only (e.g. after confirmation): plain badge, no ✕. */
export const ReadOnly: Story = {
  args: { onConfidenceChange: undefined, onRemove: undefined },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole("button")).toBeNull();
    await expect(canvas.getByRole("img", { name: "可信度：本人说" })).toBeVisible();
  },
};
