/** One Entry in the chat: the record bubble and its draft card, which changes in place. */
import { type Entry, useDraft, useEntry, useRetryDraft } from "../../api/entries.ts";
import { DraftCard } from "../../components/business/DraftCard/DraftCard.tsx";
import { MessageBubble } from "../../components/business/MessageBubble/MessageBubble.tsx";
import { SELF_ID } from "../../contracts/draft.ts";
import { parsePartialDate } from "../../lib/datePrecision.ts";

export type EntryThreadProps = {
  entry: Entry;
  today: Date;
  onReview: (draftId: string) => void;
  onPersonClick: (personId: string) => void;
};

export function EntryThread({ entry, today, onReview, onPersonClick }: EntryThreadProps) {
  const draft = useDraft(entry.draft?.id);
  const status = draft.data?.status ?? entry.draft?.status ?? "extracting";
  const detail = useEntry(entry.id, status === "confirmed");
  const retry = useRetryDraft();
  const content = draft.data?.content ?? undefined;

  const persons = (detail.data?.persons ?? [])
    .filter((p) => !p.is_self)
    .map((p) => ({ person_id: p.id, name: p.name }));
  // Aliases this confirmation taught: a mention matched to a person under another name.
  const learnedAliases = (content?.persons ?? []).flatMap((p) => {
    if (p.match !== "matched" || !p.person_id || p.person_id === SELF_ID) return [];
    const person = detail.data?.persons.find((x) => x.id === p.person_id);
    return person && person.name !== p.mention && person.aliases.includes(p.mention)
      ? [{ alias: p.mention, name: person.name }]
      : [];
  });

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
          draft={content}
          persons={persons}
          learnedAliases={learnedAliases}
          onReview={() => entry.draft && onReview(entry.draft.id)}
          onRetry={() => entry.draft && retry.mutate({ id: entry.draft.id })}
          retrying={retry.isPending}
          onPersonClick={onPersonClick}
        />
      )}
    </li>
  );
}
