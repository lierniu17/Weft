import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, screen, userEvent, within } from "storybook/test";
import { PersonRow } from "./PersonRow.tsx";

const meta = {
  title: "Business/PersonRow",
  component: PersonRow,
  args: {
    person: {
      id: "lm",
      name: "李明",
      alias: "小李",
      relation: "大学同学",
      lastMentioned: "3 天前提到",
    },
    onClick: fn(),
  },
  decorators: [
    (Story) => (
      <div className="w-[375px] bg-neutral-bg-container">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof PersonRow>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const row = within(canvasElement).getByRole("button", { name: /李明（小李）/ });
    await expect(row).toHaveTextContent("大学同学 · 3 天前提到");
    await expect(within(row).getByRole("img", { name: "李明" })).toBeVisible();
    await expect(row.querySelectorAll("svg")).toHaveLength(1); // the › chevron
    await userEvent.click(row);
    await expect(args.onClick).toHaveBeenCalledWith("lm");
  },
};

/** 本人 pinned on top: Avatar.self, 「（我）」, subtitle 本人, no chevron (AC-20, BOT-1). */
export const Self: Story = {
  args: { person: { id: "me", name: "小明", isSelf: true } },
  play: async ({ canvasElement }) => {
    const row = within(canvasElement).getByRole("button", { name: /小明（我）/ });
    await expect(row).toHaveTextContent("本人");
    await expect(within(row).getByRole("img", { name: "小明（我）" })).toBeVisible();
    await expect(row.querySelector("svg")).toBeNull();
  },
};

const LONG = "赵一二三四五六七八九十甲乙丙丁戊己庚辛壬癸";

/** AC-UI-8: a 20+ character name stays on one line with an ellipsis; hover shows it all. */
export const LongName: Story = {
  args: {
    person: { id: "z", name: LONG, alias: "老赵", relation: "邻居", lastMentioned: "2 个月前" },
  },
  parameters: { a11y: { context: "body" } },
  play: async ({ canvasElement }) => {
    const title = canvasElement.querySelector("[data-list-item-title]") as HTMLElement;
    await expect(Array.from(LONG).length).toBeGreaterThanOrEqual(20);
    await expect(getComputedStyle(title).textOverflow).toBe("ellipsis");
    await expect(title.scrollWidth).toBeGreaterThan(title.clientWidth);
    await expect(title.getBoundingClientRect().height).toBe(24);
    await userEvent.hover(within(canvasElement).getByRole("button"));
    await expect(await screen.findByRole("tooltip")).toHaveTextContent(`${LONG}（老赵）`);
  },
};

/** AC-UI-3: first load of the person list draws skeleton rows, not a spinner. */
export const Loading: Story = {
  args: { loading: true },
  play: async ({ canvasElement }) => {
    await expect(canvasElement.querySelector("[data-skeleton=avatar]")).not.toBeNull();
    await expect(within(canvasElement).queryByRole("button")).toBeNull();
  },
};
