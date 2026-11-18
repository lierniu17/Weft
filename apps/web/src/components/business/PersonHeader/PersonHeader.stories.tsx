import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test";
import { TRANSPARENT, token } from "../../../test/color.ts";
import { PersonHeader } from "./PersonHeader.tsx";

const meta = {
  title: "Business/PersonHeader",
  component: PersonHeader,
  args: {
    name: "张伟",
    aliases: ["老张", "张总"],
    knownFor: "认识 6 年",
    relationTypes: [{ category: "social", subtype: "同事" }],
    status: "active",
    feelingSummary: "亲近 · 信任高",
    onEdit: fn(),
    onDelete: fn(),
  },
  decorators: [
    (Story) => (
      <div className="w-[375px]">
        <Story />
      </div>
    ),
  ],
  parameters: { a11y: { context: "body" } },
} satisfies Meta<typeof PersonHeader>;

export default meta;
type Story = StoryObj<typeof meta>;

/**
 * Style refresh AC-9: big avatar + the name as h1 (24/32 semibold) + one line of relation
 * (别名 · 关系类型 · 认识时长, meta grey) + at most two tags; no border, no fill.
 */
export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const h1 = canvas.getByRole("heading", { level: 1, name: "张伟" });
    await expect(getComputedStyle(h1).fontSize).toBe("24px");
    await expect(getComputedStyle(h1).lineHeight).toBe("32px");
    await expect(getComputedStyle(h1).fontWeight).toBe("600");
    await expect(canvas.getByRole("img", { name: "张伟" })).toBeVisible();
    const relation = canvasElement.querySelector("[data-person-relation]") as HTMLElement;
    await expect(relation).toHaveTextContent(/^老张、张总 · 同事 · 认识 6 年$/);
    await expect(getComputedStyle(relation).color).toBe(token("neutral-text-tertiary"));
    const tags = canvasElement.querySelector("[data-person-tags]") as HTMLElement;
    await expect(tags.children).toHaveLength(2);
    await expect(canvasElement.querySelector("[data-status=active]")).toHaveTextContent("活跃");
    const feeling = canvas.getByText("亲近 · 信任高").parentElement as HTMLElement;
    await expect(getComputedStyle(feeling).backgroundColor).toBe(token("neutral-bg-muted"));
    const header = canvasElement.querySelector("[data-person-header]") as HTMLElement;
    await expect(getComputedStyle(header).backgroundColor).toBe(TRANSPARENT);
    await expect(getComputedStyle(header).borderBottomWidth).toBe("0px");

    await userEvent.click(canvas.getByRole("button", { name: "编辑" }));
    await expect(args.onEdit).toHaveBeenCalled();
  },
};

/** ⋯ menu → 删除人物 (AC-27; the page shows the confirm Modal). */
export const DeleteFromMenu: Story = {
  play: async ({ canvasElement, args }) => {
    await userEvent.click(within(canvasElement).getByRole("button", { name: "更多操作" }));
    const menu = await screen.findByRole("menu");
    await userEvent.click(within(menu).getByRole("menuitem", { name: "删除人物" }));
    await expect(args.onDelete).toHaveBeenCalled();
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
  },
};

/** AC-27 / BOT-7 step 6: 本人 cannot be deleted — no delete action anywhere. */
export const Self: Story = {
  args: {
    name: "小明",
    isSelf: true,
    aliases: [],
    knownFor: undefined,
    relationTypes: [],
    status: undefined,
    feelingSummary: undefined,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("img", { name: "小明（我）" })).toBeVisible();
    await expect(canvas.queryByRole("button", { name: "更多操作" })).toBeNull();
    await expect(canvas.queryByText("删除人物")).toBeNull();
  },
};

const LONG = "欧阳一二三四五六七八九十甲乙丙丁戊己庚辛壬";

/** AC-UI-8: a 20+ character name truncates; focus / hover reveals it. */
export const LongName: Story = {
  args: { name: LONG },
  play: async ({ canvasElement }) => {
    const heading = within(canvasElement).getByRole("heading", { level: 1 });
    await expect(getComputedStyle(heading).textOverflow).toBe("ellipsis");
    await expect(heading.scrollWidth).toBeGreaterThan(heading.clientWidth);
    await userEvent.hover(heading);
    await expect(await screen.findByRole("tooltip")).toHaveTextContent(LONG);
  },
};

/**
 * On phones the person page moves 编辑 to the NavBar: the relation line gets the full width
 * of the column and wraps instead of truncating, even with a realistic 20+ character meta.
 */
export const PhoneLongMeta: Story = {
  args: {
    aliases: ["老张", "张大哥"],
    relationTypes: [
      { category: "social", subtype: "同事" },
      { category: "social", subtype: "朋友" },
    ],
    knownFor: "认识 8 年",
    onEdit: undefined,
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.queryByRole("button", { name: "编辑" })).toBeNull();
    const relation = canvasElement.querySelector("[data-person-relation]") as HTMLElement;
    const META = "老张、张大哥 · 同事、朋友 · 认识 8 年";
    await expect(META.length).toBeGreaterThanOrEqual(20);
    await expect(relation).toHaveTextContent(META);
    await expect(getComputedStyle(relation).textOverflow).not.toBe("ellipsis");
    await expect(getComputedStyle(relation).whiteSpace).not.toBe("nowrap");
    await expect(relation.scrollWidth).toBeLessThanOrEqual(relation.clientWidth);
  },
};

/** 「我和他的关系 ›」 under the tags opens the relationship page; a named, focusable button. */
export const RelationshipLink: Story = {
  args: { onOpenRelationship: fn() },
  play: async ({ canvasElement, args }) => {
    const link = within(canvasElement).getByRole("button", { name: "我和他的关系" });
    const tags = canvasElement.querySelector("[data-person-tags]") as HTMLElement;
    await expect(link.getBoundingClientRect().top).toBeGreaterThanOrEqual(
      tags.getBoundingClientRect().bottom,
    );
    link.focus();
    await userEvent.keyboard("{Enter}");
    await expect(args.onOpenRelationship).toHaveBeenCalledTimes(1);
  },
};

/** AC-UI-3: first load of the person page is a skeleton. */
export const Loading: Story = {
  args: { loading: true },
  play: async ({ canvasElement }) => {
    const header = canvasElement.querySelector("[data-person-header]") as HTMLElement;
    await expect(header).toHaveAttribute("aria-busy", "true");
    await expect(header.querySelector("[data-skeleton=avatar]")).not.toBeNull();
    await expect(within(canvasElement).queryByRole("heading")).toBeNull();
  },
};

/** In the chat's right column the page has its own h1: the name is an h2 there. */
export const InPanel: Story = {
  args: { headingLevel: 2, onEdit: undefined, onDelete: undefined, status: undefined },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("heading", { level: 2, name: "张伟" })).toBeVisible();
    await expect(canvasElement.querySelector("[data-person-tags]")?.children).toHaveLength(1);
  },
};
