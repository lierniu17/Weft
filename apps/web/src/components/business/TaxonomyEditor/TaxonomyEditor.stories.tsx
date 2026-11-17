import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, fn, userEvent, within } from "storybook/test";
import type { Category } from "../../../contracts/draft.ts";
import type { Taxonomy } from "../../../contracts/taxonomy.ts";
import { TaxonomyEditor } from "./TaxonomyEditor.tsx";

const TAXONOMY: Taxonomy = [
  {
    category: "kin",
    subtypes: [{ name: "父母" }, { name: "配偶" }, { name: "子女" }, { name: "其他" }],
  },
  { category: "romantic", subtypes: [{ name: "恋人" }, { name: "前任" }, { name: "其他" }] },
  {
    category: "social",
    subtypes: [
      { name: "同事" },
      { name: "同学" },
      { name: "室友" },
      { name: "饭搭子", custom: true },
      { name: "其他" },
    ],
  },
  { category: "interest", subtypes: [{ name: "合伙人" }, { name: "客户" }, { name: "其他" }] },
  { category: "hostile", subtypes: [{ name: "竞争" }, { name: "矛盾" }, { name: "其他" }] },
];

const onAdd = fn();

function Stateful() {
  const [taxonomy, setTaxonomy] = useState(TAXONOMY);
  const add = (category: Category, name: string) => {
    onAdd(category, name);
    setTaxonomy((t) =>
      t.map((g) =>
        g.category === category ? { ...g, subtypes: [...g.subtypes, { name, custom: true }] } : g,
      ),
    );
  };
  return <TaxonomyEditor taxonomy={taxonomy} onAddSubtype={add} />;
}

const meta = {
  title: "Business/TaxonomyEditor",
  component: TaxonomyEditor,
  args: { taxonomy: TAXONOMY, onAddSubtype: () => {} },
  render: () => <Stateful />,
  decorators: [
    (Story) => (
      <div className="w-[375px] bg-neutral-bg-container">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof TaxonomyEditor>;

export default meta;
type Story = StoryObj<typeof meta>;

/** Five category groups, subtypes joined by 「 · 」, custom ones marked. */
export const Groups: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const headings = canvas.getAllByRole("heading", { level: 3 });
    await expect(headings.map((h) => h.textContent)).toEqual([
      "亲属",
      "情感",
      "社会",
      "利益",
      "敌对",
    ]);
    const social = canvas.getByRole("region", { name: "社会" });
    await expect(social).toHaveTextContent("同事 · 同学 · 室友 · 饭搭子（自定义） · 其他");
    await expect(canvas.queryByRole("textbox")).toBeNull();
  },
};

/** AC-32 / BOT-13: add 「球友」 under 社会; it appears at once, marked custom. */
export const AddSubtype: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const social = canvas.getByRole("region", { name: "社会" });
    await userEvent.click(within(social).getByRole("button", { name: "在「社会」下新增小类" }));
    const input = within(social).getByRole("textbox", { name: "新小类名称" });
    await expect(input).toHaveFocus();
    await userEvent.type(input, "球友{Enter}");
    await expect(onAdd).toHaveBeenCalledWith("social", "球友");
    await expect(social).toHaveTextContent("球友（自定义）");
    await expect(within(social).queryByRole("textbox")).toBeNull();
  },
};

/** Inline validation: blank, duplicate, too long. Nothing is submitted. */
export const Validation: Story = {
  play: async ({ canvasElement }) => {
    onAdd.mockClear();
    const canvas = within(canvasElement);
    const social = canvas.getByRole("region", { name: "社会" });
    await userEvent.click(within(social).getByRole("button", { name: "在「社会」下新增小类" }));
    const input = within(social).getByRole("textbox", { name: "新小类名称" });

    await userEvent.click(within(social).getByRole("button", { name: "添加" }));
    await expect(input).toHaveAccessibleDescription("请输入小类名称");

    await userEvent.type(input, "饭搭子{Enter}");
    await expect(input).toHaveAccessibleDescription("「饭搭子」已存在");
    await expect(input).toHaveAttribute("aria-invalid", "true");

    await userEvent.clear(input);
    await userEvent.type(input, `${"球".repeat(21)}{Enter}`);
    await expect(input).toHaveAccessibleDescription("最多 20 个字");
    await expect(onAdd).not.toHaveBeenCalled();
  },
};

/** Esc cancels and returns focus to the 「＋ 小类」 button. */
export const EscCancels: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const kin = canvas.getByRole("region", { name: "亲属" });
    const add = within(kin).getByRole("button", { name: "在「亲属」下新增小类" });
    await userEvent.click(add);
    await userEvent.type(within(kin).getByRole("textbox"), "干亲");
    await userEvent.keyboard("{Escape}");
    await expect(within(kin).queryByRole("textbox")).toBeNull();
    await expect(within(kin).getByRole("button", { name: "在「亲属」下新增小类" })).toHaveFocus();
    await expect(kin).not.toHaveTextContent("干亲");
  },
};
