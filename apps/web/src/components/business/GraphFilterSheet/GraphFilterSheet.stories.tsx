import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test";
import type { Taxonomy } from "../../../contracts/taxonomy.ts";
import { EMPTY_FILTER, type GraphFilter } from "../../../lib/graphFilter.ts";
import { rgb } from "../../../test/color.ts";
import { Button } from "../../basics/Button/Button.tsx";
import { GraphFilterSheet } from "./GraphFilterSheet.tsx";

const TAXONOMY: Taxonomy = [
  { category: "kin", subtypes: [{ name: "父母" }, { name: "配偶" }, { name: "其他" }] },
  { category: "romantic", subtypes: [{ name: "恋人" }, { name: "其他" }] },
  {
    category: "social",
    subtypes: [
      { name: "同事" },
      { name: "同学" },
      { name: "球友", custom: true },
      { name: "其他" },
    ],
  },
  { category: "interest", subtypes: [{ name: "客户" }, { name: "其他" }] },
  { category: "hostile", subtypes: [{ name: "竞争" }, { name: "其他" }] },
];

const onChange = fn();

function Stateful({ initial = EMPTY_FILTER }: { initial?: GraphFilter }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(initial);
  return (
    <>
      <Button variant="ghost" onClick={() => setOpen(true)}>
        筛选
      </Button>
      <output data-filter="">{JSON.stringify(value)}</output>
      <GraphFilterSheet
        open={open}
        onOpenChange={setOpen}
        taxonomy={TAXONOMY}
        value={value}
        onChange={(v) => {
          onChange(v);
          setValue(v);
        }}
      />
    </>
  );
}

const meta = {
  title: "Business/GraphFilterSheet",
  component: GraphFilterSheet,
  args: {
    open: false,
    onOpenChange: () => {},
    taxonomy: TAXONOMY,
    value: EMPTY_FILTER,
    onChange: () => {},
  },
  render: () => <Stateful />,
  parameters: { a11y: { context: "body" } },
} satisfies Meta<typeof GraphFilterSheet>;

export default meta;
type Story = StoryObj<typeof meta>;

const openSheet = async (canvasElement: HTMLElement) => {
  await userEvent.click(within(canvasElement).getByRole("button", { name: "筛选" }));
  return screen.findByRole("dialog", { name: "筛选" });
};
const current = (canvasElement: HTMLElement) =>
  JSON.parse(canvasElement.querySelector("[data-filter]")?.textContent ?? "{}") as GraphFilter;

