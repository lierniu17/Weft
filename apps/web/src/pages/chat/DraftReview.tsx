/**
 * 确认草稿: the DraftReviewSheet wired to the draft endpoints. Edits stay local until 确认 —
 * or until something the server does needs them saved first (a new 发生日期, an answer to a
 * 补充追问), so the draft that comes back keeps them.
 */
import { useState } from "react";
import { ApiError } from "../../api/client.ts";
import {
  type DraftOut,
  fetchEntry,
  useAnswerDraftQuestion,
  useConfirmDraft,
  useDiscardDraft,
  useDraft,
  useUpdateDraft,
} from "../../api/entries.ts";
import { useTaxonomy } from "../../api/graph.ts";
import { useSheetVariant, useToday } from "../../app/layout.ts";
import { DraftReviewSheet } from "../../components/business/DraftReviewSheet/DraftReviewSheet.tsx";
import type { Draft, QuestionAnswer } from "../../contracts/draft.ts";
import { type OccurredOn, parsePartialDate } from "../../lib/datePrecision.ts";
import {
  choosePerson,
  questionAnswerFeedback,
  removeItem,
  setConfidence,
  setRelationshipType,
} from "../../lib/draft.ts";
import { toPartialDate } from "../../lib/pageModels.ts";

export type DraftReviewProps = {
  draftId: string | null;
  /** The Entry's 发生日期 (contract form). */
  occurredOn: string;
  onClose: () => void;
  onError: (message: string) => void;
  /** `false` on desktop: the review is the chat's right column, not a modal panel. */
  modal?: boolean;
};

export function DraftReview({ draftId, occurredOn, onClose, onError, modal }: DraftReviewProps) {
  const draft = useDraft(draftId ?? undefined);
  const taxonomy = useTaxonomy();
  const update = useUpdateDraft();
  const confirm = useConfirmDraft();
  const discard = useDiscardDraft();
  const answer = useAnswerDraftQuestion();
  const variant = useSheetVariant();
  const today = useToday();
  const [edited, setEdited] = useState<Draft | null>(null);
  /** The 发生日期 as moved in this sheet (the server re-timed the draft for it). */
  const [moved, setMoved] = useState<string | null>(null);
  /** The 补充追问 whose answer is being applied, and typed answers not understood. */
  const [answering, setAnswering] = useState<string | null>(null);
  const [hints, setHints] = useState<Record<string, string>>({});

  const original = (draft.data as DraftOut | undefined)?.content ?? null;
  // Local edits start from the API copy; the parent keys this component by draft id.
  const value = edited ?? original;
  const edit = (fn: (d: Draft) => Draft) =>
    setEdited((d) => {
      const base = d ?? original;
      return base ? fn(base) : base;
    });

  if (!draftId || !value || draft.data?.status !== "pending") return null;

  const fail = (e: unknown) => onError(e instanceof ApiError ? e.message : "操作失败，请稍后再试");

  // AC-9: a new 发生日期 is saved at once with the current edits; the server re-times the
  // draft's relative dates, and the re-timed draft replaces the local copy.
  const onOccurredOnChange = async (next: OccurredOn) => {
    const occurred_on = toPartialDate(next);
    if (occurred_on === (moved ?? occurredOn)) return;
    try {
      await update.mutateAsync({ id: draftId, content: value, occurred_on });
      setEdited(null);
      setMoved(occurred_on);
    } catch (e) {
      fail(e);
    }
  };

  // 补充追问 (conversation context AC-6, AC-7): local edits are saved first, so the
  // answered draft that replaces the local copy keeps them. An occurred answer moved the
  // Entry's 发生日期: the line shows the new one (and the hint to check re-timed dates).
  const onAnswerQuestion = async (questionId: string, how: QuestionAnswer) => {
    const question = value.questions?.find((q) => q.id === questionId);
    if (!question || answering) return;
    setAnswering(questionId);
    setHints(({ [questionId]: _, ...rest }) => rest);
    try {
      if (edited) await update.mutateAsync({ id: draftId, content: edited });
      setEdited(null);
      const out = await answer.mutateAsync({
        draftId,
        questionId,
        field: question.field,
        answer: how,
      });
      if (question.field === "occurred") {
        const picked = "option" in how ? question.options[how.option]?.patch.occurred : null;
        setMoved(picked ?? (await fetchEntry(out.entry_id)).entry.occurred_on);
      }
    } catch (e) {
      if (!(e instanceof ApiError)) {
        fail(e);
        return;
      }
      const feedback = questionAnswerFeedback({
        status: e.status,
        code: e.code,
        message: e.message,
      });
      if (feedback.hint) setHints((h) => ({ ...h, [questionId]: feedback.hint as string }));
      if (feedback.toast) onError(feedback.toast);
      if (feedback.reload) void draft.refetch();
    } finally {
      setAnswering(null);
    }
  };

  const onConfirm = async () => {
    try {
      if (edited) {
        await update.mutateAsync({ id: draftId, content: edited });
      }
      await confirm.mutateAsync({ id: draftId });
      onClose();
    } catch (e) {
      fail(e);
    }
  };

  return (
    <DraftReviewSheet
      open
      onOpenChange={(open) => !open && onClose()}
      variant={variant}
      modal={modal}
      draft={value}
      occurredOn={parsePartialDate(moved ?? occurredOn)}
      onOccurredOnChange={onOccurredOnChange}
      retiming={update.isPending}
      retimed={moved !== null}
      today={today}
      taxonomy={taxonomy.data ?? []}
      onChoosePerson={(id, choice) => edit((d) => choosePerson(d, id, choice))}
      onConfidenceChange={(id, c) => edit((d) => setConfidence(d, id, c))}
      onRemoveItem={(id) => edit((d) => removeItem(d, id))}
      onRelationshipTypeChange={(id, i, t) => edit((d) => setRelationshipType(d, id, i, t))}
      onAnswerQuestion={onAnswerQuestion}
      answering={answering}
      questionHints={hints}
      confirming={update.isPending || confirm.isPending}
      onConfirm={onConfirm}
      onDiscard={() => discard.mutate({ id: draftId }, { onSuccess: onClose, onError: fail })}
    />
  );
}
