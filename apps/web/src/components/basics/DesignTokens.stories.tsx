import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, screen, waitFor, within } from "storybook/test";
import { rgb } from "../../test/color.ts";
import { Avatar } from "./Avatar/Avatar.tsx";
import { Button } from "./Button/Button.tsx";
import { Chip } from "./Chip/Chip.tsx";
import { Drawer } from "./Drawer/Drawer.tsx";
import { Input } from "./Input/Input.tsx";

/**
 * AC-UI-4 (basics part): computed styles of the basics match DESIGN.md.
 * Expected values are literals copied from the spec, not read back from the token
 * module, so a wrong token in the generated CSS turns this story red.
 */
function Specimen() {
  const [open, setOpen] = useState(true);
  return (
    <div className="flex flex-col items-start gap-md">
      <p className="text-body-md">正文 body-md</p>
      <Button>确认入图谱</Button>
      <Input aria-label="称呼" placeholder="怎么称呼你" />
      <Chip>张伟</Chip>
      <Avatar name="张伟" />
      <Drawer open={open} onOpenChange={setOpen} title="确认草稿">
        <p>张伟 · 喜欢钓鱼</p>
      </Drawer>
    </div>
  );
}

const meta = {
  title: "Basics/Design tokens (AC-UI-4)",
  render: () => <Specimen />,
  parameters: { a11y: { context: "body" } },
} satisfies Meta;

export default meta;

export const ComputedStyles: StoryObj<typeof meta> = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // Button: primary bg #4F46E5, radius 6px.
    const button = canvas.getByRole("button", { name: "确认入图谱", hidden: true });
    await expect(getComputedStyle(button).backgroundColor).toBe(rgb("#4F46E5"));
    await expect(getComputedStyle(button).borderRadius).toBe("6px");

    // Input: radius 6px, border #DDE1E8.
    const input = canvas.getByRole("textbox", { name: "称呼", hidden: true });
    await expect(getComputedStyle(input).borderRadius).toBe("6px");
    await expect(getComputedStyle(input).borderTopColor).toBe(rgb("#DDE1E8"));

    // Chip and Avatar: fully rounded.
    const chip = canvas.getByText("张伟", { selector: "span.truncate" }).parentElement;
    await expect(getComputedStyle(chip as HTMLElement).borderRadius).toBe("9999px");
    const avatar = canvas.getByRole("img", { name: "张伟", hidden: true });
    await expect(getComputedStyle(avatar).borderRadius).toBe("9999px");

    // Body text 15px / 22px in the DESIGN.md sans stack; page background #F5F6F8.
    const body = canvas.getByText("正文 body-md");
    await expect(getComputedStyle(body).fontSize).toBe("15px");
    await expect(getComputedStyle(body).lineHeight).toBe("22px");
    await expect(getComputedStyle(body).fontFamily).toMatch(
      /^"PingFang SC", Inter, "Noto Sans SC"/,
    );
    await expect(getComputedStyle(body).color).toBe(rgb("#1D2433"));
    await expect(getComputedStyle(document.documentElement).backgroundColor).toBe(rgb("#F5F6F8"));

    // Drawer bottom-sheet: top corners 16px, container #FFFFFF, handle 36x4.
    const sheet = await screen.findByRole("dialog", { name: "确认草稿" });
    await expect(getComputedStyle(sheet).borderTopLeftRadius).toBe("16px");
    await expect(getComputedStyle(sheet).borderTopRightRadius).toBe("16px");
    await expect(getComputedStyle(sheet).backgroundColor).toBe(rgb("#FFFFFF"));
    const handle = sheet.querySelector("[data-drawer-handle]") as HTMLElement;
    await waitFor(() => expect(handle.getBoundingClientRect().width).toBe(36));
    await expect(handle.getBoundingClientRect().height).toBe(4);
  },
};
