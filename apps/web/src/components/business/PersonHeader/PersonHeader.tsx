import { DropdownMenu } from "radix-ui";
import { FiChevronRight, FiMoreHorizontal, FiTrash2 } from "react-icons/fi";
import type { Category, RelationshipStatus } from "../../../contracts/draft.ts";
import { cx } from "../../../lib/cx.ts";
import { useTruncated } from "../../../lib/useTruncated.ts";
import { Avatar } from "../../basics/Avatar/Avatar.tsx";
import { Button } from "../../basics/Button/Button.tsx";
import { Chip } from "../../basics/Chip/Chip.tsx";
import { IconButton } from "../../basics/IconButton/IconButton.tsx";
import { Skeleton } from "../../basics/Skeleton/Skeleton.tsx";
import { Tooltip } from "../../basics/Tooltip/Tooltip.tsx";
import { RelationStatusTag } from "../RelationStatusTag/RelationStatusTag.tsx";

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
  /** 编辑 beside the name; the person page leaves it out on phones (it moves to the NavBar). */
  onEdit?: () => void;
  /** 「我和他的关系 ›」 under the tags: opens the relationship page with 本人. */
  onOpenRelationship?: () => void;
  /** ⋯ → 删除人物; never offered for 本人 (AC-27). */
  onDelete?: () => void;
  /** The person page's own title is the h1; elsewhere (the chat's right column) an h2. */
  headingLevel?: 1 | 2;
  loading?: boolean;
  className?: string;
};

/**
 * 人物页顶部 (style refresh AC-9): a big avatar, the name as the page's h1, one line of
 * relation (别名 · 关系类型 · 认识时长; it wraps, never truncates) and at most two tags
 * (关系状态, 亲密度 · 信任), then 「我和他的关系 ›」; 编辑 and the ⋯ menu on the right.
 * No border, no fill — it sits on the page.
 */
export function PersonHeader({
  name,
  aliases = [],
  isSelf,
  knownFor,
  relationTypes = [],
  status,
  feelingSummary,
  onEdit,
  onOpenRelationship,
  onDelete,
  headingLevel = 1,
  loading,
  className,
}: PersonHeaderProps) {
  const [nameRef, truncated] = useTruncated<HTMLHeadingElement>();
  const shell = cx("flex flex-col gap-md", className);

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
  const types = [...new Set(relationTypes.map((t) => t.subtype))].join("、");
  const meta = [aliases.join("、"), types, knownFor].filter(Boolean).join(" · ");
  const Heading = `h${headingLevel}` as const;
  const heading = (
    <Heading
      ref={nameRef}
      tabIndex={truncated ? 0 : undefined}
      className="focus-ring truncate text-h1 text-neutral-text-primary"
    >
      {name}
    </Heading>
  );
  // At most two tags: the state of the relationship, then how close it is.
  const tags = [
    status ? <RelationStatusTag key="status" status={status} /> : null,
    feelingSummary ? <Chip key="feeling">{feelingSummary}</Chip> : null,
  ].filter(Boolean);

  return (
    <div data-person-header="" className={shell}>
      <div className="flex items-center gap-md">
        <Avatar
          name={name}
          variant={isSelf ? "self" : "initial"}
          size="lg"
          className="size-[64px]"
        />
        <div className="flex min-w-[0] flex-1 flex-col">
          {truncated ? <Tooltip content={name}>{heading}</Tooltip> : heading}
          {meta && (
            <p data-person-relation="" className="break-words text-meta text-neutral-text-tertiary">
              {meta}
            </p>
          )}
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
                  className="z-50 min-w-[140px] animate-fade-in rounded-md border border-neutral-divider bg-neutral-bg-container p-xs shadow-md data-[state=closed]:animate-fade-out"
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
      {tags.length > 0 && (
        <div data-person-tags="" className="flex flex-wrap gap-sm">
          {tags}
        </div>
      )}
      {onOpenRelationship && (
        <button
          type="button"
          onClick={onOpenRelationship}
          className="motion-colors focus-ring -mt-xs flex cursor-pointer items-center gap-[2px] self-start rounded-sm text-body-sm text-neutral-text-secondary hover:text-neutral-text-primary"
        >
          我和他的关系
          <FiChevronRight aria-hidden="true" />
        </button>
      )}
    </div>
  );
}
