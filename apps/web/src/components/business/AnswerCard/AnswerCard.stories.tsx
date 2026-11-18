import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test";
import type { Answer } from "../../../contracts/answer.ts";
import { token } from "../../../test/color.ts";
import { CitationSheet } from "../CitationSheet/CitationSheet.tsx";
import { AnswerCard } from "./AnswerCard.tsx";
import {
  LIST_ANSWER,
  LONG_NAME,
  NO_ANSWER,
  PATH_ANSWER,
  STAT_ANSWER,
  TEXT_ANSWER,
} from "./answerFixtures.ts";

const TODAY = new Date(2026, 10, 16);

const meta = {
  title: "Business/AnswerCard",
  component: AnswerCard,
  args: {
    answer: TEXT_ANSWER,
    today: TODAY,
    onCitationOpen: fn(),
    onPersonClick: fn(),
    onFollowUp: fn(),
    onRecord: fn(),
  },
  decorators: [
    (Story) => (
      <div className="w-[375px]">
        <Story />
      </div>
    ),
  ],
  parameters: { a11y: { context: "body" } },
} satisfies Meta<typeof AnswerCard>;

export default meta;
type Story = StoryObj<typeof meta>;

const card = (root: HTMLElement) => within(root).getByRole("article", { name: "回答" });

/** text: every claim carries a [n]; related persons and follow-ups are clickable. */
export const Text: Story = {
  play: async ({ canvasElement, args }) => {
    const c = within(card(canvasElement));
    await expect(getComputedStyle(card(canvasElement)).backgroundColor).toBe(
      token("neutral-bg-container"),
    );
    await expect(card(canvasElement)).toHaveTextContent("据老张说");
    await expect(c.getAllByRole("button", { name: /^出处 \d$/ })).toHaveLength(2);
    await userEvent.click(c.getByRole("button", { name: "出处 2" }));
    await expect(args.onCitationOpen).toHaveBeenCalledWith(2);

    await userEvent.click(c.getByRole("button", { name: /张伟/ }));
    await expect(args.onPersonClick).toHaveBeenCalledWith(TEXT_ANSWER.persons[0]);
    await userEvent.click(c.getByRole("button", { name: /他俩什么时候认识的/ }));
    await expect(args.onFollowUp).toHaveBeenCalledWith("他俩什么时候认识的？");
  },
};

function WithCitations({ answer }: { answer: Answer }) {
  const [index, setIndex] = useState<number | null>(null);
  const citation = answer.citations.find((c) => c.index === index);
  return (
    <>
      <AnswerCard
        answer={answer}
        today={TODAY}
        onCitationOpen={setIndex}
        onPersonClick={() => {}}
        onFollowUp={() => {}}
        onRecord={() => {}}
      />
      <CitationSheet
        open={citation !== undefined}
        onOpenChange={(o) => !o && setIndex(null)}
        citations={citation ? [citation] : []}
        today={TODAY}
      />
    </>
  );
}

/** AC-37 / BOT-5 step 2: clicking [2] opens the source text and 转述 confidence. */
export const CitationOpensSheet: Story = {
  render: () => <WithCitations answer={TEXT_ANSWER} />,
  play: async ({ canvasElement }) => {
    const mark = within(card(canvasElement)).getByRole("button", { name: "出处 2" });
    await userEvent.hover(mark);
    await expect(await screen.findByRole("tooltip")).toHaveTextContent("转述");
    await userEvent.click(mark);
    const sheet = await screen.findByRole("dialog", { name: "出处 [2]" });
    await expect(sheet).toHaveTextContent("因为借钱的事闹掰了");
    await expect(within(sheet).getByRole("img", { name: "可信度：转述 · 据老张说" })).toBeVisible();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  },
};

/** path: 我 → 张伟 → 王芳 (AC-36 人脉路径). */
export const Path: Story = {
  args: { answer: PATH_ANSWER },
  play: async ({ canvasElement, args }) => {
    const chain = within(card(canvasElement)).getByRole("list", { name: "人脉路径" });
    const steps = within(chain).getAllByRole("button");
    await expect(steps).toHaveLength(3);
    await userEvent.click(steps[2]);
    await expect(args.onPersonClick).toHaveBeenCalledWith(PATH_ANSWER.path?.[2]);
  },
};

