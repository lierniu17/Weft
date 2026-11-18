import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, fn, userEvent, within } from "storybook/test";
import type { GraphThemeName } from "../../../lib/graph/scene.ts";
import { GraphAppearanceSetting } from "./GraphAppearanceSetting.tsx";

const meta = {
  title: "Business/GraphAppearanceSetting",
  component: GraphAppearanceSetting,
  args: { value: "light", onChange: fn() },
  decorators: [
    (Story) => (
      <div className="w-[375px] bg-neutral-bg-container">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof GraphAppearanceSetting>;

export default meta;
type Story = StoryObj<typeof meta>;

/** AC-18 (style refresh AC-11): the options read 浅色 / 星空, 浅色 by default; 星空 reports it. */
export const Default: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("radiogroup", { name: "图谱外观" })).toBeVisible();
    await expect(canvas.getAllByRole("radio").map((r) => r.textContent)).toEqual(["浅色", "星空"]);
    await expect(canvas.queryByText("清蓝")).toBeNull();
    await expect(canvas.getByRole("radio", { name: "浅色" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
    await userEvent.click(canvas.getByRole("radio", { name: "星空" }));
    await expect(args.onChange).toHaveBeenCalledWith("starfield");
  },
};

function Stateful() {
  const [v, setV] = useState<GraphThemeName>("starfield");
  return <GraphAppearanceSetting value={v} onChange={setV} />;
}

/** Keyboard: arrows move between the two looks. */
export const Keyboard: Story = {
  render: () => <Stateful />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const star = canvas.getByRole("radio", { name: "星空" });
    await expect(star).toHaveAttribute("aria-checked", "true");
    star.focus();
    await userEvent.keyboard("{ArrowLeft}");
    await expect(canvas.getByRole("radio", { name: "浅色" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  },
};
