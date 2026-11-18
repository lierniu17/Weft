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
 * Style refresh AC-1 / AC-2 (basics part): computed styles match DESIGN.md (2026-11).
 * Expected values are literals copied from the spec, not read back from the token module,
 * so a wrong token in the generated CSS turns this story red.
 */
function Specimen() {
  const [open, setOpen] = useState(true);
  return (
    <div className="flex flex-col items-start gap-md">
      <h1 className="text-h1">张伟</h1>
      <h2 className="text-section text-neutral-text-tertiary">画像</h2>
      <p className="text-body-md">正文 body-md</p>
      <p className="text-meta text-neutral-text-tertiary">元信息 meta</p>
      <Button>确认入图谱</Button>
      <Button variant="ghost">在图上查看</Button>
      <Input aria-label="称呼" placeholder="怎么称呼你" />
      <Chip>张伟</Chip>
      <Avatar name="张伟" />
      <Drawer open={open} onOpenChange={setOpen} title="确认草稿">
        <p>张伟喜欢钓鱼</p>
      </Drawer>
    </div>
  );
}

const meta = {
  title: "Basics/Design tokens (AC-1 · AC-2)",
  render: () => <Specimen />,
  parameters: { a11y: { context: "body" } },
} satisfies Meta;

export default meta;

const type = (el: Element) => {
  const s = getComputedStyle(el);
  return [s.fontSize, s.lineHeight, s.fontWeight];
};

export const ComputedStyles: StoryObj<typeof meta> = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // AC-2 type scale: h1 24/32 semibold; section 13 semibold tertiary; body 15/24; meta 13.
    await expect(type(canvas.getByRole("heading", { level: 1, hidden: true }))).toEqual([
      "24px",
      "32px",
      "600",
    ]);
    const section = canvas.getByRole("heading", { level: 2, name: "画像", hidden: true });
    await expect(type(section)).toEqual(["13px", "20px", "600"]);
    await expect(getComputedStyle(section).color).toBe(rgb("#71717A"));
    const body = canvas.getByText("正文 body-md");
    await expect(type(body)).toEqual(["15px", "24px", "400"]);
    await expect(getComputedStyle(body).color).toBe(rgb("#18181B"));
    await expect(getComputedStyle(body).fontFamily).toMatch(
      /^"PingFang SC", "HarmonyOS Sans SC", Inter/,
    );
    const metaText = canvas.getByText("元信息 meta");
    await expect(getComputedStyle(metaText).fontSize).toBe("13px");
    await expect(getComputedStyle(metaText).color).toBe(rgb("#71717A"));

    // AC-1: white page; ink only on the primary button; links neutral grey.
    await expect(getComputedStyle(document.documentElement).backgroundColor).toBe(rgb("#FFFFFF"));
    const button = canvas.getByRole("button", { name: "确认入图谱", hidden: true });
    await expect(getComputedStyle(button).backgroundColor).toBe(rgb("#18181B"));
    await expect(getComputedStyle(button).borderRadius).toBe("9999px");
    const link = canvas.getByRole("button", { name: "在图上查看", hidden: true });
    await expect(getComputedStyle(link).color).toBe(rgb("#52525B"));

    // Input: rounded.md, border #E4E4E7.
    const input = canvas.getByRole("textbox", { name: "称呼", hidden: true });
    await expect(getComputedStyle(input).borderRadius).toBe("12px");
    await expect(getComputedStyle(input).borderTopColor).toBe(rgb("#E4E4E7"));

    // AC-3: chip is bg-muted with no outline; chip and avatar fully rounded.
    const chip = canvas.getByText("张伟", { selector: "span.truncate" })
      .parentElement as HTMLElement;
    await expect(getComputedStyle(chip).borderRadius).toBe("9999px");
    await expect(getComputedStyle(chip).backgroundColor).toBe(rgb("#F0F0F2"));
    await expect(getComputedStyle(chip).borderTopColor).toBe("rgba(0, 0, 0, 0)");
    const avatar = canvas.getByRole("img", { name: "张伟", hidden: true });
    await expect(getComputedStyle(avatar).borderRadius).toBe("9999px");

    // Drawer bottom sheet: top corners 24px, white, shadow.lg, handle 36x4.
    const sheet = await screen.findByRole("dialog", { name: "确认草稿" });
    await expect(getComputedStyle(sheet).borderTopLeftRadius).toBe("24px");
    await expect(getComputedStyle(sheet).backgroundColor).toBe(rgb("#FFFFFF"));
    await expect(getComputedStyle(sheet).boxShadow).toContain(
      "rgba(0, 0, 0, 0.1) 0px 12px 32px 0px",
    );
    const handle = sheet.querySelector("[data-drawer-handle]") as HTMLElement;
    await waitFor(() => expect(handle.getBoundingClientRect().width).toBe(36));
    await expect(handle.getBoundingClientRect().height).toBe(4);
  },
};
