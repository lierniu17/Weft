import { FiChevronRight } from "react-icons/fi";
import type { Citation, PersonRef } from "../../../contracts/answer.ts";
import { formatPartialDate } from "../../../lib/datePrecision.ts";
import { Button } from "../../basics/Button/Button.tsx";
import { Drawer, type DrawerVariant } from "../../basics/Drawer/Drawer.tsx";
import { ConfidenceBadge } from "../ConfidenceBadge/ConfidenceBadge.tsx";

export type CitationSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** One citation (a [n] mark) or every source of one fact (AC-25). */
  citations: Citation[];
  /** Injected clock for date display. */
  today: Date;
  /** Mobile bottom sheet, desktop right panel. */
  variant?: DrawerVariant;
  /** `false`: the desktop right column (side-panel in place, page stays interactive). */
  modal?: boolean;
  onOpenRelationship?: (pair: [PersonRef, PersonRef]) => void;
};

/** 出处详情: ConfidenceBadge + 记录原文 + 发生日期 + 跳转到相关关系. */
export function CitationSheet({
  open,
  onOpenChange,
  citations,
  today,
  variant = "bottom-sheet",
  modal,
  onOpenRelationship,
}: CitationSheetProps) {
  const title = citations.length === 1 ? `出处 [${citations[0].index}]` : "出处";
  return (
    <Drawer open={open} onOpenChange={onOpenChange} title={title} variant={variant} modal={modal}>
      <ul className="flex flex-col gap-lg pt-xs">
        {citations.map((c) => (
          <li key={`${c.index}-${c.entry_id}`} className="flex flex-col gap-sm">
            <div>
              <ConfidenceBadge level={c.confidence} toldBy={c.told_by} />
            </div>
            <blockquote className="border-l-2 border-neutral-divider pl-sm text-body-md text-neutral-text-primary">
              “{c.entry_excerpt}”
            </blockquote>
            <p className="text-caption text-neutral-text-secondary">
              记录 · {formatPartialDate(c.occurred_on, today)}
            </p>
            {c.pair && onOpenRelationship && (
              <Button
                variant="secondary"
                size="lg"
                className="w-full"
                onClick={() => c.pair && onOpenRelationship(c.pair)}
              >
                查看{c.pair[0].name}与{c.pair[1].name}的关系
                <FiChevronRight aria-hidden="true" />
              </Button>
            )}
          </li>
        ))}
      </ul>
    </Drawer>
  );
}
