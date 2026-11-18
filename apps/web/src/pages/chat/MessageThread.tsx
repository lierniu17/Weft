/**
 * One message in the chat (intent routing, ADR 0005): the user's bubble with its low-key
 * 纠正 row, then what the message became — the draft card (记录), the answer (提问), both
 * (draft card first), or a short reply with 记下来 / 帮我查 (无关). Parts that could not be
 * done (a used-up quota, Q&A down) say so in place; the draft card changes in place.
 *
 * 拿不准 with a 反问 (intent clarify): the 反问 and its options take the reply's place; once
 * an option is clicked the question stays above what it became (draft card / answer). A
 * typed answer to a 反问 is an ordinary message, its draft or answer under it.
 */

import { useDraft, useEntry, useRetryDraft } from "../../api/entries.ts";
import type { Usage } from "../../api/graph.ts";
import type { Message, MessageProblem } from "../../api/messages.ts";
import { Banner } from "../../components/basics/Banner/Banner.tsx";
import { Skeleton } from "../../components/basics/Skeleton/Skeleton.tsx";
import {
  AnswerCard,
  type AnswerCardProps,
} from "../../components/business/AnswerCard/AnswerCard.tsx";
import { ChitchatReply } from "../../components/business/ChitchatReply/ChitchatReply.tsx";
import { ClarifyReply } from "../../components/business/ClarifyReply/ClarifyReply.tsx";
import { DraftCard } from "../../components/business/DraftCard/DraftCard.tsx";
import { MessageActions } from "../../components/business/MessageActions/MessageActions.tsx";
import {
  MessageBubble,
  type MessageBubbleVariant,
} from "../../components/business/MessageBubble/MessageBubble.tsx";
import type { Answer } from "../../contracts/answer.ts";
import { parsePartialDate } from "../../lib/datePrecision.ts";
import { type MessageActionTarget, messageActions, problemText } from "../../lib/messages.ts";
import { learnedAliases } from "../../lib/pageModels.ts";

const BUBBLE: Record<Message["intent"], MessageBubbleVariant> = {
  record: "record",
  ask: "question",
  record_ask: "both",
  chitchat: "plain",
};

export type MessageThreadProps = {
  message: Message;
  today: Date;
  usage: Usage | undefined;
  /** The draft card's accessible name, unique in the feed (see draftCardLabels). */
  label?: string;
  onReview: (draftId: string, occurredOn: string) => void;
  onPersonClick: (personId: string) => void;
  onReroute: (target: MessageActionTarget) => void;
  /** The re-route in flight for this message, if any. */
  rerouting?: MessageActionTarget | null;
  /** A 反问 option was clicked: its index (intent clarify AC-3). */
  onClarify: (option: number) => void;
  /** The 反问 option in flight for this message, if any. */
  clarifying?: number | null;
  answerProps: Omit<AnswerCardProps, "answer" | "onCitationOpen" | "onShowOnGraph"> & {
    onCitationOpen: (answer: Answer, index: number) => void;
    onShowOnGraph: (answer: Answer) => void;
  };
};

function Problem({ problem, usage }: { problem: MessageProblem; usage: Usage | undefined }) {
  const text = problemText(problem, usage);
  return problem.error === "quota_exceeded" ? (
    <Banner variant="warning">{text}</Banner>
  ) : (
    <p className="py-xs text-body-md text-status-error-6" role="alert">
      {text}
    </p>
  );
}

export function MessageThread({
  message,
  today,
  usage,
  label,
  onReview,
  onPersonClick,
  onReroute,
  rerouting,
  onClarify,
  clarifying,
  answerProps,
}: MessageThreadProps) {
  const entry = message.entry;
  const draftId = entry?.draft?.id;
  const draft = useDraft(draftId);
  const status = draft.data?.status ?? entry?.draft?.status;
  const detail = useEntry(entry?.id, status === "confirmed");
  const retry = useRetryDraft();
  const actions = messageActions(message, status);
  const problem = (part: MessageActionTarget) => message.problems.find((p) => p.part === part);
  const recordProblem = problem("record");
  const askProblem = problem("ask");
  const { onCitationOpen, onShowOnGraph, ...answerRest } = answerProps;
  const answer = message.answer;
  const clarify = message.clarify;
  const asking =
    rerouting === "ask" ||
    (clarifying != null && clarify?.options[clarifying]?.intent !== "record");

  const persons = (detail.data?.persons ?? [])
    .filter((p) => !p.is_self)
    .map((p) => ({ person_id: p.id, name: p.name }));

  return (
    <li className="flex flex-col gap-sm" data-message-thread={message.message_id}>
      <MessageBubble
        variant={BUBBLE[message.intent]}
        occurredOn={entry ? parsePartialDate(entry.occurred_on) : undefined}
        today={today}
        actions={
          <MessageActions
            label="纠正"
            actions={actions.bubble}
            onAction={onReroute}
            pending={rerouting}
          />
        }
      >
        {message.text}
      </MessageBubble>
      {clarify && (
        <ClarifyReply
          question={clarify.question}
          options={actions.options}
          onOption={onClarify}
          pending={clarifying}
        />
      )}
      {recordProblem && <Problem problem={recordProblem} usage={usage} />}
      {entry?.draft && draftId && (
        <DraftCard
          status={status ?? "extracting"}
          label={label}
          draft={draft.data?.content ?? entry.draft.content ?? undefined}
          persons={persons}
          learnedAliases={learnedAliases(detail.data)}
          onReview={() => onReview(draftId, entry.occurred_on)}
          onRetry={() => retry.mutate({ id: draftId })}
          retrying={retry.isPending}
          onPersonClick={onPersonClick}
        />
      )}
      {answer && (
        <AnswerCard
          answer={answer}
          onCitationOpen={(i) => onCitationOpen(answer, i)}
          onShowOnGraph={() => onShowOnGraph(answer)}
          {...answerRest}
        />
      )}
      {askProblem && <Problem problem={askProblem} usage={usage} />}
      {asking && !answer && <Searching />}
      {message.intent === "chitchat" && !clarify && message.reply && (
        <ChitchatReply
          reply={message.reply}
          actions={actions.reply}
          onAction={onReroute}
          pending={rerouting}
        />
      )}
    </li>
  );
}

/** Answers are never boxed (AC-4): the wait is set on the page too. */
export function Searching({ label = "正在图谱里查找…", name = "正在查找" }) {
  return (
    <div role="status" aria-busy="true" aria-label={name} className="flex flex-col gap-sm py-xs">
      <p className="text-body-md text-neutral-text-secondary">{label}</p>
      <Skeleton width="80%" />
      <Skeleton width="60%" />
    </div>
  );
}
