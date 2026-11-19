import { type ReactNode, useId, useState } from "react";
import type {
  Confidence,
  Draft,
  DraftItem,
  DraftRelationshipType,
  PersonChoice,
  QuestionAnswer,
} from "../../../contracts/draft.ts";
import type { Taxonomy } from "../../../contracts/taxonomy.ts";
import type { OccurredOn } from "../../../lib/datePrecision.ts";
import { canConfirm, itemSentence, openQuestions, unresolvedPersons } from "../../../lib/draft.ts";
import { Button } from "../../basics/Button/Button.tsx";
import { DatePicker } from "../../basics/DatePicker/DatePicker.tsx";
import { Drawer, type DrawerVariant } from "../../basics/Drawer/Drawer.tsx";
import { Modal } from "../../basics/Modal/Modal.tsx";
import { SectionHeader } from "../../composites/SectionHeader/SectionHeader.tsx";
import { DraftFactItem } from "../DraftFactItem/DraftFactItem.tsx";
import { DraftQuestionItem } from "../DraftQuestionItem/DraftQuestionItem.tsx";
import { PersonMatchItem } from "../PersonMatchItem/PersonMatchItem.tsx";
import { RelationshipTypeEditor } from "./RelationshipTypeEditor.tsx";

export type DraftReviewSheetProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Mobile bottom sheet, desktop right panel. */
  variant?: DrawerVariant;
  /** `false`: the desktop right column (side-panel in place, page stays interactive). */
  modal?: boolean;
  draft: Draft;
  /** The Entry's 发生日期: 「发生在：…」 at the top of the sheet. */
  occurredOn: OccurredOn;
  today: Date;
  /**
   * The user picked another 发生日期 (year / month / day, never the future). Omit to show
   * the date read-only.
   */
  onOccurredOnChange?: (value: OccurredOn) => void;
  /** The new 发生日期 is being saved (and the draft re-timed). */
  retiming?: boolean;
  /** The 发生日期 was changed: the draft's relative times were re-timed; ask to check them. */
  retimed?: boolean;
  /** The user's relationship vocabulary (built-in + custom subtypes). */
  taxonomy: Taxonomy;
  onChoosePerson: (personItemId: string, choice: PersonChoice) => void;
  onConfidenceChange: (itemId: string, confidence: Confidence) => void;
  onRemoveItem: (itemId: string) => void;
  onRelationshipTypeChange: (
    itemId: string,
    index: number,
    type: Omit<DraftRelationshipType, "original">,
  ) => void;
  /**
   * A 补充追问 was answered (an option or 自己填). Omit to hide the questions (they are
   * only asked on a pending draft).
   */
  onAnswerQuestion?: (questionId: string, answer: QuestionAnswer) => void;
  /** The question whose answer is being applied. */
  answering?: string | null;
  /** Per question: why its typed answer was not understood, shown under its input. */
  questionHints?: Record<string, string>;
  onConfirm: () => void;
  /** Called after the second confirmation in the danger Modal. */
  onDiscard: () => void;
  confirming?: boolean;
};

function Section({ title, children }: { title: string; children: ReactNode }) {
  const id = useId();
  return (
    <section aria-labelledby={id} className="flex flex-col gap-xs pt-lg first:pt-sm">
      <SectionHeader id={id} title={title} level={3} />
      <ul className="flex flex-col">{children}</ul>
    </section>
  );
}

/**
 * Where a draft is checked before it enters the graph: 「发生在：…」 (tap to change the
 * 发生日期, intent-routing AC-9), persons (with matching), facts,
 * profile changes, relationship changes, feeling changes. Right under 「发生在」, the draft's
 * unanswered 补充追问 (conversation-context AC-5): each with its candidates and 「自己填」;
 * an answered one hides. Leaving them unanswered never blocks 确认 (AC-8). Every item shows a pickable
 * confidence and can be removed. 确认入图谱 stays disabled while any person is 需选择 (AC-12);
 * 放弃 asks again in a danger Modal (AC-17).
 */
