import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test";
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

export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("heading", { level: 2, name: "张伟" })).toBeVisible();
    await expect(canvas.getByRole("img", { name: "张伟" })).toBeVisible();
    await expect(canvas.getByText("别名：老张、张总 · 认识 6 年")).toBeVisible();
    await expect(canvasElement.querySelector("[data-relationship-type]")).toHaveTextContent(
      "社会 · 同事",
    );
    await expect(canvasElement.querySelector("[data-status=active]")).toHaveTextContent("活跃");
    await expect(canvas.getByText("亲近 · 信任高")).toBeVisible();

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
    const heading = within(canvasElement).getByRole("heading", { level: 2 });
    await expect(getComputedStyle(heading).textOverflow).toBe("ellipsis");
    await expect(heading.scrollWidth).toBeGreaterThan(heading.clientWidth);
    await userEvent.hover(heading);
    await expect(await screen.findByRole("tooltip")).toHaveTextContent(LONG);
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
