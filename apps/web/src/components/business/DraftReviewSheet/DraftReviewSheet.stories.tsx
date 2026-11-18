import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test";
import type { Draft } from "../../../contracts/draft.ts";
import type { Taxonomy } from "../../../contracts/taxonomy.ts";
import {
  choosePerson,
  removeItem,
  setConfidence,
  setRelationshipType,
} from "../../../lib/draft.ts";
import { token } from "../../../test/color.ts";
import { Button } from "../../basics/Button/Button.tsx";
import { DraftReviewSheet, type DraftReviewSheetProps } from "./DraftReviewSheet.tsx";
import { REVIEW_DRAFT, TAXONOMY, TAXONOMY_WITH_CUSTOM } from "./fixtures.ts";

const today = new Date(2026, 10, 16);
const onConfirm = fn();
const onDiscard = fn();

type HarnessProps = {
  initial: Draft;
  taxonomy?: Taxonomy;
  variant?: DraftReviewSheetProps["variant"];
};

/** Applies the sheet's keyed callbacks with lib/draft.ts, as the page will. */
function Harness({ initial, taxonomy = TAXONOMY, variant }: HarnessProps) {
  const [open, setOpen] = useState(true);
  const [draft, setDraft] = useState(initial);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        查看并确认
      </Button>
      <DraftReviewSheet
        open={open}
        onOpenChange={setOpen}
        variant={variant}
        draft={draft}
        occurredOn={{ precision: "day", year: 2026, month: 11, day: 16 }}
        today={today}
        taxonomy={taxonomy}
        onChoosePerson={(id, c) => setDraft((d) => choosePerson(d, id, c))}
        onConfidenceChange={(id, c) => setDraft((d) => setConfidence(d, id, c))}
        onRemoveItem={(id) => setDraft((d) => removeItem(d, id))}
        onRelationshipTypeChange={(id, i, t) => setDraft((d) => setRelationshipType(d, id, i, t))}
        onConfirm={onConfirm}
        onDiscard={onDiscard}
      />
    </>
  );
}

const meta = {
  title: "Business/DraftReviewSheet",
  component: DraftReviewSheet,
  args: {
    open: true,
    onOpenChange: () => {},
    draft: REVIEW_DRAFT,
    occurredOn: { precision: "day", year: 2026, month: 11, day: 16 },
    today,
    taxonomy: TAXONOMY,
    onChoosePerson: () => {},
    onConfidenceChange: () => {},
    onRemoveItem: () => {},
    onRelationshipTypeChange: () => {},
    onConfirm: () => {},
    onDiscard: () => {},
  },
  render: (args) => (
    <Harness initial={args.draft} taxonomy={args.taxonomy} variant={args.variant} />
  ),
  parameters: { a11y: { context: "body" } },
} satisfies Meta<typeof DraftReviewSheet>;

export default meta;
type Story = StoryObj<typeof meta>;

const sheet = () => screen.findByRole("dialog", { name: "确认草稿" });

/**
 * AC-10: grouped by category; every item shows its confidence. Style refresh AC-8: items are
 * natural sentences with the confidence trailing in grey (「张伟喜欢钓鱼 · 本人说」), persons
 * read 「老张 是 张伟」; 放弃 and 确认入图谱 side by side at equal width, 确认 the primary.
 */
export const Grouped: Story = {
  play: async () => {
    const s = await sheet();
    await expect(s).toHaveAccessibleDescription("今天 · 确认后才会写进图谱");
    const headings = within(s)
      .getAllByRole("heading", { level: 3 })
      .map((h) => h.textContent);
    await expect(headings).toEqual(["涉及的人物", "信息", "画像变化", "关系变化", "感受变化"]);
    const items = s.querySelectorAll("[data-draft-item]");
    await expect(items).toHaveLength(6);
    for (const item of items) {
      await expect(item.querySelector("[data-confidence]")).not.toBeNull();
    }
    const matched = s.querySelector('[data-person-match="matched"] [data-person-match-title]');
    await expect(matched).toHaveTextContent("老张 是 张伟");
    const texts = [...items].map((i) => i.querySelector("[data-confidence-line]")?.textContent);
    await expect(texts).toEqual([
      "张伟喜欢钓鱼 · 本人说",
      "小李在腾讯工作 · 转述",
      "张伟在阿里巴巴工作 · 本人说",
      "张伟的籍贯是湖南长沙 · 本人说",
      "张伟是小李的室友 · 转述",
      "我觉得和小李很亲近 · 亲历",
    ]);
    // no internal name, no field glued on
    await expect(s).not.toHaveTextContent(/[A-Z]{2,}_|张伟 · 喜欢/);
    const discard = within(s).getByRole("button", { name: "放弃" });
    const confirm = within(s).getByRole("button", { name: "确认入图谱" });
    await expect(discard.getBoundingClientRect().width).toBeCloseTo(
      confirm.getBoundingClientRect().width,
      0,
    );
    await expect(discard.getBoundingClientRect().top).toBe(confirm.getBoundingClientRect().top);
    await expect(getComputedStyle(confirm).backgroundColor).toBe(token("primary-6"));
  },
};

