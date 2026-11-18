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
  /**
   * Sentence layout (style refresh AC-8): the line it qualifies, then the level as trailing
   * grey meta — 「张伟喜欢钓鱼 · 本人说」. With `onChange` the whole line is the menu
   * button, so tapping the row changes the level.
   */
  sentence?: string;
  /** Sentence layout: the leading name to set in bold (the draft card's 「**张伟**喜欢钓鱼」). */
  subject?: string;
  disabled?: boolean;
  className?: string;
};

/**
 * DESIGN.md ConfidenceBadge (2026-11): trailing grey meta text, the label always complete.
 * No fill, no outline — except 推测, a grey dashed outline; 转述 is the one status colour
 * (warning text), since it is the level that needs a second look.
 */
const LOOKS: Record<Confidence, string> = {
  witnessed: "border-transparent text-neutral-text-tertiary",
  self_told: "border-transparent text-neutral-text-tertiary",
  hearsay: "border-transparent text-status-warning-6",
  inferred: "border-dashed border-neutral-border text-neutral-text-tertiary",
};

const BASE =
  "inline-flex h-[20px] shrink-0 items-center gap-xs whitespace-nowrap rounded-full border bg-transparent px-xs text-meta";

const MENU =
  "z-50 flex min-w-[120px] animate-fade-in flex-col gap-xs rounded-md border border-neutral-divider bg-neutral-bg-container p-xs shadow-md data-[state=closed]:animate-fade-out";

function Menu({ level, onChange }: { level: Confidence; onChange: (level: Confidence) => void }) {
  return (
    <DropdownMenu.Portal>
      <DropdownMenu.Content
        align="end"
        sideOffset={4}
        collisionPadding={8}
        aria-label="选择可信度"
        className={MENU}
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
              className="flex cursor-pointer items-center justify-between gap-sm rounded-sm px-xs py-xs outline-none data-[highlighted]:bg-neutral-bg-muted"
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
  );
}

/** 「张伟喜欢钓鱼 · 本人说」: the sentence, then the level in trailing meta grey. */
function SentenceLine({
  level,
  text,
  sentence,
  subject,
  named,
}: {
  level: Confidence;
  text: string;
  sentence: string;
  subject?: string;
  /** The line itself is named (a button): the level is plain text inside it. */
  named?: boolean;
}) {
  const lead = subject && sentence.startsWith(subject) ? subject : "";
  return (
    <>
      <span className="min-w-[0] break-words text-neutral-text-primary">
        {lead && <b className="font-medium">{lead}</b>}
        {sentence.slice(lead.length)}
      </span>
      <span className="whitespace-nowrap text-meta text-neutral-text-tertiary">
        {" · "}
        {named ? (
          <span
            data-confidence={level}
            className={cx("rounded-full border", LOOKS[level], level === "inferred" && "px-xs")}
          >
            {text}
          </span>
        ) : (
          <span
            data-confidence={level}
            role="img"
            aria-label={`可信度：${text}`}
            className={cx("rounded-full border", LOOKS[level], level === "inferred" && "px-xs")}
          >
            <span aria-hidden="true">{text}</span>
          </span>
        )}
      </span>
    </>
  );
}

/** 可信度: 亲历 / 本人说 / 转述 / 推测. */
export function ConfidenceBadge({
  level,
  toldBy,
  onChange,
  sentence,
  subject,
  disabled,
  className,
}: ConfidenceBadgeProps) {
  const text = toldBy ? `${confidenceLabel(level)} · 据${toldBy}说` : confidenceLabel(level);

  if (sentence !== undefined && !onChange) {
    return (
      <span data-confidence-line="" className={cx("inline text-body-md", className)}>
        <SentenceLine level={level} text={text} sentence={sentence} subject={subject} />
      </span>
    );
  }

  if (sentence !== undefined && onChange) {
    return (
      <DropdownMenu.Root>
        <DropdownMenu.Trigger
          data-confidence-line=""
          disabled={disabled}
          aria-label={`${sentence} · ${text}（可信度，点按修改）`}
          className={cx(
            "motion-colors focus-ring -mx-xs block w-[calc(100%+8px)] cursor-pointer rounded-sm px-xs py-xs text-left text-body-md hover:bg-neutral-bg-muted disabled:cursor-not-allowed disabled:opacity-45",
            className,
          )}
        >
          <SentenceLine level={level} text={text} sentence={sentence} subject={subject} named />
        </DropdownMenu.Trigger>
        <Menu level={level} onChange={onChange} />
      </DropdownMenu.Root>
    );
  }

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
          "motion-colors focus-ring cursor-pointer hover:bg-neutral-bg-muted disabled:cursor-not-allowed disabled:opacity-45",
          className,
        )}
      >
        <span>{text}</span>
        <FiChevronDown aria-hidden="true" />
      </DropdownMenu.Trigger>
      <Menu level={level} onChange={onChange} />
    </DropdownMenu.Root>
  );
}
