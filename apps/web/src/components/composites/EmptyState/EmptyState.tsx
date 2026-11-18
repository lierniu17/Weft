import { cx } from "../../../lib/cx.ts";
import { Button } from "../../basics/Button/Button.tsx";

export type EmptyStateVariant = "first-use" | "no-people" | "not-found";

export type EmptyStateProps = {
  variant: EmptyStateVariant;
  /** Overrides the variant's default sentence. */
  title?: string;
  description?: string;
  /** Guide button text; defaults per variant (first-use has examples instead). */
  actionLabel?: string;
  onAction?: () => void;
  /** first-use: clickable example Entries (「点一个示例试试」). */
  examples?: string[];
  onExample?: (text: string) => void;
  className?: string;
};

const COPY: Record<EmptyStateVariant, { title: string; description: string; action?: string }> = {
  "first-use": {
    title: "随手记下和人有关的事",
    description: "我会整理出人物和关系，你确认后才入图谱",
  },
  "no-people": {
    title: "还没有记录任何人",
    description: "在对话里记一笔，人物会自动出现在这里",
    action: "去记一笔",
  },
  "not-found": {
    title: "这个人物不存在",
    description: "可能已被删除",
    action: "回到人物列表",
  },
};

/**
 * Illustrations drawn from the tokens in ink and greys on a bg-subtle tile: interwoven weft
 * lines, an empty person card, a question mark.
 */
function Illustration({ variant }: { variant: EmptyStateVariant }) {
  return (
    <svg
      aria-hidden="true"
      data-illustration={variant}
      viewBox="0 0 96 96"
      className="size-[96px]"
      fill="none"
      strokeLinecap="round"
    >
      <rect x="4" y="4" width="88" height="88" rx="24" className="fill-neutral-bg-subtle" />
      {variant === "first-use" && (
        <>
          <path
            d="M18 38c14-12 26 12 40 0s20-8 20-8"
            className="stroke-primary-6"
            strokeWidth="4"
          />
          <path
            d="M18 58c14 12 26-12 40 0s20 8 20 8"
            className="stroke-neutral-text-disabled"
            strokeWidth="4"
          />
          <path d="M34 22v52M62 22v52" className="stroke-neutral-border" strokeWidth="3" />
        </>
      )}
      {variant === "no-people" && (
        <>
          <rect
            x="24"
            y="22"
            width="48"
            height="56"
            rx="8"
            className="fill-neutral-bg-container stroke-neutral-border"
            strokeWidth="3"
          />
          <circle cx="48" cy="42" r="8" className="stroke-primary-6" strokeWidth="3" />
          <path d="M34 66c3-8 8-11 14-11s11 3 14 11" className="stroke-primary-6" strokeWidth="3" />
        </>
      )}
      {variant === "not-found" && (
        <>
          <path
            d="M38 36a10 10 0 1 1 14 9c-3 1.5-4 3.5-4 7v3"
            className="stroke-primary-6"
            strokeWidth="5"
          />
          <circle cx="48" cy="66" r="3.5" className="fill-primary-6" />
        </>
      )}
    </svg>
  );
}

/** Empty state: illustration + one sentence + a guide action (AC-UI-3). */
export function EmptyState({
  variant,
  title,
  description,
  actionLabel,
  onAction,
  examples,
  onExample,
  className,
}: EmptyStateProps) {
  const copy = COPY[variant];
  const action = actionLabel ?? copy.action;
  return (
    <section
      aria-label={title ?? copy.title}
      data-empty-state={variant}
      className={cx("flex flex-col items-center gap-md px-lg py-xl text-center", className)}
    >
      <Illustration variant={variant} />
      <div className="flex flex-col gap-xs">
        <h2 className="text-h3 text-neutral-text-primary">{title ?? copy.title}</h2>
        <p className="text-body-sm text-neutral-text-tertiary">{description ?? copy.description}</p>
      </div>
      {examples && examples.length > 0 && (
        <ul
          aria-label="示例记录"
          className="motion-stagger flex w-full max-w-[360px] flex-col gap-sm"
        >
          {examples.map((text) => (
            <li key={text}>
              <button
                type="button"
                onClick={() => onExample?.(text)}
                className="motion-press focus-ring w-full cursor-pointer rounded-md border border-neutral-divider bg-neutral-bg-container px-md py-sm text-left text-body-md text-neutral-text-secondary hover:bg-neutral-bg-subtle hover:text-neutral-text-primary"
              >
                {text}
              </button>
            </li>
          ))}
        </ul>
      )}
      {examples && examples.length > 0 && (
        <p className="text-caption text-neutral-text-tertiary">点一个示例试试</p>
      )}
      {action && onAction && (
        <Button variant="secondary" size="lg" onClick={onAction} className="min-w-[160px]">
          {action}
        </Button>
      )}
    </section>
  );
}
