import type { Meta, StoryObj } from "@storybook/react-vite";
import { expect, fn, userEvent, waitFor, within } from "storybook/test";
import { usePlayback } from "../../../lib/graph/usePlayback.ts";
import { GraphTimeline } from "./GraphTimeline.tsx";

const meta = {
  title: "Business/GraphTimeline",
  component: GraphTimeline,
  args: {
    from: 2012,
    to: 2026 + 10.5 / 12,
    year: 2026 + 10.5 / 12,
    playing: false,
    onSeek: fn(),
    onTogglePlay: fn(),
  },
  decorators: [
    (Story) => (
      <div className="w-[375px]">
        <Story />
      </div>
    ),
  ],
} satisfies Meta<typeof GraphTimeline>;

export default meta;
type Story = StoryObj<typeof meta>;

/** At today: 「今天」, a 播放 button; the slider is keyboard reachable. */
export const AtToday: Story = {
  play: async ({ canvasElement, args }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("status")).toHaveTextContent("今天");
    const thumb = canvas.getByRole("slider", { name: "时间" });
    await expect(thumb).toHaveAttribute("aria-valuetext", "今天");
    thumb.focus();
    await userEvent.keyboard("{Home}");
    await expect(args.onSeek).toHaveBeenCalledWith(2012);
    await userEvent.click(canvas.getByRole("button", { name: "播放" }));
    await expect(args.onTogglePlay).toHaveBeenCalled();
  },
};

export const Playing: Story = {
  args: { year: 2015.4, playing: true },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await expect(canvas.getByRole("button", { name: "暂停" })).toBeVisible();
    await expect(canvas.getByRole("status")).toHaveTextContent("2015 年");
  },
};

function Live({ reducedMotion }: { reducedMotion?: boolean }) {
  const p = usePlayback({ from: 2024, to: 2026 }, { reducedMotion });
  return (
    <GraphTimeline
      from={p.from}
      to={p.to}
      year={p.year}
      playing={p.playing}
      onSeek={p.seek}
      onTogglePlay={p.toggle}
    />
  );
}

/**
 * AC-15: the playback state machine — play from the start (pressing play at today
 * restarts), pause, play again, and at today it stops by itself with 播放 back.
 */
export const PlaybackStateMachine: Story = {
  render: () => <Live />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    const year = () => canvas.getByRole("status").textContent;
    await expect(year()).toBe("今天");
    await userEvent.click(canvas.getByRole("button", { name: "播放" }));
    const pause = await canvas.findByRole("button", { name: "暂停" });
    // restarts from the beginning of the axis
    await waitFor(() => expect(year()).toMatch(/^2024 年$|^2025 年$/));
    await userEvent.click(pause);
    // a frame queued before the click may still land: read once the pause has settled
    await waitFor(() => expect(canvas.getByRole("button", { name: "播放" })).toBeVisible());
    await new Promise((r) => setTimeout(r, 100));
    const paused = canvas.getByRole("slider", { name: "时间" }).getAttribute("aria-valuenow");
    await new Promise((r) => setTimeout(r, 300));
    await expect(canvas.getByRole("slider", { name: "时间" })).toHaveAttribute(
      "aria-valuenow",
      paused,
    );
    await userEvent.click(await canvas.findByRole("button", { name: "播放" }));
    // ~1.5 years per second: 2 years end within ~1.4s
    await waitFor(() => expect(year()).toBe("今天"), { timeout: 10_000 });
    await expect(await canvas.findByRole("button", { name: "播放" })).toBeVisible();
  },
};

/** AC-19: with reduced motion the year jumps a whole year at a time. */
export const ReducedMotionJumpsYears: Story = {
  render: () => <Live reducedMotion />,
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement);
    await userEvent.click(canvas.getByRole("button", { name: "播放" }));
    const seen = new Set<string>();
    await waitFor(
      () => {
        const t = canvas.getByRole("slider", { name: "时间" }).getAttribute("aria-valuenow");
        seen.add(t ?? "");
        expect(canvas.getByRole("status")).toHaveTextContent("今天");
      },
      { timeout: 3000, interval: 20 },
    );
    // only whole years were shown on the way
    for (const v of seen) if (v !== "2026") expect(Number(v) % 1).toBe(0);
  },
};
