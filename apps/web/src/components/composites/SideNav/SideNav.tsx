import { useId } from "react";
import { cx } from "../../../lib/cx.ts";
import { Badge } from "../../basics/Badge/Badge.tsx";
import { Tooltip } from "../../basics/Tooltip/Tooltip.tsx";
import type { NavItem } from "../TabBar/TabBar.tsx";

export type RecentPerson = { id: string; name: string; alias?: string | null };

export type SideNavProps = {
  items: NavItem[];
  value: string;
  onValueChange: (value: string) => void;
  /** 「最近提到」 people under the navigation. */
  recent?: RecentPerson[];
  onRecentClick?: (id: string) => void;
  /** Tablet (768–1199px): icons only, labels move to tooltips; recent people hidden. */
  collapsed?: boolean;
  className?: string;
};

/** Desktop left navigation: 220px, bg-layout, active item primary-1 / primary-7. */
export function SideNav({
  items,
  value,
  onValueChange,
  recent = [],
  onRecentClick,
  collapsed,
  className,
}: SideNavProps) {
  const recentId = useId();
  return (
    <nav
      aria-label="主导航"
      data-collapsed={collapsed || undefined}
      className={cx(
        "flex h-full shrink-0 flex-col gap-lg overflow-y-auto bg-neutral-bg-layout py-md",
        collapsed ? "w-[64px] items-center px-sm" : "w-[220px] px-sm",
        className,
      )}
    >
      <p className={cx("text-h3 text-neutral-text-primary", !collapsed && "px-sm")}>
        {collapsed ? "W" : "Weft"}
      </p>
      <ul className="flex flex-col gap-xs">
        {items.map((item) => {
          const active = item.value === value;
          const button = (
            <button
              type="button"
              aria-current={active ? "page" : undefined}
              aria-label={collapsed ? item.label : undefined}
              onClick={() => onValueChange(item.value)}
              className={cx(
                "motion-colors focus-ring flex h-[40px] w-full cursor-pointer items-center gap-sm rounded-sm px-sm text-body-md",
                collapsed && "justify-center",
                active
                  ? "bg-primary-1 font-semibold text-primary-7"
                  : "text-neutral-text-primary hover:bg-neutral-divider",
              )}
            >
              <span aria-hidden="true" className="flex text-body-lg">
                {item.icon}
              </span>
              {!collapsed && <span className="flex-1 text-left">{item.label}</span>}
              {item.dot && <Badge variant="dot" label={item.dot} />}
            </button>
          );
          return (
            <li key={item.value}>
              {collapsed ? (
                <Tooltip content={item.label} side="right">
                  {button}
                </Tooltip>
              ) : (
                button
              )}
            </li>
          );
        })}
      </ul>
      {!collapsed && recent.length > 0 && (
        <section aria-labelledby={recentId} className="flex flex-col gap-xs">
          <h2 id={recentId} className="px-sm text-caption text-neutral-text-secondary">
            最近提到
          </h2>
          <ul className="flex flex-col">
            {recent.map((p) => (
              <li key={p.id}>
                <button
                  type="button"
                  onClick={() => onRecentClick?.(p.id)}
                  className="motion-colors focus-ring flex h-[32px] w-full cursor-pointer items-center rounded-sm px-sm text-left text-body-sm text-neutral-text-primary hover:bg-neutral-divider"
                >
                  <span className="truncate">
                    {p.name}
                    {p.alias && `（${p.alias}）`}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
    </nav>
  );
}
