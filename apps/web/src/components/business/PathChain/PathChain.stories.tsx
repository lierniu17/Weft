import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, within } from "storybook/test";
import { PathChain } from "./PathChain.tsx";

const meta = {
  title: "Business/PathChain",
  component: PathChain,
  args: {
    persons: [
      { person_id: "me", name: "小明", is_self: true },
      { person_id: "zw", name: "张伟" },
      { person_id: "wf", name: "王芳" },
    ],
    onPersonClick: fn(),
  },
} satisfies Meta<typeof PathChain>;

export default meta;
type Story = StoryObj<typeof meta>;

/** BOT-5 step 3: 我 → 张伟 → 王芳, each segment clickable, in order. */
export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const chain = within(canvasElement).getByRole("list", { name: "人脉路径" });
    const steps = within(chain).getAllByRole("button");
    await expect(steps.map((s) => s.querySelector("[data-path-name]")?.textContent)).toEqual([
      "我",
      "张伟",
      "王芳",
    ]);
    await expect(within(steps[0]).getByRole("img", { name: "小明（我）" })).toBeVisible();
    await userEvent.click(steps[1]);
    await expect(args.onPersonClick).toHaveBeenCalledWith(args.persons[1]);
  },
};

/** Up to four hops wrap onto the next line instead of overflowing 375px. */
export const LongPath: Story = {
  args: {
    persons: [
      { person_id: "me", name: "小明", is_self: true },
      { person_id: "a", name: "欧阳娜娜" },
      { person_id: "b", name: "司马相如" },
      { person_id: "c", name: "诸葛孔明" },
      { person_id: "d", name: "上官婉儿" },
    ],
  },
  decorators: [
    (Story) => (
      <div className="w-[300px]">
        <Story />
      </div>
    ),
  ],
  play: async ({ canvasElement }) => {
    const chain = within(canvasElement).getByRole("list", { name: "人脉路径" });
    await expect(chain.scrollWidth).toBeLessThanOrEqual(300);
    await expect(within(chain).getAllByRole("listitem")).toHaveLength(5);
  },
};
