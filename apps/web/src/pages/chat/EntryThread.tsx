/** One Entry in the chat: the record bubble and its draft card, which changes in place. */
import { type Entry, useDraft, useEntry, useRetryDraft } from "../../api/entries.ts";
import { DraftCard } from "../../components/business/DraftCard/DraftCard.tsx";
import { MessageBubble } from "../../components/business/MessageBubble/MessageBubble.tsx";
import { parsePartialDate } from "../../lib/datePrecision.ts";
import { learnedAliases } from "../../lib/pageModels.ts";

export type EntryThreadProps = {
  entry: Entry;
  today: Date;
  /** The draft card's accessible name, unique in the feed (see draftCardLabels). */
  label?: string;
  onReview: (draftId: string) => void;
  onPersonClick: (personId: string) => void;
};

export function EntryThread({ entry, today, label, onReview, onPersonClick }: EntryThreadProps) {
  const draft = useDraft(entry.draft?.id);
  const status = draft.data?.status ?? entry.draft?.status ?? "extracting";
  const detail = useEntry(entry.id, status === "confirmed");
  const retry = useRetryDraft();
  const content = draft.data?.content ?? undefined;

  const persons = (detail.data?.persons ?? [])
    .filter((p) => !p.is_self)
    .map((p) => ({ person_id: p.id, name: p.name }));

  return (
    <li className="flex flex-col gap-sm" data-entry-thread={entry.id}>
      <MessageBubble
        variant="record"
        occurredOn={parsePartialDate(entry.occurred_on)}
        today={today}
      >
        {entry.text}
      </MessageBubble>
      {entry.draft && (
        <DraftCard
          status={status}
          label={label}
          draft={content}
          persons={persons}
          learnedAliases={learnedAliases(detail.data)}
          onReview={() => entry.draft && onReview(entry.draft.id)}
          onRetry={() => entry.draft && retry.mutate({ id: entry.draft.id })}
          retrying={retry.isPending}
          onPersonClick={onPersonClick}
        />
      )}
    </li>
  );
}
