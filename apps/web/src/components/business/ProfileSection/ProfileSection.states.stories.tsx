import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { token } from "../../../test/color.ts";
import { ProfileSection, type ProfileSectionVariant } from "./ProfileSection.tsx";

const TODAY = new Date(2026, 10, 16);

// A 300-character 综合描述 (AC-UI-8).
const LONG_SUMMARY = "急性子但讲义气的老同事，最近迷上钓鱼，女儿明年高考。"
  .repeat(12)
  .slice(0, 300);

const meta = {
  title: "Business/ProfileSection/States",
  component: ProfileSection,
  args: { variant: "summary", today: TODAY, items: [] },
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

/** AC-UI-8: a 300-character summary clamps to three lines and expands on demand. */
export const SummaryClamp: Story = {
  args: { summary: { text: LONG_SUMMARY, generatedAt: "2026-11-16" } },
  play: async ({ canvasElement }) => {
    await expect(LONG_SUMMARY.length).toBe(300);
    const s = within(within(canvasElement).getByRole("region", { name: "综合描述" }));
    const text = s.getByText(LONG_SUMMARY);
    const box = text.closest("[data-summary]") as HTMLElement;
    await expect(getComputedStyle(box).backgroundColor).toBe(token("neutral-bg-subtle"));
    const line = Number.parseFloat(getComputedStyle(text).lineHeight);
    await expect(text.getBoundingClientRect().height).toBe(line * 3);
    await expect(s.getByText("11-16 生成")).toBeVisible();

    const toggle = s.getByRole("button", { name: "展开" });
    await expect(toggle).toHaveAttribute("aria-expanded", "false");
    await userEvent.click(toggle);
    await expect(text.getBoundingClientRect().height).toBeGreaterThan(line * 3);
    await expect(text.scrollHeight).toBeLessThanOrEqual(text.clientHeight + 1);
    await userEvent.click(s.getByRole("button", { name: "收起" }));
    await expect(text.getBoundingClientRect().height).toBe(line * 3);
  },
};

export const SummaryShort: Story = {
  args: { summary: { text: "讲义气的老同事。", generatedAt: "2026-11-02" } },
  play: async ({ canvasElement }) => {
    const s = within(within(canvasElement).getByRole("region", { name: "综合描述" }));
    await expect(s.queryByRole("button", { name: "展开" })).toBeNull();
    await expect(s.getByText("11-02 生成")).toBeVisible();
  },
};

const SECTIONS: [ProfileSectionVariant, string][] = [
  ["roles", "社会角色"],
  ["tags", "性格"],
  ["tags", "喜好与厌恶"],
  ["notes", "生活事件"],
  ["notes", "相处之道"],
  ["opinion", "我的评价"],
  ["summary", "综合描述"],
];

/** AC-21: sections with nothing yet are shown with 「还没有记录」, never hidden. */
export const Empty: Story = {
  render: () => (
    <div className="flex flex-col gap-lg">
      {SECTIONS.map(([variant, title]) => (
        <ProfileSection key={title} variant={variant} title={title} today={TODAY} items={[]} />
      ))}
    </div>
  ),
  play: async ({ canvasElement }) => {
    for (const [, title] of SECTIONS) {
      const region = within(canvasElement).getByRole("region", { name: title });
      const empty = within(region).getByText("还没有记录");
      // Deviation: text-secondary, since text-disabled fails 4.5:1 (AC-UI-9).
      await expect(getComputedStyle(empty).color).toBe(token("neutral-text-secondary"));
    }
  },
};

/** AC-23: the opinion lives only in 我的评价, never among fact sections. */
export const OpinionSeparateFromFacts: Story = {
  render: () => (
    <div className="flex flex-col gap-lg">
      <ProfileSection
        variant="tags"
        title="性格"
        today={TODAY}
        items={[{ id: "t1", text: "急性子" }]}
        onItemOpen={fn()}
      />
      <ProfileSection
        variant="notes"
        title="相处之道"
        today={TODAY}
        items={[{ id: "n1", text: "别提他前妻" }]}
        onItemOpen={fn()}
      />
      <ProfileSection variant="opinion" today={TODAY} items={[{ id: "o1", text: "靠谱" }]} />
    </div>
  ),
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByText("靠谱")).toHaveLength(1);
    const opinion = canvas.getByRole("region", { name: "我的评价" });
    await expect(opinion).toContainElement(canvas.getByText("靠谱"));
    for (const name of ["性格", "相处之道"]) {
      await expect(canvas.getByRole("region", { name })).not.toHaveTextContent("靠谱");
    }
  },
};
