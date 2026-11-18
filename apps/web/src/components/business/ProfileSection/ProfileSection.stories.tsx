import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, fn, userEvent, within } from "storybook/test";
import { token } from "../../../test/color.ts";
import { type ProfileItem, ProfileSection } from "./ProfileSection.tsx";

const TODAY = new Date(2026, 10, 16);

const meta = {
  title: "Business/ProfileSection",
  component: ProfileSection,
  args: {
    variant: "roles",
    title: "社会角色",
    today: TODAY,
    onItemOpen: fn(),
    items: [
      { id: "r1", text: "腾讯", start: "2026" },
      { id: "r2", text: "字节跳动", start: "2023", end: "2026-10" },
      { id: "r3", text: "北京", note: "城市", start: "2018" },
    ],
  },
  decorators: [
    (Story) => (
      <div className="w-[375px] bg-neutral-bg-container p-md">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof ProfileSection>;

export default meta;
type Story = StoryObj<typeof meta>;

const section = (root: HTMLElement, name: string) => within(root).getByRole("region", { name });

/** AC-22 / BOT-4: every role shows its period; ended ones fold into 「历史」. */
export const Roles: Story = {
  play: async ({ canvasElement, args }) => {
    const s = within(section(canvasElement, "社会角色"));
    await expect(s.getByRole("button", { name: /腾讯.*2026 年 – 至今/ })).toBeVisible();
    await expect(s.getByRole("button", { name: /北京.*城市.*2018 年 – 至今/ })).toBeVisible();
    // History collapsed by default.
    const toggle = s.getByRole("button", { name: "历史（1）" });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await expect(s.queryByText(/字节跳动/)).toBeNull();
    await userEvent.click(toggle);
    await expect(toggle).toHaveAttribute("aria-expanded", "true");
    await expect(
      s.getByRole("button", { name: /字节跳动.*2023 年 – 2026 年 10 月/ }),
    ).toBeVisible();
    // AC-25: any item opens its citation.
    await userEvent.click(s.getByRole("button", { name: /腾讯/ }));
    await expect(args.onItemOpen).toHaveBeenCalledWith("r1");
  },
};

/** AC-15: an unverified value is shown, marked 待核实 in words. */
export const RolesWithUnverified: Story = {
  args: {
    items: [
      { id: "r1", text: "阿里巴巴", start: "2026-10" },
      { id: "r2", text: "腾讯", start: "2026-11", unverified: true },
    ],
  },
  play: async ({ canvasElement }) => {
    const row = within(section(canvasElement, "社会角色")).getByRole("button", { name: /腾讯/ });
    await expect(row).toHaveTextContent("待核实");
    await expect(getComputedStyle(within(row).getByText("待核实")).color).toBe(
      token("status-warning-6"),
    );
  },
};

export const Tags: Story = {
  args: {
    variant: "tags",
    title: "喜好与厌恶",
    items: [
      { id: "t1", text: "钓鱼" },
      { id: "t2", text: "不喝酒" },
    ],
  },
  play: async ({ canvasElement, args }) => {
    const s = within(section(canvasElement, "喜好与厌恶"));
    const chip = s.getByRole("button", { name: "钓鱼" });
    await expect(getComputedStyle(chip).borderTopLeftRadius).toBe("9999px");
    await userEvent.click(chip);
    await expect(args.onItemOpen).toHaveBeenCalledWith("t1");
  },
};

function EditableTags() {
  const [items, setItems] = useState<ProfileItem[]>([
    { id: "t1", text: "急性子" },
    { id: "t2", text: "讲义气" },
  ]);
  return (
    <ProfileSection
      variant="tags"
      title="性格"
      today={TODAY}
      editing
      items={items}
      onItemRemove={(id) => setItems((xs) => xs.filter((x) => x.id !== id))}
      onItemAdd={(text) => setItems((xs) => [...xs, { id: `n${xs.length}`, text }])}
    />
  );
}

/** Editing (S6 ①, BOT-6): tags become removable, a new one can be added. */
export const TagsEditing: Story = {
  render: () => <EditableTags />,
  play: async ({ canvasElement }) => {
    const s = within(section(canvasElement, "性格"));
    await userEvent.click(s.getByRole("button", { name: "移除 急性子" }));
    await expect(s.queryByText("急性子")).toBeNull();
    const input = s.getByRole("textbox", { name: "添加性格" });
    await expect(s.getByRole("button", { name: "添加" })).toBeDisabled();
    await userEvent.type(input, "爱钓鱼{Enter}");
    await expect(s.getByText("爱钓鱼")).toBeVisible();
    await expect(input).toHaveValue("");
  },
};

export const Notes: Story = {
  args: {
    variant: "notes",
    title: "相处之道",
    items: [{ id: "n1", text: "别提他前妻" }],
  },
  play: async ({ canvasElement, args }) => {
    await userEvent.click(
      within(section(canvasElement, "相处之道")).getByRole("button", { name: /别提他前妻/ }),
    );
    await expect(args.onItemOpen).toHaveBeenCalledWith("n1");
  },
};

export const NotesEditing: Story = {
  args: {
    variant: "notes",
    title: "相处之道",
    editing: true,
    onItemChange: fn(),
    onItemRemove: fn(),
    items: [{ id: "n1", text: "别提他前妻" }],
  },
  play: async ({ canvasElement, args }) => {
    const s = within(section(canvasElement, "相处之道"));
    const input = s.getByRole("textbox", { name: "相处之道 1" });
    await userEvent.type(input, "的事");
    await expect(args.onItemChange).toHaveBeenLastCalledWith("n1", "别提他前妻的事");
    await userEvent.click(s.getByRole("button", { name: "删除 别提他前妻" }));
    await expect(args.onItemRemove).toHaveBeenCalledWith("n1");
  },
};

/** 我的评价: italic with a secondary-6 left rule, distinct from facts (AC-23). */
export const Opinion: Story = {
  args: { variant: "opinion", title: undefined, items: [{ id: "o1", text: "靠谱，可以深交" }] },
  play: async ({ canvasElement }) => {
    const s = within(section(canvasElement, "我的评价"));
    const text = s.getByText("靠谱，可以深交");
    const quote = text.closest("[data-opinion]") as HTMLElement;
    await expect(getComputedStyle(quote).fontStyle).toBe("italic");
    await expect(getComputedStyle(quote).borderLeftColor).toBe(token("secondary-6"));
  },
};
