import type { ReactNode } from "react";
import { cx } from "../../../lib/cx.ts";
import { Badge } from "../../basics/Badge/Badge.tsx";

export type NavItem = {
  value: string;
  label: string;
  icon: ReactNode;
  /** Badge.dot with this accessible meaning (e.g. 「有待确认的草稿」). */
  dot?: string;
};

export type TabBarProps = {
  items: NavItem[];
  value: string;
  onValueChange: (value: string) => void;
  className?: string;
};

/** Mobile bottom navigation (对话 / 人物 / 我的), 56px + safe area. */
export function TabBar({ items, value, onValueChange, className }: TabBarProps) {
  return (
    <nav
      aria-label="主导航"
      className={cx(
        "flex shrink-0 border-t border-neutral-divider bg-neutral-bg-container pb-[env(safe-area-inset-bottom)]",
        className,
      )}
    >
      {items.map((item) => {
        const active = item.value === value;
        return (
          <button
            key={item.value}
            type="button"
            aria-current={active ? "page" : undefined}
            onClick={() => onValueChange(item.value)}
            className={cx(
              "motion-colors focus-ring relative flex h-[56px] flex-1 cursor-pointer flex-col items-center justify-center gap-xs text-caption",
              active ? "font-semibold text-primary-6" : "text-neutral-text-secondary",
            )}
          >
            <span className="relative flex text-h2">
              <span aria-hidden="true" className="flex">
                {item.icon}
              </span>
              {item.dot && (
                <Badge variant="dot" label={item.dot} className="absolute top-[0] -right-xs" />
              )}
            </span>
            <span>{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
}
