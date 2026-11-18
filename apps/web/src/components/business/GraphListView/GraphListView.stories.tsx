import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, fn, userEvent, within } from "storybook/test";
import { answerHighlight } from "../../../lib/graph/answerHighlight.ts";
import { PATH_ANSWER, SAMPLE, SELF } from "../RelationGraph/graphFixtures.ts";
import { GraphListView, type GraphListViewProps } from "./GraphListView.tsx";

function Stateful(props: Omit<GraphListViewProps, "focusId" | "onFocusChange">) {
  const [focusId, setFocusId] = useState<string | null>(null);
  return <GraphListView {...props} focusId={focusId} onFocusChange={setFocusId} />;
}

const meta = {
  title: "Business/GraphListView",
  component: Stateful,
  args: { data: SAMPLE, onOpenPerson: fn() },
  decorators: [
    (Story) => (
      <div className="w-[375px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof Stateful>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * AC-20: everyone, grouped by ring then sector, as buttons; a focused person shows the
 * same card as on the graph, with 查看人物页.
 */
export const ByRingAndSector: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const rings = canvas.getAllByRole("heading", { level: 3 }).map((h) => h.textContent);
    await expect(rings).toEqual([
      "至交4 人",
      "亲近3 人",
      "熟悉4 人",
      "一般4 人",
      "疏远2 人",
      "间接认识2 人",
    ]);
    const intimateKin = canvas.getByRole("list", { name: "至交 · 亲属" });
    await expect(
      within(intimateKin)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(
      expect.arrayContaining([expect.stringContaining("刘婷"), expect.stringContaining("陈建国")]),
    );
    const indirect = canvas.getByRole("list", { name: "间接认识 · 社会" });
    await expect(indirect).toHaveTextContent("赵磊");
    await expect(canvas.queryByText("我")).toBeNull();

    // keyboard: tab to a person, Enter focuses them, the card opens
    const zw = canvas.getByRole("button", { name: /^张伟/ });
    zw.focus();
    await userEvent.keyboard("{Enter}");
    await expect(zw).toHaveAttribute("aria-pressed", "true");
    const card = canvas.getByRole("region", { name: "张伟的卡片" });
    await expect(card).toHaveTextContent("我对他：至交 · 他对我：亲近");
    await userEvent.click(within(card).getByRole("button", { name: "查看人物页" }));
    await expect(args.onOpenPerson).toHaveBeenCalledWith("zw");
    zw.focus();
    await userEvent.keyboard("{Enter}");
    await expect(zw).toHaveAttribute("aria-pressed", "false");
  },
};

/** AC-20: an answer's people are marked, the rest dimmed — as on the graph. */
export const AnswerHighlighted: Story = {
  args: { highlight: answerHighlight(PATH_ANSWER) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const marked = canvas.getAllByText("回答涉及").map((b) => b.closest("button")?.textContent);
    await expect(marked).toEqual([
      expect.stringContaining("张伟"),
      expect.stringContaining("王浩"),
    ]);
  },
};

/** Filtered (淡化): people not matching are marked. */
export const Filtered: Story = {
  args: { matching: new Set([SELF, "zw", "li"]) },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("button", { name: /^刘婷/ })).toHaveTextContent("不符合筛选");
    await expect(canvas.getByRole("button", { name: /^张伟/ })).not.toHaveTextContent("不符合筛选");
  },
};
