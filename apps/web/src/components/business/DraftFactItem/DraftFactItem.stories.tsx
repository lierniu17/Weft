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
    title: "张伟喜欢钓鱼",
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
const line = (root: HTMLElement) => root.querySelector("[data-confidence-line]") as HTMLElement;

/**
 * 新增 (AC-10, AC-11; style refresh AC-8): a natural sentence with its confidence as
 * trailing grey meta — 「张伟喜欢钓鱼 · 本人说」 — the whole line pickable, plus ✕.
 */
export const Add: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(row(canvasElement)).toHaveAttribute("data-draft-item", "add");
    await expect(line(canvasElement)).toHaveTextContent("张伟喜欢钓鱼 · 本人说");
    const trigger = canvas.getByRole("button", {
      name: "张伟喜欢钓鱼 · 本人说（可信度，点按修改）",
    });
    await expect(trigger).toBe(line(canvasElement));
    const level = canvasElement.querySelector("[data-confidence]") as HTMLElement;
    await expect(getComputedStyle(level).color).toBe(token("neutral-text-tertiary"));
    await expect(getComputedStyle(level).fontSize).toBe("13px");
    await expect(getComputedStyle(level).backgroundColor).toBe("rgba(0, 0, 0, 0)");
    // no field glued on: no 「 · 喜欢 」 between subject and object
    await expect(trigger).not.toHaveTextContent("张伟 · 喜欢");
    await userEvent.click(canvas.getByRole("button", { name: "删除「张伟喜欢钓鱼」" }));
    await expect(args.onRemove).toHaveBeenCalledTimes(1);
  },
};

/** 更新 (AC-14): 「将更新：字节跳动 → 阿里巴巴」. */
export const Update: Story = {
  args: {
    title: "小李在阿里巴巴工作",
    variant: "update",
    conflictOld: "字节跳动",
    newValue: "阿里巴巴",
  },
  play: async ({ canvasElement }) => {
    await expect(row(canvasElement)).toHaveAttribute("data-draft-item", "update");
    await expect(within(canvasElement).getByText("将更新：字节跳动 → 阿里巴巴")).toBeVisible();
  },
};

/** 待核实 (AC-15): a warning tag + the explanation in warning text, never only colour. */
export const Unverified: Story = {
  args: {
    title: "小李在腾讯工作",
    variant: "unverified",
    conflictOld: "阿里",
    confidence: "hearsay",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(row(canvasElement)).toHaveAttribute("data-draft-item", "unverified");
    const detail = canvas.getByText(/与已有信息冲突且可信度更低/);
    await expect(detail).toHaveTextContent("已有：阿里");
    await expect(getComputedStyle(detail).color).toBe(token("status-warning-6"));
    const tag = canvas.getByText("待核实");
    await expect(tag).toBeVisible();
    await expect(getComputedStyle(tag).backgroundColor).toBe(token("status-warning-1"));
    // 转述 is the one level in a status colour
    const level = canvasElement.querySelector("[data-confidence]") as HTMLElement;
    await expect(getComputedStyle(level).color).toBe(token("status-warning-6"));
  },
};

function Editable(props: Partial<DraftFactItemProps>) {
  const [confidence, setConfidence] = useState<Confidence>("self_told");
  return (
    <DraftFactItem
      title="张伟喜欢钓鱼"
      confidence={confidence}
      onConfidenceChange={setConfidence}
      {...props}
    />
  );
}

/** BOT-2 step 3: tap the line, change 本人说 → 亲历. */
export const ChangeConfidence: Story = {
  render: () => <Editable />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: /本人说（可信度，点按修改）/ }));
    const menu = await screen.findByRole("menu");
    await userEvent.click(within(menu).getByRole("menuitemradio", { name: "亲历" }));
    await waitFor(() =>
      expect(canvas.getByRole("button", { name: /亲历（可信度，点按修改）/ })).toBeVisible(),
    );
    await expect(line(canvasElement)).toHaveTextContent("张伟喜欢钓鱼 · 亲历");
  },
};

/** Read-only (e.g. after confirmation): the same sentence line, no button, no ✕. */
export const ReadOnly: Story = {
  args: { onConfidenceChange: undefined, onRemove: undefined },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole("button")).toBeNull();
    await expect(line(canvasElement)).toHaveTextContent("张伟喜欢钓鱼 · 本人说");
    await expect(canvas.getByRole("img", { name: "可信度：本人说" })).toBeVisible();
  },
};
