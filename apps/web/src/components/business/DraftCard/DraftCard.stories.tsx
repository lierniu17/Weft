import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import type { DraftStatus } from "../../../contracts/draft.ts";
import { motionMs } from "../../../lib/motion.ts";
import { TRANSPARENT, token } from "../../../test/color.ts";
import { canEmulateReducedMotion } from "../../../test/reducedMotion.ts";
import { tokens } from "../../../tokens.gen.ts";
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

/**
 * AC-UI-2 / AC-10 待确认: person chips, the first 3 items as natural sentences with the
 * confidence trailing in meta grey (style refresh AC-8: 「**张伟**喜欢钓鱼 · 本人说」),
 * 「还有 N 条」; a white card with a thin divider border (AC-4: the one card in the chat).
 */
export const Pending: Story = {
  play: async ({ canvasElement, args }) => {
    const c = card(canvasElement);
    const canvas = within(c);
    await expect(canvas.getByRole("status")).toHaveTextContent("草稿 · 2 个人物 · 4 条信息");
    await expect(getComputedStyle(c).backgroundColor).toBe(token("neutral-bg-container"));
    await expect(getComputedStyle(c).borderTopColor).toBe(token("neutral-divider"));
    await expect(getComputedStyle(c).boxShadow).toBe("none");
    await expect(canvas.getByText("老张 是 张伟")).toBeVisible();
    const ambiguous = canvas.getByText("小李 是谁？需选择").parentElement as HTMLElement;
    await expect(getComputedStyle(ambiguous).color).toBe(token("status-error-6"));
    const lines = [...c.querySelectorAll("[data-draft-line]")] as HTMLElement[];
    await expect(lines).toHaveLength(3);
    for (const line of lines) {
      await expect(line.querySelector("[data-confidence]")).not.toBeNull();
    }
    await expect(lines[0]).toHaveTextContent("张伟喜欢钓鱼 · 本人说");
    const subject = within(lines[0]).getByText("张伟");
    await expect(subject.tagName).toBe("B");
    await expect(getComputedStyle(subject).color).toBe(token("neutral-text-primary"));
    await expect(lines[1]).toHaveTextContent("小李在腾讯工作 · 转述");
    await expect(canvas.getByText("待核实")).toBeVisible();
    await expect(canvas.getByText("还有 1 条")).toBeVisible();
    const review = canvas.getByRole("button", { name: "查看并确认" });
    await expect(getComputedStyle(review).backgroundColor).toBe(token("primary-6"));
    await userEvent.click(review);
    await expect(args.onReview).toHaveBeenCalled();
  },
};

/** AC-18 / AC-UI-2 抽取失败: error-1 background, original kept, secondary 重试. */
export const Failed: Story = {
  args: { status: "failed", draft: undefined },
  play: async ({ canvasElement, args }) => {
    const c = card(canvasElement);
    await expect(getComputedStyle(c).backgroundColor).toBe(token("status-error-1"));
    await expect(within(c).getByRole("status")).toHaveTextContent("整理失败，原文已保存");
    const retry = within(c).getByRole("button", { name: "重试" });
    await expect(getComputedStyle(retry).backgroundColor).toBe(token("neutral-bg-container"));
    await userEvent.click(retry);
    await expect(args.onRetry).toHaveBeenCalled();
  },
};

/**
 * AC-UI-2 已入图谱 (as loaded, not just confirmed): bg-subtle without a border, the drawn
 * green check, count, learned aliases, person chips to their pages — and no motion.
 */
