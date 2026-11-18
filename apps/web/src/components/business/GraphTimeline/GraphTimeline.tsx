import { Slider } from "radix-ui";
import { FiPause, FiPlay } from "react-icons/fi";
import { cx } from "../../../lib/cx.ts";
import { yearLabel } from "../../../lib/graph/timeline.ts";
import { IconButton } from "../../basics/IconButton/IconButton.tsx";

export type GraphTimelineProps = {
  /** Earliest 认识时间 → today, as fractional years. */
  from: number;
  to: number;
  year: number;
  playing: boolean;
  /** Dragging (or arrow keys) moves the time point and pauses. */
  onSeek: (year: number) => void;
  onTogglePlay: () => void;
  className?: string;
};

/** One month per step: arrow keys move a month, Page Up / Down a year. */
const STEP = 1 / 12;

/**
 * 时间轴 (graph-viz AC-14, AC-15): Slider from the earliest 认识时间 to today, 播放 / 暂停
 * and the current year (「今天」 at the end), digits right-aligned.
 */
export function GraphTimeline({
  from,
  to,
  year,
  playing,
  onSeek,
  onTogglePlay,
  className,
}: GraphTimelineProps) {
  const label = yearLabel(year, to);
  return (
    <div
      data-graph-timeline=""
      className={cx(
        "flex items-center gap-sm rounded-md border border-neutral-divider bg-neutral-bg-container px-sm py-xs",
        className,
      )}
    >
      <IconButton
        aria-label={playing ? "暂停" : "播放"}
        icon={playing ? <FiPause /> : <FiPlay />}
        variant="filled"
        size="sm"
        onClick={onTogglePlay}
      />
      <span className="shrink-0 text-caption text-neutral-text-secondary tabular-nums">
        {Math.floor(from)}
      </span>
      <Slider.Root
        min={from}
        max={to}
        step={STEP}
        value={[year]}
        onValueChange={([v]) => onSeek(v)}
        className="relative flex h-[24px] min-w-[0] flex-1 touch-none items-center select-none"
      >
        <Slider.Track className="relative h-[4px] grow rounded-full bg-neutral-divider">
          <Slider.Range className="absolute h-full rounded-full bg-primary-6" />
        </Slider.Track>
        <Slider.Thumb
          aria-label="时间"
          aria-valuetext={label}
          className="focus-ring block size-[16px] cursor-pointer rounded-full border-2 border-primary-6 bg-neutral-bg-container shadow-sm"
        />
      </Slider.Root>
      <output
        data-timeline-year=""
        className="min-w-[48px] shrink-0 text-right text-body-sm text-neutral-text-primary tabular-nums"
      >
        {label}
      </output>
    </div>
  );
}