/** AC-34 / BOT-9: 社会 + 亲近及以上. Categories multi-select, closeness single-select. */
export const FilterByCategoryAndCloseness: Story = {
  play: async ({ canvasElement }) => {
    const sheet = await openSheet(canvasElement);
    const categories = within(sheet).getByRole("group", { name: "关系大类" });
    await expect(
      within(categories)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["亲属", "情感", "社会", "利益", "敌对"]);
    // No subtypes until a category is chosen.
    await expect(within(sheet).queryByRole("group", { name: "关系小类" })).toBeNull();

    const social = within(categories).getByRole("button", { name: "社会" });
    await userEvent.click(social);
    await expect(social).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => expect(getComputedStyle(social).backgroundColor).toBe(rgb("#EEF2FF")));
    await userEvent.click(within(categories).getByRole("button", { name: "亲属" }));
    await expect(current(canvasElement).categories).toEqual(["social", "kin"]);

    const closeness = within(sheet).getByRole("group", { name: "亲密度" });
    await expect(
      within(closeness)
        .getAllByRole("button")
        .map((b) => b.textContent),
    ).toEqual(["全部亲密度", "至交", "亲近及以上", "熟悉及以上", "一般及以上"]);
    await expect(within(closeness).getByRole("button", { name: "全部亲密度" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    await userEvent.click(within(closeness).getByRole("button", { name: "亲近及以上" }));
    await expect(current(canvasElement).minCloseness).toBe("close");
    await expect(within(closeness).getByRole("button", { name: "全部亲密度" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    await userEvent.click(within(sheet).getByRole("button", { name: "完成" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  },
};

/** Subtypes of the chosen categories, custom ones included (AC-32); unchoosing the category drops them. */
export const Subtypes: Story = {
  play: async ({ canvasElement }) => {
    const sheet = await openSheet(canvasElement);
    const categories = within(sheet).getByRole("group", { name: "关系大类" });
    await userEvent.click(within(categories).getByRole("button", { name: "社会" }));
    const subtypes = within(sheet).getByRole("group", { name: "关系小类" });
    const ballmate = within(subtypes).getByRole("button", { name: "球友（自定义）" });
    await userEvent.click(ballmate);
    await expect(ballmate).toHaveAttribute("aria-pressed", "true");
    await expect(current(canvasElement).subtypes).toEqual(["球友"]);

    await userEvent.click(within(categories).getByRole("button", { name: "社会" }));
    await expect(current(canvasElement)).toEqual(EMPTY_FILTER);
  },
};

export const Reset: Story = {
  render: () => (
    <Stateful initial={{ categories: ["social"], subtypes: ["同事"], minCloseness: "intimate" }} />
  ),
  play: async ({ canvasElement }) => {
    const sheet = await openSheet(canvasElement);
    await userEvent.click(within(sheet).getByRole("button", { name: "重置" }));
    await expect(current(canvasElement)).toEqual(EMPTY_FILTER);
  },
};

/**
 * Desktop ≥1200 (D3): the filter is the non-modal right column beside the panorama, so the
 * graph refilters live while it stays usable. Esc only closes it from inside.
 */
function Column() {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState(EMPTY_FILTER);
  return (
    <div className="flex h-[700px] w-[1000px]">
      <div className="flex flex-1 flex-col items-start gap-sm p-md">
        <Button variant="ghost" onClick={() => setOpen(true)}>
          筛选
        </Button>
        <output data-filter="">{JSON.stringify(value)}</output>
        <Button variant="secondary" onClick={() => setValue(EMPTY_FILTER)}>
          图上的按钮
        </Button>
      </div>
      <GraphFilterSheet
        open={open}
        onOpenChange={setOpen}
        taxonomy={TAXONOMY}
        value={value}
        onChange={setValue}
        variant="side-panel"
        modal={false}
      />
    </div>
  );
}

export const DesktopColumn: Story = {
  name: "Side panel · non-modal (desktop column)",
  render: () => <Column />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("button", { name: "筛选" });
    await userEvent.click(trigger);
    const panel = await canvas.findByRole("dialog", { name: "筛选" });
    await expect(canvasElement).toContainElement(panel);
    await expect(panel).not.toHaveAttribute("aria-modal", "true");
    await expect(panel.getBoundingClientRect().width).toBe(360);
    await expect(document.querySelector("[data-drawer-mask]")).toBeNull();
    await waitFor(() => expect(panel).toContainElement(document.activeElement as HTMLElement));

    await userEvent.click(within(panel).getByRole("button", { name: "社会" }));
    await expect(current(canvasElement).categories).toEqual(["social"]);

    // The page beside it stays interactive; Esc there does not close the panel.
    await userEvent.click(canvas.getByRole("button", { name: "图上的按钮" }));
    await expect(canvas.getByRole("button", { name: "图上的按钮" })).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    await new Promise((r) => setTimeout(r, 100));
    await expect(panel).toBeVisible();

    within(panel).getByRole("button", { name: "完成" }).focus();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(canvas.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(trigger).toHaveFocus());
  },
};

function WithOnly() {
  const [only, setOnly] = useState(false);
  return (
    <>
      <output data-only="">{String(only)}</output>
      <GraphFilterSheet
        open
        onOpenChange={() => {}}
        taxonomy={TAXONOMY}
        value={EMPTY_FILTER}
        onChange={() => {}}
        onlyMatching={only}
        onOnlyMatchingChange={setOnly}
      />
    </>
  );
}

/** graph-viz AC-13: people not matching fade by default, or 「只显示符合的人」. */
export const OnlyMatching: Story = {
  render: () => <WithOnly />,
  play: async ({ canvasElement }) => {
    const sheet = await screen.findByRole("dialog", { name: "筛选" });
    const fade = within(sheet).getByRole("button", { name: "淡化显示" });
    const only = within(sheet).getByRole("button", { name: "只显示符合的人" });
    await expect(fade).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(only);
    await expect(only).toHaveAttribute("aria-pressed", "true");
    await waitFor(() =>
      expect(canvasElement.querySelector("[data-only]")).toHaveTextContent("true"),
    );
  },
};