export const Confirmed: Story = {
  args: {
    status: "confirmed",
    persons: CONFIRMED_PERSONS,
    learnedAliases: [{ alias: "小李", name: "李明" }],
  },
  play: async ({ canvasElement, args }) => {
    const c = card(canvasElement);
    const canvas = within(c);
    await expect(canvas.getByRole("status")).toHaveTextContent("已入图谱 · 4 条信息 · 1 条待核实");
    await expect(getComputedStyle(c).backgroundColor).toBe(token("neutral-bg-subtle"));
    await expect(getComputedStyle(c).borderTopColor).toBe(TRANSPARENT);
    const check = c.querySelector("[data-draft-check] path") as SVGPathElement;
    await expect(getComputedStyle(check).animationName).toBe("none");
    await expect(getComputedStyle(check).strokeDashoffset).toBe("0px");
    await expect(c.querySelector("[data-draft-preview]")).toBeNull();
    await expect(c.querySelector(".animate-pop")).toBeNull();
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
    await expect(getComputedStyle(within(c).getByRole("status")).color).toBe(
      token("neutral-text-secondary"),
    );
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

function Confirming() {
  const [status, setStatus] = useState<DraftStatus>("pending");
  return (
    <div className="flex flex-col gap-sm">
      <DraftCard
        status={status}
        draft={PENDING_DRAFT}
        persons={status === "confirmed" ? CONFIRMED_PERSONS : []}
        onReview={() => {}}
      />
      <Button variant="secondary" onClick={() => setStatus("confirmed")}>
        确认入图谱
      </Button>
    </div>
  );
}

const sec = (ms: number) => `${ms / 1000}s`;
const m = tokens.motion;
const confirm = async (canvasElement: HTMLElement) => {
  const first = card(canvasElement);
  const preview = first.querySelector("[data-draft-preview]") as HTMLElement;
  await userEvent.click(within(canvasElement).getByRole("button", { name: "确认入图谱" }));
  await expect(card(canvasElement)).toBe(first); // the same DOM node throughout
  return { first, preview };
};

/**
 * Style refresh AC-14 — 草稿入图谱: after the review sheet leaves (motion.sheet-exit), the
 * same card folds its preview (grid-template-rows → 0fr) and settles on bg-subtle over
 * motion.emphasis, the green check is drawn, the new person chips pop once (motion.base).
 */
export const ConfirmMotion: Story = {
  render: () => <Confirming />,
  parameters: { motion: true },
  play: async ({ canvasElement }) => {
    const { first, preview } = await confirm(canvasElement);
    // Read at once: the fold only lasts motion.sheet-exit + motion.emphasis.
    const snapshot = (el: Element) => {
      const c = getComputedStyle(el);
      return {
        transitionProperty: c.transitionProperty,
        transitionDuration: c.transitionDuration,
        transitionTimingFunction: c.transitionTimingFunction,
        transitionDelay: c.transitionDelay,
        animationName: c.animationName,
        animationDuration: c.animationDuration,
      };
    };
    const live = first.querySelector("[data-draft-preview]");
    const fold = snapshot(preview);
    const surface = snapshot(first);
    const check = snapshot(first.querySelector("[data-draft-check] path") as Element);
    const chips = [...first.querySelectorAll("[data-draft-person]")].map(snapshot);
    await expect(within(first).getByRole("status")).toHaveTextContent("已入图谱 · 4 条信息");

    // The preview stays the same node while it folds: a transition, not a swap.
    await expect(live).toBe(preview);
    await expect(fold.transitionProperty).toBe("grid-template-rows, opacity");
    await expect(fold.transitionDuration).toBe(sec(motionMs("emphasis")));
    await expect(fold.transitionTimingFunction).toBe(m["easing-standard"]);
    await expect(fold.transitionDelay).toBe(sec(motionMs("sheet-exit")));
    await expect(surface.transitionDuration).toBe(sec(motionMs("emphasis")));
    await expect(check.animationName).toBe("check-draw");
    await expect(check.animationDuration).toBe(sec(motionMs("emphasis")));

    await expect(chips).toHaveLength(2);
    await expect(chips[0].animationName).toBe("pop");
    await expect(chips[0].animationDuration).toBe(sec(motionMs("base")));

    // Folded away for good once it has played.
    await waitFor(() => expect(first.querySelector("[data-draft-preview]")).toBeNull(), {
      timeout: 2000,
    });
    await waitFor(() =>
      expect(getComputedStyle(first).backgroundColor).toBe(token("neutral-bg-subtle")),
    );
  },
};

/** AC-16: with 「减少动态效果」 it switches directly; the check is shown drawn. */
export const ConfirmReducedMotion: Story = {
  render: () => <Confirming />,
  parameters: { motion: true, reducedMotion: true },
  play: async ({ canvasElement }) => {
    if (!canEmulateReducedMotion()) return;
    const { first } = await confirm(canvasElement);
    await waitFor(() => expect(first.querySelector("[data-draft-preview]")).toBeNull());
    const path = first.querySelector("[data-draft-check] path") as Element;
    await expect(getComputedStyle(path).animationName).toBe("none");
    await expect(getComputedStyle(path).strokeDashoffset).toBe("0px");
    await expect(getComputedStyle(first).transitionDuration).toBe("0s");
    await expect(document.getAnimations().filter((a) => a.playState === "running")).toEqual([]);
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