/** list: one row per person, each with its own [n]; long names truncate (AC-UI-8). */
export const List: Story = {
  args: { answer: LIST_ANSWER },
  play: async ({ canvasElement, args }) => {
    const c = within(card(canvasElement));
    const rows = within(c.getByRole("list", { name: "人物列表" })).getAllByRole("listitem");
    await expect(rows).toHaveLength(3);
    await expect(within(rows[0]).getByRole("button", { name: "出处 1" })).toBeVisible();
    await expect(rows[1]).toHaveTextContent("王芳 · 客户");

    const longName = within(rows[2]).getByText(LONG_NAME);
    await expect(getComputedStyle(longName).textOverflow).toBe("ellipsis");
    await expect(longName.scrollWidth).toBeGreaterThan(longName.clientWidth);
    await userEvent.hover(within(rows[2]).getByRole("button", { name: new RegExp(LONG_NAME) }));
    await expect(await screen.findByRole("tooltip")).toHaveTextContent(LONG_NAME);

    await userEvent.click(within(rows[0]).getByRole("button", { name: /李明/ }));
    await expect(args.onPersonClick).toHaveBeenCalledWith(
      expect.objectContaining({ person_id: "lm" }),
    );
  },
};

/** stat: a big right-aligned number plus who is counted (AC-36 聚合统计). */
export const Stat: Story = {
  args: { answer: STAT_ANSWER },
  play: async ({ canvasElement }) => {
    const c = within(card(canvasElement));
    const number = c.getByText("4", { selector: "[data-stat-count]" });
    await expect(getComputedStyle(number).fontSize).toBe("24px");
    await expect(getComputedStyle(number).textAlign).toBe("right");
    const persons = within(c.getByRole("list", { name: "统计到的人物" })).getAllByRole("button");
    await expect(persons.map((p) => p.textContent)).toEqual(["张伟", "李明", "王芳", "陈静"]);
  },
};

/** no_answer (AC-38, S3 ⑤): says it plainly and offers 「去记一笔」. */
export const NoAnswer: Story = {
  args: { answer: NO_ANSWER },
  play: async ({ canvasElement, args }) => {
    const c = within(card(canvasElement));
    await expect(card(canvasElement)).toHaveTextContent("图谱里没有相关信息");
    await expect(c.queryByRole("button", { name: /^出处/ })).toBeNull();
    const record = c.getByRole("button", { name: "去记一笔" });
    await expect(getComputedStyle(record).backgroundColor).toBe(token("neutral-bg-container"));
    await userEvent.click(record);
    await expect(args.onRecord).toHaveBeenCalled();
  },
};

/** No segments from the API still reads as an explicit 「图谱里没有相关信息」. */
export const NoAnswerDefaultText: Story = {
  args: { answer: { ...NO_ANSWER, segments: [] } },
  play: async ({ canvasElement }) => {
    await expect(card(canvasElement)).toHaveTextContent("图谱里没有相关信息。");
  },
};

/**
 * graph-viz AC-16: every answer about people (path / list / stat / text) offers
 * 「在图上查看」; no_answer does not.
 */
export const ShowOnGraph: Story = {
  args: { answer: PATH_ANSWER, onShowOnGraph: fn() },
  play: async ({ canvasElement, args }) => {
    const c = within(card(canvasElement));
    await userEvent.click(c.getByRole("button", { name: "在图上查看" }));
    await expect(args.onShowOnGraph).toHaveBeenCalledTimes(1);
  },
};

function EveryKind() {
  return (
    <div className="flex flex-col gap-md">
      {[TEXT_ANSWER, PATH_ANSWER, LIST_ANSWER, STAT_ANSWER, NO_ANSWER].map((a) => (
        <AnswerCard
          key={a.kind}
          answer={a}
          today={TODAY}
          onCitationOpen={() => {}}
          onPersonClick={() => {}}
          onFollowUp={() => {}}
          onRecord={() => {}}
          onShowOnGraph={() => {}}
        />
      ))}
    </div>
  );
}

export const ShowOnGraphByKind: Story = {
  render: () => <EveryKind />,
  play: async ({ canvasElement }) => {
    const cards = within(canvasElement).getAllByRole("article", { name: "回答" });
    const has = cards.map(
      (el) => within(el).queryByRole("button", { name: "在图上查看" }) !== null,
    );
    await expect(has).toEqual([true, true, true, true, false]);
  },
};

/** Self is never a related-person chip (an older answer may still list 我): only in the chain. */
export const SelfIsNotAChip: Story = {
  args: {
    answer: {
      ...PATH_ANSWER,
      persons: [
        { person_id: "me", name: "小明", is_self: true },
        { person_id: "zw", name: "张伟" },
        { person_id: "wf", name: "王芳" },
      ],
    },
  },
  play: async ({ canvasElement }) => {
    const c = within(card(canvasElement));
    const related = c.getByRole("list", { name: "相关人物" });
    const chips = within(related).getAllByRole("button");
    await expect(chips.map((b) => b.getAttribute("aria-label"))).toEqual(["查看张伟", "查看王芳"]);
    await expect(
      within(c.getByRole("list", { name: "人脉路径" })).getAllByRole("button"),
    ).toHaveLength(3);
  },
};
