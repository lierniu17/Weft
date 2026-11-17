import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { RelationshipOverview } from "./RelationshipOverview.tsx";

const TODAY = new Date(2026, 10, 16);

const meta = {
  title: "Business/RelationshipOverview",
  component: RelationshipOverview,
  args: {
    variant: "third-party",
    a: "张伟",
    b: "李明",
    today: TODAY,
    types: [
      { category: "social", subtype: "室友", original: "大学室友" },
      { category: "social", subtype: "朋友", original: "铁哥们" },
    ],
    status: "tense",
    metAt: "2012",
    origin: "大学宿舍",
    introducedBy: null,
    summary: "大学室友，2025 年因借钱的事闹翻，目前关系紧张。",
    confidence: "hearsay",
    onIntroducerClick: fn(),
  },
  decorators: [
    (Story) => (
      <div className="w-[375px] bg-neutral-bg-container">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof RelationshipOverview>;

export default meta;
type Story = StoryObj<typeof meta>;

/** AC-28: a third-party relationship shows its types (with the original words), status and confidence. */
export const ThirdParty: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("heading", { name: "张伟 与 李明" })).toBeVisible();
    await expect(canvasElement).toHaveTextContent("社会 · 室友");
    await expect(canvasElement).toHaveTextContent("“大学室友”");
    await expect(canvasElement).toHaveTextContent("“铁哥们”");
    await expect(canvas.getByText("紧张")).toBeVisible();
    await expect(canvas.getByRole("img", { name: "可信度：转述" })).toBeVisible();
    await expect(canvas.getByText("2012 年")).toBeVisible();
    await expect(canvas.getByText("大学宿舍")).toBeVisible();
    await expect(canvas.getByText("大学室友，2025 年因借钱的事闹翻，目前关系紧张。")).toBeVisible();
  },
};

/** 我和他: no confidence badge, the introducer is a link to their page. */
export const SelfPairWithIntroducer: Story = {
  args: {
    variant: "self-pair",
    a: "我",
    b: "王芳",
    types: [{ category: "interest", subtype: "客户", original: "客户" }],
    status: "active",
    metAt: "2024-03",
    origin: "饭局",
    introducedBy: { id: "zw", name: "张伟" },
    summary: null,
    confidence: "witnessed",
  },
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("heading", { name: "我和他" })).toBeVisible();
    await expect(canvas.queryByRole("img", { name: /可信度/ })).toBeNull();
    await expect(canvas.getByText("2024 年 3 月")).toBeVisible();
    await userEvent.click(canvas.getByRole("button", { name: /张伟/ }));
    await expect(args.onIntroducerClick).toHaveBeenCalledWith("zw");
  },
};

/** Missing fields say 「未记录」 instead of disappearing. */
export const Missing: Story = {
  args: {
    variant: "third-party",
    types: [],
    status: null,
    metAt: null,
    origin: null,
    introducedBy: null,
    summary: null,
    confidence: "inferred",
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getAllByText("未记录")).toHaveLength(4);
    await expect(canvas.getByText("认识时间")).toBeVisible();
    await expect(canvas.getByText("认识途径")).toBeVisible();
    await expect(canvas.getByText("介绍人")).toBeVisible();
    await expect(canvas.getByRole("img", { name: "可信度：推测" })).toBeVisible();
  },
};

/** AC-UI-8: long names and long text stay inside 375px. */
export const LongText: Story = {
  args: {
    a: "欧阳一二三四五六七八九十甲乙丙丁戊己庚辛",
    b: "司马子丑寅卯辰巳午未申酉戌亥东南西北中",
    origin: "在一次非常非常长的跨部门项目复盘会议上，经朋友的朋友的同事介绍认识",
    introducedBy: { id: "x", name: "诸葛甲乙丙丁戊己庚辛壬癸子丑寅卯辰" },
  },
  play: async ({ canvasElement }) => {
    const root = canvasElement.querySelector("[data-relationship-overview]") as HTMLElement;
    await expect(root.scrollWidth).toBeLessThanOrEqual(root.clientWidth + 1);
  },
};
