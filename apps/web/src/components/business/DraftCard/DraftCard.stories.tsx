import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, fn, userEvent, within } from "storybook/test";
import type { DraftStatus } from "../../../contracts/draft.ts";
import { rgb } from "../../../test/color.ts";
import { Button } from "../../basics/Button/Button.tsx";
import { DraftCard } from "./DraftCard.tsx";
import { CONFIRMED_PERSONS, PENDING_DRAFT } from "./fixtures.ts";

const meta = {
  title: "Business/DraftCard",
  component: DraftCard,
  args: {
    status: "pending",
    draft: PENDING_DRAFT,
    onReview: fn(),
    onRetry: fn(),
    onPersonClick: fn(),
  },
  decorators: [
    (Story) => (
      <div className="w-[375px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof DraftCard>;

export default meta;
type Story = StoryObj<typeof meta>;

const card = (root: HTMLElement) => root.querySelector("[data-draft-card]") as HTMLElement;

/** AC-UI-2 抽取中: skeleton x3 and 「正在整理人物和关系…」. */
export const Extracting: Story = {
  args: { status: "extracting", draft: undefined },
  play: async ({ canvasElement }) => {
    const c = card(canvasElement);
    await expect(c).toHaveAttribute("aria-busy", "true");
    await expect(within(c).getByRole("status")).toHaveTextContent("正在整理人物和关系…");
    await expect(c.querySelectorAll("[data-skeleton=text]")).toHaveLength(3);
    await expect(within(c).queryByRole("button")).toBeNull();
  },
};

/** AC-UI-2 / AC-10 待确认: person chips, first 3 items each with confidence, 「还有 N 条」. */
export const Pending: Story = {
  play: async ({ canvasElement, args }) => {
    const c = card(canvasElement);
    const canvas = within(c);
    await expect(canvas.getByRole("status")).toHaveTextContent("草稿 · 2 个人物 · 4 条信息");
    await expect(canvas.getByText("老张 → 张伟")).toBeVisible();
    const ambiguous = canvas.getByText("小李 → ？需选择").parentElement as HTMLElement;
    await expect(getComputedStyle(ambiguous).color).toBe(rgb("#C81E1E"));
    const lines = c.querySelectorAll("[data-draft-line]");
    await expect(lines).toHaveLength(3);
    for (const line of lines) {
      await expect(line.querySelector("[data-confidence]")).not.toBeNull();
    }
    await expect(canvas.getByText("小李 · 工作单位 腾讯")).toBeVisible();
    await expect(canvas.getByText("待核实")).toBeVisible();
    await expect(canvas.getByText("还有 1 条")).toBeVisible();
    const review = canvas.getByRole("button", { name: "查看并确认" });
    await expect(getComputedStyle(review).backgroundColor).toBe(rgb("#4F46E5"));
    await userEvent.click(review);
    await expect(args.onReview).toHaveBeenCalled();
  },
};

/** AC-18 / AC-UI-2 抽取失败: error-1 background, original kept, secondary 重试. */
export const Failed: Story = {
  args: { status: "failed", draft: undefined },
  play: async ({ canvasElement, args }) => {
    const c = card(canvasElement);
    await expect(getComputedStyle(c).backgroundColor).toBe(rgb("#FEF2F2"));
    await expect(within(c).getByRole("status")).toHaveTextContent("整理失败，原文已保存");
    const retry = within(c).getByRole("button", { name: "重试" });
    await expect(getComputedStyle(retry).backgroundColor).toBe(rgb("#FFFFFF"));
    await userEvent.click(retry);
    await expect(args.onRetry).toHaveBeenCalled();
  },
};

/** AC-UI-2 已入图谱: count, learned aliases, person chips link to their pages. */
export const Confirmed: Story = {
  args: {
    status: "confirmed",
    persons: CONFIRMED_PERSONS,
    learnedAliases: [{ alias: "小李", name: "李明" }],
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(card(canvasElement));
    await expect(canvas.getByRole("status")).toHaveTextContent(
      "✓ 已入图谱 · 4 条信息 · 1 条待核实",
    );
    await expect(canvas.getByText("学到别名：小李 = 李明")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: "李明" }));
    await expect(args.onPersonClick).toHaveBeenCalledWith("lm");
    await expect(canvas.queryByRole("button", { name: "查看并确认" })).toBeNull();
  },
};

/** AC-17 / AC-UI-2 已放弃. */
export const Discarded: Story = {
  args: { status: "discarded" },
  play: async ({ canvasElement }) => {
    const c = card(canvasElement);
    await expect(within(c).getByRole("status")).toHaveTextContent("已放弃");
    await expect(getComputedStyle(within(c).getByRole("status")).color).toBe(rgb("#5B6475"));
    await expect(within(c).queryByRole("button")).toBeNull();
  },
};

const FLOW: DraftStatus[] = ["extracting", "pending", "confirmed"];

function InPlace() {
  const [step, setStep] = useState(0);
  return (
    <div className="flex flex-col gap-sm">
      <DraftCard
        status={FLOW[step]}
        draft={PENDING_DRAFT}
        persons={CONFIRMED_PERSONS}
        onReview={() => {}}
      />
      <Button variant="secondary" onClick={() => setStep((s) => Math.min(s + 1, FLOW.length - 1))}>
        下一步状态
      </Button>
    </div>
  );
}

/** AC-UI-10: 抽取中 → 待确认 → 已入图谱 changes the same card; nothing is appended. */
export const StatusChangesInPlace: Story = {
  render: () => <InPlace />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const first = card(canvasElement);
    const live = within(first).getByRole("status");
    await expect(live).toHaveAttribute("aria-live", "polite");
    await expect(live).toHaveTextContent("正在整理");

    await userEvent.click(canvas.getByRole("button", { name: "下一步状态" }));
    await expect(canvasElement.querySelectorAll("[data-draft-card]")).toHaveLength(1);
    await expect(card(canvasElement)).toBe(first);
    await expect(within(first).getByRole("status")).toBe(live);
    await expect(live).toHaveTextContent("草稿 · 2 个人物");

    await userEvent.click(canvas.getByRole("button", { name: "下一步状态" }));
    await expect(canvasElement.querySelectorAll("[data-draft-card]")).toHaveLength(1);
    await expect(card(canvasElement)).toBe(first);
    await expect(live).toHaveTextContent("已入图谱");
  },
};

/**
 * AC-UI-9 (axe landmark-unique): every card is a region, so each one carries its own
 * accessible name — the chat passes 「草稿 · <发生日期> · <记录开头>」.
 */
export const DistinctNames: Story = {
  render: (args) => (
    <div className="flex flex-col gap-sm">
      <DraftCard {...args} label="草稿 · 今天 · 今天和老张吃饭" />
      <DraftCard
        {...args}
        status="confirmed"
        persons={CONFIRMED_PERSONS}
        label="草稿 · 11-02 · 读大学时在社团认识"
      />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const regions = canvas.getAllByRole("region");
    await expect(regions).toHaveLength(2);
    await expect(regions[0]).toHaveAccessibleName("草稿 · 今天 · 今天和老张吃饭");
    await expect(regions[1]).toHaveAccessibleName("草稿 · 11-02 · 读大学时在社团认识");
    // The status line inside each card stays the polite live region (AC-UI-10).
    for (const r of regions) {
      await expect(within(r).getByRole("status")).toHaveAttribute("aria-live", "polite");
    }
  },
};
