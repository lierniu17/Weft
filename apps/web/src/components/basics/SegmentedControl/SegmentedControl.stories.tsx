import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { rgb } from "../../../test/color.ts";
import { SegmentedControl, type SegmentedControlProps } from "./SegmentedControl.tsx";

function Controlled(props: SegmentedControlProps) {
  const [value, setValue] = useState(props.value);
  return (
    <SegmentedControl
      {...props}
      value={value}
      onValueChange={(v) => {
        setValue(v);
        props.onValueChange(v);
      }}
    />
  );
}

const meta = {
  title: "Basics/SegmentedControl",
  component: SegmentedControl,
  render: (args) => <Controlled {...args} />,
  args: {
    "aria-label": "输入模式",
    options: [
      { value: "record", label: "记录" },
      { value: "ask", label: "提问" },
    ],
    value: "record",
    onValueChange: fn(),
  },
} satisfies Meta<typeof SegmentedControl>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Medium: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    const group = canvas.getByRole("radiogroup", { name: "输入模式" });
    await expect(group.getBoundingClientRect().height).toBe(32);
    await expect(getComputedStyle(group).borderRadius).toBe("9999px");

    const record = canvas.getByRole("radio", { name: "记录" });
    const ask = canvas.getByRole("radio", { name: "提问" });
    await expect(record).toBeChecked();
    await expect(getComputedStyle(record).color).toBe(rgb("#4F46E5"));

    await userEvent.click(ask);
    await expect(ask).toBeChecked();
    await expect(record).not.toBeChecked();
    await expect(args.onValueChange).toHaveBeenLastCalledWith("ask");

    // Arrow keys move the selection within the radiogroup.
    await userEvent.keyboard("{ArrowLeft}");
    await waitFor(() => expect(record).toBeChecked());
    await expect(record).toHaveFocus();
  },
};

export const SmallThreeOptions: Story = {
  args: {
    size: "sm",
    "aria-label": "人物页分区",
    options: [
      { value: "profile", label: "画像" },
      { value: "relations", label: "关系" },
      { value: "entries", label: "记录" },
    ],
    value: "profile",
  },
  play: async ({ canvasElement }) => {
    const group = within(canvasElement).getByRole("radiogroup", { name: "人物页分区" });
    await expect(group.getBoundingClientRect().height).toBe(28);
    await expect(within(group).getAllByRole("radio")).toHaveLength(3);
  },
};

export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ canvasElement, args }) => {
    const ask = within(canvasElement).getByRole("radio", { name: "提问" });
    await expect(ask).toBeDisabled();
    await userEvent.click(ask);
    await expect(args.onValueChange).not.toHaveBeenCalled();
  },
};
