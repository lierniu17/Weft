import { DropdownMenu } from "radix-ui";
import { FiCheck, FiChevronDown } from "react-icons/fi";
import type { Confidence } from "../../../contracts/draft.ts";
import { CONFIDENCE_LEVELS, confidenceLabel } from "../../../lib/confidence.ts";
import { cx } from "../../../lib/cx.ts";

export type ConfidenceBadgeProps = {
  level: Confidence;
  /** 转述: who said it, shown as 「转述 · 据老张说」. */
  toldBy?: string | null;
  /** Makes the badge a menu button to pick another level (draft items). */
  onChange?: (level: Confidence) => void;
  disabled?: boolean;
  className?: string;
};

/** DESIGN.md ConfidenceBadge variants. Colour is only a hint; the text is always complete. */
const LOOKS: Record<Confidence, string> = {
  witnessed: "bg-primary-1 text-primary-7 border-transparent",
  self_told: "bg-secondary-1 text-secondary-7 border-transparent",
  hearsay: "bg-status-warning-1 text-status-warning-6 border-transparent",
  inferred: "bg-neutral-bg-layout text-neutral-text-secondary border-dashed border-neutral-border",
};

const BASE =
  "inline-flex h-[20px] shrink-0 items-center gap-xs whitespace-nowrap rounded-full border px-sm text-caption";

/** 可信度: 亲历 / 本人说 / 转述 / 推测. */
export function ConfidenceBadge({
  level,
  toldBy,
  onChange,
  disabled,
  className,
}: ConfidenceBadgeProps) {
  const text = toldBy ? `${confidenceLabel(level)} · 据${toldBy}说` : confidenceLabel(level);

  if (!onChange) {
    return (
      <span
        data-confidence={level}
        role="img"
        aria-label={`可信度：${text}`}
        className={cx(BASE, LOOKS[level], className)}
      >
        <span aria-hidden="true">{text}</span>
      </span>
    );
  }

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger
        data-confidence={level}
        disabled={disabled}
        aria-label={`可信度：${text}，点按修改`}
        className={cx(
          BASE,
          LOOKS[level],
          "motion-colors focus-ring cursor-pointer disabled:cursor-not-allowed disabled:opacity-45",
          className,
        )}
      >
        <span>{text}</span>
        <FiChevronDown aria-hidden="true" />
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="end"
          sideOffset={4}
          collisionPadding={8}
          aria-label="选择可信度"
          className="z-50 flex min-w-[120px] animate-fade-in flex-col gap-xs rounded-md border border-neutral-divider bg-neutral-bg-container p-xs shadow-card"
        >
          <DropdownMenu.RadioGroup
            value={level}
            onValueChange={(v) => onChange(v as Confidence)}
            className="flex flex-col gap-xs"
          >
            {CONFIDENCE_LEVELS.map((option) => (
              <DropdownMenu.RadioItem
                key={option}
                value={option}
                className="flex cursor-pointer items-center justify-between gap-sm rounded-sm px-xs py-xs outline-none data-[highlighted]:bg-neutral-bg-layout"
              >
                <span data-confidence={option} className={cx(BASE, LOOKS[option])}>
                  {confidenceLabel(option)}
                </span>
                <DropdownMenu.ItemIndicator>
                  <FiCheck aria-hidden="true" className="text-primary-6" />
                </DropdownMenu.ItemIndicator>
              </DropdownMenu.RadioItem>
            ))}
          </DropdownMenu.RadioGroup>
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
