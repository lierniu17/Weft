import { DropdownMenu } from "radix-ui";
import { FiMoreHorizontal, FiTrash2 } from "react-icons/fi";
import type { Category, RelationshipStatus } from "../../../contracts/draft.ts";
import { cx } from "../../../lib/cx.ts";
import { useTruncated } from "../../../lib/useTruncated.ts";
import { Avatar } from "../../basics/Avatar/Avatar.tsx";
import { Button } from "../../basics/Button/Button.tsx";
import { IconButton } from "../../basics/IconButton/IconButton.tsx";
import { Skeleton } from "../../basics/Skeleton/Skeleton.tsx";
import { Tooltip } from "../../basics/Tooltip/Tooltip.tsx";
import { RelationStatusTag } from "../RelationStatusTag/RelationStatusTag.tsx";
import { RelationshipTypeTag } from "../RelationshipTypeTag/RelationshipTypeTag.tsx";

export type PersonHeaderProps = {
  name: string;
  aliases?: string[];
  isSelf?: boolean;
  /** 认识时长, e.g. 「认识 6 年」. */
  knownFor?: string;
  /** Relationship types with 本人. */
  relationTypes?: {
    category: Category;
    subtype: string;
    original?: string | null;
    custom?: boolean;
  }[];
  status?: RelationshipStatus;
  /** 亲密度 · 信任 summary, e.g. 「亲近 · 信任高」. */
  feelingSummary?: string;
  onEdit?: () => void;
  /** ⋯ → 删除人物; never offered for 本人 (AC-27). */
  onDelete?: () => void;
  loading?: boolean;
  className?: string;
};

/** 人物页顶部: name, aliases, relationship summary with me, 编辑 and ⋯ menu. */
export function PersonHeader({
  name,
  aliases = [],
  isSelf,
  knownFor,
  relationTypes = [],
  status,
  feelingSummary,
  onEdit,
  onDelete,
  loading,
  className,
}: PersonHeaderProps) {
  const [nameRef, truncated] = useTruncated<HTMLHeadingElement>();
  const shell = cx(
    "flex flex-col gap-sm border-b border-neutral-divider bg-neutral-bg-container px-md pt-sm pb-md",
    className,
  );

  if (loading) {
    return (
      <div
        data-person-header=""
        role="status"
        aria-busy="true"
        aria-label="正在加载人物"
        className={shell}
      >
        <div className="flex items-center gap-md">
          <Skeleton variant="avatar" size="lg" />
          <div className="flex flex-1 flex-col gap-sm">
            <Skeleton width="40%" />
            <Skeleton width="60%" />
          </div>
        </div>
        <Skeleton width="70%" />
      </div>
    );
  }

  const canDelete = !isSelf && Boolean(onDelete);
  const meta = [aliases.length ? `别名：${aliases.join("、")}` : null, knownFor]
    .filter(Boolean)
    .join(" · ");
  const heading = (
    <h2
      ref={nameRef}
      tabIndex={truncated ? 0 : undefined}
      className="focus-ring truncate text-h1 text-neutral-text-primary"
    >
      {name}
    </h2>
  );

  return (
    <div data-person-header="" className={shell}>
      <div className="flex items-center gap-md">
        <Avatar name={name} variant={isSelf ? "self" : "initial"} size="lg" />
        <div className="flex min-w-[0] flex-1 flex-col">
          {truncated ? <Tooltip content={name}>{heading}</Tooltip> : heading}
          {meta && <p className="truncate text-body-sm text-neutral-text-secondary">{meta}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-xs">
          {onEdit && (
            <Button variant="ghost" size="sm" onClick={onEdit}>
              编辑
            </Button>
          )}
          {canDelete && (
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <IconButton aria-label="更多操作" icon={<FiMoreHorizontal />} />
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  align="end"
                  sideOffset={4}
                  className="z-50 min-w-[140px] animate-fade-in rounded-md border border-neutral-divider bg-neutral-bg-container p-xs shadow-card"
                >
                  <DropdownMenu.Item
                    onSelect={() => onDelete?.()}
                    className="flex cursor-pointer items-center gap-sm rounded-sm px-sm py-sm text-body-sm text-status-error-6 outline-none data-[highlighted]:bg-status-error-1"
                  >
                    <FiTrash2 aria-hidden="true" />
                    删除人物
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          )}
        </div>
      </div>
      {(relationTypes.length > 0 || status || feelingSummary) && (
        <div className="flex flex-wrap gap-xs">
          {relationTypes.map((t) => (
            <RelationshipTypeTag key={`${t.category}-${t.subtype}`} {...t} />
          ))}
          {status && <RelationStatusTag status={status} />}
          {feelingSummary && (
            <span className="inline-flex h-[24px] items-center rounded-full bg-primary-1 px-sm text-caption text-primary-7">
              {feelingSummary}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