export function DraftReviewSheet({
  open,
  onOpenChange,
  variant = "bottom-sheet",
  modal,
  draft,
  occurredOn,
  today,
  onOccurredOnChange,
  retiming,
  retimed,
  taxonomy,
  onChoosePerson,
  onConfidenceChange,
  onRemoveItem,
  onRelationshipTypeChange,
  onAnswerQuestion,
  answering,
  questionHints,
  onConfirm,
  onDiscard,
  confirming,
}: DraftReviewSheetProps) {
  const [discarding, setDiscarding] = useState(false);
  const hintId = useId();
  const unresolved = unresolvedPersons(draft).length;
  const confirmable = canConfirm(draft);
  const questions = onAnswerQuestion ? openQuestions(draft) : [];

  const item = (it: DraftItem, children?: ReactNode) => {
    const conflict = "conflict" in it ? it.conflict : null;
    return (
      <DraftFactItem
        key={it.id}
        title={itemSentence(draft, it).text}
        variant={conflict?.action ?? "add"}
        conflictOld={conflict?.old}
        newValue={"object" in it ? it.object : undefined}
        confidence={it.confidence}
        onConfidenceChange={(c) => onConfidenceChange(it.id, c)}
        onRemove={() => onRemoveItem(it.id)}
      >
        {children}
      </DraftFactItem>
    );
  };

  return (
    <>
      <Drawer
        open={open}
        onOpenChange={onOpenChange}
        variant={variant}
        modal={modal}
        title="确认草稿"
        description="确认后才会写进图谱"
        className={variant === "bottom-sheet" ? "h-[92vh]" : undefined}
        footer={
          <div className="flex w-full flex-col gap-sm">
            {unresolved > 0 && (
              <p id={hintId} className="text-caption text-status-error-6">
                还有 {unresolved} 个人物需要先选择
              </p>
            )}
            <div className="flex gap-sm">
              <Button
                variant="secondary"
                size="lg"
                className="flex-1"
                onClick={() => setDiscarding(true)}
              >
                放弃
              </Button>
              <Button
                size="lg"
                className="flex-1"
                disabled={!confirmable}
                loading={confirming}
                aria-describedby={unresolved > 0 ? hintId : undefined}
                onClick={onConfirm}
              >
                确认入图谱
              </Button>
            </div>
          </div>
        }
      >
        <div data-occurred="" className="flex flex-col gap-xs pt-sm">
          <DatePicker
            trigger="line"
            prefix="发生在"
            value={occurredOn}
            onChange={(v) => onOccurredOnChange?.(v)}
            today={today}
            disabled={!onOccurredOnChange || retiming}
            className="self-start"
          />
          {retimed && (
            <p role="status" className="text-meta text-neutral-text-secondary">
              已按新的发生日期重新换算草稿里的时间，请检查一遍
            </p>
          )}
        </div>
        {questions.length > 0 && onAnswerQuestion && (
          <Section title="还差一点">
            {questions.map((q) => (
              <DraftQuestionItem
                key={q.id}
                question={q}
                onAnswer={(a) => onAnswerQuestion(q.id, a)}
                pending={answering === q.id}
                disabled={answering != null && answering !== q.id}
                hint={questionHints?.[q.id]}
              />
            ))}
          </Section>
        )}
        {draft.persons.length > 0 && (
          <Section title="涉及的人物">
            {draft.persons.map((p) => (
              <PersonMatchItem key={p.id} person={p} onChoose={(c) => onChoosePerson(p.id, c)} />
            ))}
          </Section>
        )}
        {draft.facts.length > 0 && (
          <Section title="信息">{draft.facts.map((f) => item(f))}</Section>
        )}
        {draft.profile.length > 0 && (
          <Section title="画像变化">{draft.profile.map((p) => item(p))}</Section>
        )}
        {draft.relationships.length > 0 && (
          <Section title="关系变化">
            {draft.relationships.map((r) =>
              item(
                r,
                <RelationshipTypeEditor
                  relationship={r}
                  taxonomy={taxonomy}
                  onChange={(i, t) => onRelationshipTypeChange(r.id, i, t)}
                />,
              ),
            )}
          </Section>
        )}
        {draft.feelings.length > 0 && (
          <Section title="感受变化">{draft.feelings.map((f) => item(f))}</Section>
        )}
        <p className="pt-sm pb-md text-meta text-neutral-text-tertiary">点一条可以改可信度</p>
      </Drawer>
      <Modal
        open={discarding}
        onOpenChange={setDiscarding}
        variant="danger"
        title="放弃这份草稿？"
        description="记录原文会保留并标为已放弃，图谱不会有任何变化。"
        actionText="放弃"
        onAction={() => {
          setDiscarding(false);
          onDiscard();
        }}
      />
    </>
  );
}
