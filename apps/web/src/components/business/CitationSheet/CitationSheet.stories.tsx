import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test";
import type { Citation } from "../../../contracts/answer.ts";
import { Button } from "../../basics/Button/Button.tsx";
import { CitationSheet, type CitationSheetProps } from "./CitationSheet.tsx";

const TODAY = new Date(2026, 10, 16);

const HEARSAY: Citation = {
  index: 2,
  entry_id: "e2",
  entry_excerpt: "今天和老张吃饭，他说他跟小李因为借钱的事闹掰了。",
  occurred_on: "2026-11-16",
  confidence: "hearsay",
  told_by: "老张",
  pair: [
    { person_id: "zw", name: "张伟" },
    { person_id: "lm", name: "李明" },
  ],
};

const WITNESSED: Citation = {
  index: 1,
  entry_id: "e1",
  entry_excerpt: "读大学时和老张、小李住一个宿舍。",
  occurred_on: "2012",
  confidence: "witnessed",
};

const onOpenRelationship = fn();

function WithTrigger(props: Omit<CitationSheetProps, "open" | "onOpenChange">) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button variant="secondary" onClick={() => setOpen(true)}>
        打开出处
      </Button>
      <CitationSheet {...props} open={open} onOpenChange={setOpen} />
    </>
  );
}

const meta = {
  title: "Business/CitationSheet",
  component: CitationSheet,
  args: {
    open: false,
    onOpenChange: () => {},
    citations: [HEARSAY],
    today: TODAY,
    onOpenRelationship,
  },
  render: (args) => <WithTrigger {...args} />,
  parameters: { a11y: { context: "body" } },
} satisfies Meta<typeof CitationSheet>;

export default meta;
type Story = StoryObj<typeof meta>;

const open = async (canvasElement: HTMLElement) => {
  await userEvent.click(within(canvasElement).getByRole("button", { name: "打开出处" }));
};

/** AC-25 / AC-37 / BOT-5 step 2: original text, date and 转述 with who said it. */
export const Single: Story = {
  play: async ({ canvasElement }) => {
    await open(canvasElement);
    const sheet = await screen.findByRole("dialog", { name: "出处 [2]" });
    const s = within(sheet);
    await expect(s.getByRole("img", { name: "可信度：转述 · 据老张说" })).toBeVisible();
    await expect(s.getByText(/因为借钱的事闹掰了/).closest("blockquote")).not.toBeNull();
    await expect(s.getByText("记录 · 今天")).toBeVisible();
    await userEvent.click(s.getByRole("button", { name: "查看张伟与李明的关系" }));
    await expect(onOpenRelationship).toHaveBeenCalledWith(HEARSAY.pair);
  },
};

/** AC-25: a fact with several sources lists all of them. */
export const Multiple: Story = {
  args: { citations: [WITNESSED, HEARSAY] },
  play: async ({ canvasElement }) => {
    await open(canvasElement);
    const sheet = await screen.findByRole("dialog", { name: "出处" });
    const items = within(sheet).getAllByRole("listitem");
    await expect(items).toHaveLength(2);
    await expect(within(items[0]).getByRole("img", { name: "可信度：亲历" })).toBeVisible();
    await expect(items[0]).toHaveTextContent("记录 · 2012 年");
    await expect(
      within(items[1]).getByRole("img", { name: "可信度：转述 · 据老张说" }),
    ).toBeVisible();
  },
};

/** Manual edit entries (AC-26) have no relationship link. */
export const WithoutRelationship: Story = {
  args: {
    citations: [
      {
        index: 1,
        entry_id: "m1",
        entry_excerpt: "手动编辑：生日设为 3 月 5 日",
        occurred_on: "2026-11-16",
        confidence: "witnessed",
      },
    ],
  },
  play: async ({ canvasElement }) => {
    await open(canvasElement);
    const sheet = await screen.findByRole("dialog");
    await expect(within(sheet).queryByRole("button", { name: /查看.*关系/ })).toBeNull();
  },
};

/** Desktop D2: the right panel. */
export const SidePanel: Story = {
  args: { variant: "side-panel" },
  play: async ({ canvasElement }) => {
    await open(canvasElement);
    const panel = await screen.findByRole("dialog", { name: "出处 [2]" });
    await expect(panel.getBoundingClientRect().width).toBe(360);
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  },
};

/**
 * Desktop ≥1200 on 人物 / 关系 / 对话 (D1–D3): the non-modal right column beside the page.
 * No mask, the page stays usable, Esc only closes it from inside.
 */
function Column(props: Omit<CitationSheetProps, "open" | "onOpenChange">) {
  const [open, setOpen] = useState(false);
  const [clicks, setClicks] = useState(0);
  return (
    <div className="flex h-[600px] w-[1000px]">
      <div className="flex flex-1 flex-col items-start gap-sm p-md">
        <Button variant="secondary" onClick={() => setOpen(true)}>
          打开出处
        </Button>
        <Button variant="secondary" onClick={() => setClicks((c) => c + 1)}>
          页面按钮 {clicks}
        </Button>
      </div>
      <CitationSheet {...props} open={open} onOpenChange={setOpen} />
    </div>
  );
}

export const DesktopColumn: Story = {
  name: "Side panel · non-modal (desktop column)",
  args: { variant: "side-panel", modal: false },
  render: (args) => <Column {...args} />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const trigger = canvas.getByRole("button", { name: "打开出处" });
    await userEvent.click(trigger);
    const panel = await canvas.findByRole("dialog", { name: "出处 [2]" });
    await expect(canvasElement).toContainElement(panel);
    await expect(document.querySelector("[data-drawer-mask]")).toBeNull();
    await waitFor(() => expect(panel).toContainElement(document.activeElement as HTMLElement));

    // The page stays interactive and Esc pressed there leaves the panel open.
    const other = canvas.getByRole("button", { name: /页面按钮/ });
    await userEvent.click(other);
    await expect(canvas.getByRole("button", { name: "页面按钮 1" })).toHaveFocus();
    await userEvent.keyboard("{Escape}");
    await new Promise((r) => setTimeout(r, 100));
    await expect(panel).toBeVisible();

    // Esc inside closes it; focus goes back to the trigger.
    within(panel).getByRole("button", { name: "关闭" }).focus();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(canvas.queryByRole("dialog")).toBeNull());
    await waitFor(() => expect(trigger).toHaveFocus());
  },
};
