import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, fn, screen, userEvent, waitFor, within } from "storybook/test";
import type { OccurredOn } from "../../../lib/datePrecision.ts";
import { DatePicker, type DatePickerProps } from "./DatePicker.tsx";

// Fixed clock: these stories must keep testing the "future" branch after 2026-11-16.
const TODAY = new Date(2026, 10, 16);

function Controlled(props: DatePickerProps) {
  const [value, setValue] = useState<OccurredOn>(props.value);
  return (
    <DatePicker
      {...props}
      value={value}
      onChange={(v) => {
        setValue(v);
        props.onChange(v);
      }}
    />
  );
}

const meta = {
  title: "Basics/DatePicker",
  component: DatePicker,
  render: (args) => <Controlled {...args} />,
  args: {
    today: TODAY,
    value: { precision: "day", year: 2026, month: 11, day: 16 },
    onChange: fn(),
  },
  parameters: { a11y: { context: "body" } },
} satisfies Meta<typeof DatePicker>;

export default meta;
type Story = StoryObj<typeof meta>;

const open = async (canvasElement: HTMLElement, current: RegExp) => {
  await userEvent.click(within(canvasElement).getByRole("button", { name: current }));
  return screen.findByRole("dialog", { name: "发生日期" });
};

export const PrecisionDay: Story = {
  name: "Precision · day (default today)",
  play: async ({ canvasElement, args }) => {
    // Chip trigger shows 「今天」 and opens a bottom sheet.
    const trigger = within(canvasElement).getByRole("button", { name: "发生日期：今天" });
    await expect(trigger).toHaveAttribute("aria-haspopup", "dialog");
    await expect(getComputedStyle(trigger).borderRadius).toBe("9999px");
    const sheet = await open(canvasElement, /今天/);

    await expect(within(sheet).getByRole("radio", { name: "日" })).toBeChecked();
    await expect(
      within(sheet).getByRole("button", { name: "2026 年 11 月 16 日" }),
    ).toHaveAttribute("aria-pressed", "true");
    // Future days cannot be chosen; nor can the user page into next month.
    await expect(within(sheet).getByRole("button", { name: "2026 年 11 月 17 日" })).toBeDisabled();
    await expect(within(sheet).getByRole("button", { name: "下个月" })).toBeDisabled();

    // Pick an earlier day in the previous month.
    await userEvent.click(within(sheet).getByRole("button", { name: "上个月" }));
    await userEvent.click(within(sheet).getByRole("button", { name: "2026 年 10 月 5 日" }));
    await userEvent.click(within(sheet).getByRole("button", { name: "确定" }));

    await expect(args.onChange).toHaveBeenLastCalledWith({
      precision: "day",
      year: 2026,
      month: 10,
      day: 5,
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await expect(
      within(canvasElement).getByRole("button", { name: "发生日期：10-05" }),
    ).toBeVisible();
  },
};

export const PrecisionMonth: Story = {
  name: "Precision · month",
  play: async ({ canvasElement, args }) => {
    const sheet = await open(canvasElement, /今天/);
    await userEvent.click(within(sheet).getByRole("radio", { name: "月" }));

    await expect(within(sheet).getByRole("button", { name: "2026 年 12 月" })).toBeDisabled();
    await expect(within(sheet).getByRole("button", { name: "下一年" })).toBeDisabled();
    await userEvent.click(within(sheet).getByRole("button", { name: "2026 年 10 月" }));
    await userEvent.click(within(sheet).getByRole("button", { name: "确定" }));

    await expect(args.onChange).toHaveBeenLastCalledWith({
      precision: "month",
      year: 2026,
      month: 10,
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await expect(
      within(canvasElement).getByRole("button", { name: "发生日期：2026 年 10 月" }),
    ).toBeVisible();
  },
};

export const PrecisionYear: Story = {
  name: "Precision · year (BOT-12: 2015 年)",
  play: async ({ canvasElement, args }) => {
    const sheet = await open(canvasElement, /今天/);
    await userEvent.click(within(sheet).getByRole("radio", { name: "年" }));

    // No future year is offered as selectable.
    await expect(within(sheet).queryByRole("button", { name: "2027 年" })).toBeNull();
    await expect(within(sheet).getByRole("button", { name: "更晚" })).toBeDisabled();
    await userEvent.click(within(sheet).getByRole("button", { name: "2015 年" }));
    await userEvent.click(within(sheet).getByRole("button", { name: "确定" }));

    await expect(args.onChange).toHaveBeenLastCalledWith({ precision: "year", year: 2015 });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await expect(
      within(canvasElement).getByRole("button", { name: "发生日期：2015 年" }),
    ).toBeVisible();
  },
};

export const YearPaging: Story = {
  args: { value: { precision: "year", year: 2015 } },
  play: async ({ canvasElement }) => {
    const sheet = await open(canvasElement, /2015 年/);
    await expect(within(sheet).getByRole("radio", { name: "年" })).toBeChecked();
    await userEvent.click(within(sheet).getByRole("button", { name: "更早" }));
    await userEvent.click(within(sheet).getByRole("button", { name: "2008 年" }));
    await userEvent.click(within(sheet).getByRole("button", { name: "确定" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await expect(
      within(canvasElement).getByRole("button", { name: "发生日期：2008 年" }),
    ).toBeVisible();
  },
};

export const TodayShortcut: Story = {
  args: { value: { precision: "year", year: 2015 } },
  play: async ({ canvasElement }) => {
    const sheet = await open(canvasElement, /2015 年/);
    await userEvent.click(within(sheet).getByRole("button", { name: "今天" }));
    await userEvent.click(within(sheet).getByRole("button", { name: "确定" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await expect(
      within(canvasElement).getByRole("button", { name: "发生日期：今天" }),
    ).toBeVisible();
  },
};

export const EscCancels: Story = {
  name: "Esc cancels without change",
  play: async ({ canvasElement, args }) => {
    const sheet = await open(canvasElement, /今天/);
    await userEvent.click(within(sheet).getByRole("radio", { name: "年" }));
    await userEvent.click(within(sheet).getByRole("button", { name: "2015 年" }));
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await expect(args.onChange).not.toHaveBeenCalled();
    const trigger = within(canvasElement).getByRole("button", { name: "发生日期：今天" });
    await waitFor(() => expect(trigger).toHaveFocus());
  },
};

export const Disabled: Story = {
  args: { disabled: true },
  play: async ({ canvasElement }) => {
    await expect(
      within(canvasElement).getByRole("button", { name: "发生日期：今天" }),
    ).toBeDisabled();
  },
};