/** AC-12 / BOT-3: 确认入图谱 is disabled with a hint until 小李 is chosen. */
export const AmbiguousBlocksConfirm: Story = {
  play: async () => {
    const s = await sheet();
    const confirm = within(s).getByRole("button", { name: "确认入图谱" });
    await expect(confirm).toBeDisabled();
    await expect(confirm).toHaveAccessibleDescription("还有 1 个人物需要先选择");
    await expect(within(s).getByText("还有 1 个人物需要先选择")).toBeVisible();

    await userEvent.click(within(s).getByRole("button", { name: "李明（同学）" }));
    await expect(s.querySelector('[data-person-match="matched"]:nth-of-type(2)')).toHaveTextContent(
      "小李 是 李明",
    );
    await expect(confirm).toBeEnabled();
    await expect(within(s).queryByText("还有 1 个人物需要先选择")).toBeNull();
    await userEvent.click(confirm);
    await expect(onConfirm).toHaveBeenCalled();
  },
};

/** AC-11 / AC-18 / BOT-2: change a confidence, delete an item. */
export const EditAndRemove: Story = {
  play: async () => {
    const s = await sheet();
    const fishing = [...s.querySelectorAll("[data-draft-item]")].find((el) =>
      el.textContent?.includes("张伟喜欢钓鱼"),
    ) as HTMLElement;
    // tapping the line itself opens the confidence menu
    await userEvent.click(within(fishing).getByText("张伟喜欢钓鱼"));
    await userEvent.click(await screen.findByRole("menuitemradio", { name: "亲历" }));
    await waitFor(() =>
      expect(
        within(fishing).getByRole("button", { name: /亲历（可信度，点按修改）/ }),
      ).toBeVisible(),
    );

    await userEvent.click(within(s).getByRole("button", { name: "删除「张伟的籍贯是湖南长沙」" }));
    await expect(within(s).queryByText("张伟的籍贯是湖南长沙")).toBeNull();
    // Its section disappears when empty.
    await expect(within(s).queryByRole("heading", { name: "画像变化" })).toBeNull();
  },
};

/** AC-14 / AC-15: update shows 旧值 → 新值; the lower-confidence conflict is 待核实. */
export const UpdateAndUnverified: Story = {
  play: async () => {
    const s = await sheet();
    await expect(within(s).getByText("将更新：字节跳动 → 阿里巴巴")).toBeVisible();
    const unverified = s.querySelector("[data-draft-item=unverified]") as HTMLElement;
    await expect(unverified).toHaveTextContent("小李在腾讯工作");
    await expect(unverified).toHaveTextContent("待核实");
    await expect(unverified).toHaveTextContent("与已有信息冲突且可信度更低");
  },
};

/** AC-17 / AC-UI-6: 放弃 asks again in a danger Modal with equal-width buttons. */
export const DiscardNeedsConfirmation: Story = {
  play: async () => {
    const s = await sheet();
    await userEvent.click(within(s).getByRole("button", { name: "放弃" }));
    const modal = await screen.findByRole("alertdialog", { name: "放弃这份草稿？" });
    await expect(modal).toHaveTextContent("记录原文会保留");
    const cancel = within(modal).getByRole("button", { name: "取消" });
    const discard = within(modal).getByRole("button", { name: "放弃" });
    await expect(cancel.getBoundingClientRect().width).toBeCloseTo(
      discard.getBoundingClientRect().width,
      2,
    );
    await expect(getComputedStyle(discard).color).toBe(token("status-error-6"));
    await expect(getComputedStyle(discard).backgroundColor).toBe(token("neutral-bg-container"));

    await userEvent.click(cancel);
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    await expect(onDiscard).not.toHaveBeenCalled();

    await userEvent.click(within(s).getByRole("button", { name: "放弃" }));
    await userEvent.click(
      within(await screen.findByRole("alertdialog")).getByRole("button", { name: "放弃" }),
    );
    await expect(onDiscard).toHaveBeenCalledTimes(1);
  },
};

/** AC-32 / BOT-13: a new custom subtype 「球友」 is offered in the draft and can be chosen. */
export const CustomSubtypeInPicker: Story = {
  args: { taxonomy: TAXONOMY_WITH_CUSTOM },
  play: async () => {
    const s = await sheet();
    const rel = [...s.querySelectorAll("[data-draft-item]")].find((el) =>
      el.textContent?.includes("张伟是小李的室友"),
    ) as HTMLElement;
    await expect(rel.querySelector("[data-relationship-type]")).toHaveTextContent("社会 · 室友");
    const edit = within(rel).getByRole("button", { name: "修改关系类型「社会 · 室友」" });
    await userEvent.click(edit);
    await expect(edit).toHaveAttribute("aria-expanded", "true");
    const social = within(rel).getByRole("group", { name: "社会" });
    const ball = within(social).getByRole("button", { name: "球友（自定义）" });
    await userEvent.click(ball);
    await expect(rel.querySelector("[data-relationship-type]")).toHaveTextContent("社会 · 球友");
    // Original wording kept next to the new type (AC-31).
    await expect(rel.querySelector("[data-relationship-type]")).toHaveTextContent("“室友”");
    await expect(within(rel).queryByRole("group", { name: "社会" })).toBeNull();
  },
};

/** Desktop D1: the same sheet as the 380px right panel. */
export const SidePanel: Story = {
  args: { variant: "side-panel" },
  play: async () => {
    const s = await sheet();
    await expect(s.getBoundingClientRect().width).toBe(380);
  },
};
