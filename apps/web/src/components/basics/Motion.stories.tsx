import type { Meta, StoryObj } from "@storybook/react-vite";
import { useState } from "react";
import { expect, userEvent, within } from "storybook/test";
import { motionMs, staggerDelayMs } from "../../lib/motion.ts";
import { useNumberRoll } from "../../lib/useMotion.ts";
import { canEmulateReducedMotion } from "../../test/reducedMotion.ts";
import { tokens } from "../../tokens.gen.ts";
import { Button } from "./Button/Button.tsx";
import { Chip } from "./Chip/Chip.tsx";
import { Skeleton } from "./Skeleton/Skeleton.tsx";

/**
 * The shared motion system (DESIGN.md §3): page enter, list stagger, press, number roll,
 * skeleton — and 「减少动态效果」 turning all of it off. Expected timings are read from the
 * generated motion tokens, so the stylesheet and DESIGN.md cannot drift apart.
 */
function Quota() {
  const [used, setUsed] = useState(12);
  const [key, roll] = useNumberRoll(used);
  return (
    <p className="text-body-md">
      今日记录{" "}
      <span key={key} data-testid="quota" className={roll}>
        {used}
      </span>{" "}
      / 50
      <Button size="sm" variant="secondary" className="ml-sm" onClick={() => setUsed((n) => n + 1)}>
        再记一条
      </Button>
    </p>
  );
}

function Specimen() {
  return (
    <div data-testid="page" className="motion-page-enter flex flex-col items-start gap-md">
      <ul data-testid="list" className="motion-stagger flex flex-col gap-xs">
        {["张伟", "王芳", "李明", "赵磊", "陈静", "刘洋", "周杰", "吴敏"].map((name) => (
          <li key={name}>{name}</li>
        ))}
      </ul>
      <Button>确认入图谱</Button>
      <Chip onClick={() => {}}>李华（邻居）</Chip>
      <Quota />
      <div className="w-[200px]">
        <Skeleton />
      </div>
    </div>
  );
}

const meta = {
  title: "Basics/Motion (AC-12 · AC-15 · AC-16)",
  render: () => <Specimen />,
  parameters: { motion: true },
} satisfies Meta;

export default meta;
type Story = StoryObj<typeof meta>;

const seconds = (ms: number) => `${ms / 1000}s`;
const m = tokens.motion;

export const Timings: Story = {
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);

    // AC-12 page enter: fade + rise motion.rise, motion.base, decelerate.
    const page = getComputedStyle(canvas.getByTestId("page"));
    await expect(page.animationName).toBe("rise-in");
    await expect(page.animationDuration).toBe(seconds(motionMs("base")));
    await expect(page.animationTimingFunction).toBe(m["easing-decelerate"]);
    await expect(m.rise).toBe("8px");

    // AC-12 list stagger: 30ms apart, the 6th and later share one delay.
    const items = [...canvas.getByTestId("list").children] as HTMLElement[];
    const delays = items.map((li) => getComputedStyle(li).animationDelay);
    await expect(delays).toEqual(items.map((_, i) => seconds(staggerDelayMs(i))));
    await expect(delays.at(-1)).toBe("0.15s");
    await expect(getComputedStyle(items[0]).animationName).toBe("rise-in");

    // AC-15 press: colours and scale transition in motion.fast; :active scales to 0.98.
    const button = canvas.getByRole("button", { name: "确认入图谱" });
    const bs = getComputedStyle(button);
    await expect(bs.transitionDuration.split(", ")[0]).toBe(seconds(motionMs("fast")));
    await expect(bs.transitionProperty).toContain("transform");
    await expect(bs.transitionTimingFunction).toContain(m["easing-standard"]);
    const pressRule = [...document.styleSheets]
      .flatMap((s) => [...s.cssRules])
      .flatMap((r) => ("cssRules" in r ? [r, ...(r as CSSGroupingRule).cssRules] : [r]))
      .map((r) => r.cssText)
      .find((t) => t.includes(":active") && t.includes("--motion-press-scale"));
    await expect(pressRule).toBeTruthy();
    await expect(m["press-scale"]).toBe("0.98");
    // Chips press the same way.
    const chip = getComputedStyle(canvas.getByRole("button", { name: "李华（邻居）" }));
    await expect(chip.transitionProperty).toContain("transform");
    await expect(chip.transitionDuration.split(", ")[0]).toBe(seconds(motionMs("fast")));

    // AC-15 number roll: a new value rolls in from below over motion.emphasis.
    const before = canvas.getByTestId("quota");
    await expect(getComputedStyle(before).animationName).toBe("none");
    await userEvent.click(canvas.getByRole("button", { name: "再记一条" }));
    const after = canvas.getByTestId("quota");
    await expect(after).toHaveTextContent("13");
    await expect(getComputedStyle(after).animationName).toBe("number-roll");
    await expect(getComputedStyle(after).animationDuration).toBe(seconds(motionMs("emphasis")));

    // AC-15 skeleton: soft light/dark cycle every 1.6s.
    const skeleton = canvasElement.querySelector("[data-skeleton]") as HTMLElement;
    await expect(getComputedStyle(skeleton).animationName).toBe("skeleton");
    await expect(getComputedStyle(skeleton).animationDuration).toBe(seconds(motionMs("skeleton")));
    await expect(getComputedStyle(skeleton).animationIterationCount).toBe("infinite");
  },
};

export const ReducedMotion: Story = {
  parameters: { reducedMotion: true },
  play: async ({ canvasElement }) => {
    // Only meaningful where the media feature can be emulated (the Vitest run).
    if (!canEmulateReducedMotion()) return;
    await expect(matchMedia("(prefers-reduced-motion: reduce)").matches).toBe(true);
    const canvas = within(canvasElement);

    // AC-16: no animation and no transition anywhere; the skeleton is still.
    for (const el of [
      canvas.getByTestId("page"),
      ...canvas.getByTestId("list").children,
      canvasElement.querySelector("[data-skeleton]") as HTMLElement,
    ]) {
      await expect(getComputedStyle(el).animationName).toBe("none");
    }
    const button = canvas.getByRole("button", { name: "确认入图谱" });
    await expect(getComputedStyle(button).transitionDuration).toBe("0s");
    await userEvent.click(canvas.getByRole("button", { name: "再记一条" }));
    await expect(getComputedStyle(canvas.getByTestId("quota")).animationName).toBe("none");
    await expect(document.getAnimations().filter((a) => a.playState === "running")).toEqual([]);
  },
};
