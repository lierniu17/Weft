import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, fn, userEvent, within } from "storybook/test";
import type { Draft, DraftPerson } from "../../../contracts/draft.ts";
import { choosePerson } from "../../../lib/draft.ts";
import { token } from "../../../test/color.ts";
import { PersonMatchItem } from "./PersonMatchItem.tsx";

const AMBIGUOUS: DraftPerson = {
  id: "p1",
  mention: "小李",
  match: "ambiguous",
  candidates: [
    { person_id: "lm", name: "李明", note: "同学" },
    { person_id: "lh", name: "李华", note: "邻居" },
  ],
};

const meta = {
  title: "Business/PersonMatchItem",
  component: PersonMatchItem,
  args: {
    person: {
      id: "p0",
      mention: "老张",
      match: "matched",
      person_id: "zw",
      name: "张伟",
      note: "同事 · 已有别名",
    },
    onChoose: fn(),
  },
  decorators: [
    (Story) => (
      <ul className="w-[375px] bg-neutral-bg-container px-md">
        <Story />
      </ul>
    ),
  ],
} satisfies Meta<typeof PersonMatchItem>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * AC-12 已匹配, as a sentence (style refresh AC-8): 「老张 是 张伟」 (是 in meta grey) + note +
 * a green status chip 已匹配 (status colour, not the ink selected state).
 */
export const Matched: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const title = canvasElement.querySelector("[data-person-match-title]") as HTMLElement;
    await expect(title).toHaveTextContent("老张 是 张伟");
    await expect(getComputedStyle(within(title).getByText("是")).color).toBe(
      token("neutral-text-tertiary"),
    );
    await expect(canvas.getByText("同事 · 已有别名")).toBeVisible();
    const chip = canvas.getByText("已匹配").parentElement as HTMLElement;
    await expect(getComputedStyle(chip).backgroundColor).toBe(token("status-success-1"));
    await expect(getComputedStyle(chip).color).toBe(token("status-success-6"));
    await expect(canvas.queryByRole("group")).toBeNull();
  },
};

/** AC-12 需选择: 「小李 是谁？」 in error text, candidates + 「＋ 新人物」. */
export const Ambiguous: Story = {
  args: { person: AMBIGUOUS },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const title = canvas.getByText("小李 是谁？");
    await expect(getComputedStyle(title).color).toBe(token("status-error-6"));
    const group = canvas.getByRole("group", { name: "「小李」是谁" });
    const options = within(group).getAllByRole("button");
    await expect(options.map((o) => o.textContent)).toEqual([
      "李明（同学）",
      "李华（邻居）",
      "＋ 新人物",
    ]);
    await userEvent.click(options[0]);
    await expect(args.onChoose).toHaveBeenCalledWith({ person_id: "lm" });
    await userEvent.click(options[2]);
    await expect(args.onChoose).toHaveBeenCalledWith("new");
  },
};

/** AC-12 新人物 (AC-14 US-14). */
export const New: Story = {
  args: { person: { id: "p2", mention: "老张", match: "new" } },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByText("老张")).toBeVisible();
    const chip = canvas.getByText("新人物").parentElement as HTMLElement;
    await expect(getComputedStyle(chip).backgroundColor).toBe(token("neutral-bg-muted"));
  },
};

function Choosing() {
  const [draft, setDraft] = useState<Draft>({
    persons: [AMBIGUOUS],
    facts: [],
    relationships: [],
    feelings: [],
    profile: [],
    questions: [],
  });
  return (
    <PersonMatchItem
      person={draft.persons[0]}
      onChoose={(c) => setDraft((d) => choosePerson(d, "p1", c))}
    />
  );
}

/** BOT-3 step 3: picking 李明 turns the row into 已匹配. */
export const ChooseCandidate: Story = {
  render: () => <Choosing />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "李明（同学）" }));
    await expect(canvasElement.querySelector("[data-person-match-title]")).toHaveTextContent(
      "小李 是 李明",
    );
    await expect(canvas.getByText("已匹配")).toBeVisible();
  },
};

const LONG_NAME = "欧阳一二三四五六七八九十甲乙丙丁戊己庚辛";

/** AC-UI-8: long names truncate on one line instead of pushing the 已匹配 chip out. */
export const LongName: Story = {
  args: {
    person: { id: "p3", mention: LONG_NAME, match: "matched", person_id: "x", name: LONG_NAME },
  },
  play: async ({ canvasElement }) => {
    const title = canvasElement.querySelector("[data-person-match-title]") as HTMLElement;
    await expect(getComputedStyle(title).textOverflow).toBe("ellipsis");
    await expect(title.scrollWidth).toBeGreaterThan(title.clientWidth);
    const chip = within(canvasElement).getByText("已匹配");
    await expect(chip.getBoundingClientRect().right).toBeLessThanOrEqual(375);
  },
};
