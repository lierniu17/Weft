import { FiArrowRight } from "react-icons/fi";
import type { PersonRef } from "../../../contracts/answer.ts";
import { cx } from "../../../lib/cx.ts";
import { Avatar } from "../../basics/Avatar/Avatar.tsx";

export type PathChainProps = {
  /** Ordered chain, first to last (我 → 张伟 → 王芳). */
  persons: PersonRef[];
  onPersonClick: (person: PersonRef) => void;
  className?: string;
};

/** 人脉路径: Avatar + name joined by arrows; every segment opens that person. */
export function PathChain({ persons, onPersonClick, className }: PathChainProps) {
  return (
    <ol aria-label="人脉路径" className={cx("flex flex-wrap items-center gap-xs", className)}>
      {persons.map((p, i) => (
        <li key={p.person_id} className="flex items-center gap-xs">
          {i > 0 && (
            <FiArrowRight aria-hidden="true" className="shrink-0 text-neutral-text-secondary" />
          )}
          <button
            type="button"
            onClick={() => onPersonClick(p)}
            className="motion-colors focus-ring flex h-[32px] cursor-pointer items-center gap-xs rounded-full border border-neutral-border bg-neutral-bg-container pr-sm pl-xs text-body-sm text-neutral-text-primary hover:bg-neutral-bg-subtle"
          >
            <Avatar name={p.name} variant={p.is_self ? "self" : "initial"} size="sm" />
            <span data-path-name="" className="max-w-[120px] truncate">
              {p.is_self ? "我" : p.name}
            </span>
          </button>
        </li>
      ))}
    </ol>
  );
}
