/**
 * Pure rules of the chat's messages (intent routing, ADR 0005; intent clarify): which 纠正
 * buttons and 反问 options a message shows, and how a part that could not be done is told.
 * The chat page renders from these.
 */
import type { DraftStatus } from "../contracts/draft.ts";
import { quotaMessages } from "./pageModels.ts";

export type Intent = "record" | "ask" | "record_ask" | "chitchat";
export type MessageActionTarget = "record" | "ask";
export type MessageAction = { target: MessageActionTarget; label: string };
/** A 反问 option button: `target` is the option's index in `clarify.options`. */
export type ClarifyChoice = { target: number; label: string };

export type MessageActions = {
  /** Low-key text buttons right under the user's bubble: 改为提问 / 改为记录. */
  bubble: MessageAction[];
  /** Under the reply to a 无关 message without a 反问: 记下来 / 帮我查. */
  reply: MessageAction[];
  /** Under an open 反问: its options (「记下：…」「查：…」), in order. */
  options: ClarifyChoice[];
};

/** The 反问 a 拿不准 message carries (MessageOut.clarify). */
export type MessageClarify = { options: { label: string }[]; resolved: boolean };

const NONE: MessageActions = { bubble: [], reply: [], options: [] };

/**
 * AC-6, AC-10 (intent routing): a 记录 offers 改为提问 until its Draft is confirmed into the
 * graph; a 提问 offers 改为记录; 记录 + 提问 offers neither; a 无关 message (拿不准
 * included) offers 记下来 / 帮我查 under its reply.
 *
 * 反问 (intent clarify AC-1, AC-3, AC-8): a 拿不准 message with a 反问 offers the 反问's
 * options instead of 记下来 / 帮我查 until it is resolved (an option clicked, or answered by
 * the next message), then nothing; once an option has handled it, it offers 纠正 by its new
 * kind like any other message.
 *
 * `draftStatus` is the Draft's live status (it changes while the chat is open); an Entry with
 * no Draft at all is one recorded before drafts existed, so it is in the graph already.
 */
export function messageActions(
  message: { intent: Intent; entry: { draft: unknown } | null; clarify?: MessageClarify | null },
  draftStatus: DraftStatus | undefined,
): MessageActions {
  switch (message.intent) {
    case "record": {
      const inGraph =
        message.entry !== null && (!message.entry.draft || draftStatus === "confirmed");
      return inGraph ? NONE : { ...NONE, bubble: [{ target: "ask", label: "改为提问" }] };
    }
    case "ask":
      return { ...NONE, bubble: [{ target: "record", label: "改为记录" }] };
    case "record_ask":
      return NONE;
    case "chitchat": {
      const clarify = message.clarify;
      if (clarify) {
        return clarify.resolved
          ? NONE
          : { ...NONE, options: clarify.options.map((o, i) => ({ target: i, label: o.label })) };
      }
      return {
        ...NONE,
        reply: [
          { target: "record", label: "记下来" },
          { target: "ask", label: "帮我查" },
        ],
      };
    }
  }
}

/**
 * Which quota a refused 反问 option is about (AC-7): its own kind; a 记录 + 提问 option
 * names the used-up kind in the error (`kind`: entry / ask).
 */
export function optionPart(option: { intent: Intent }, kind: unknown): MessageActionTarget {
  if (option.intent === "record") return "record";
  if (option.intent === "ask") return "ask";
  return kind === "entry" ? "record" : "ask";
}

type Usage = Parameters<typeof quotaMessages>[0];

/**
 * What the chat says about a part of a message that could not be done (AC-7). A used-up
 * quota reads like the composer's quota notice (with what is left of the other kind) while
 * that quota is still used up; afterwards, and for every other problem, the server's text.
 */
export function problemText(
  problem: { part: MessageActionTarget; error: string; message: string },
  usage: Usage,
): string {
  if (problem.error === "quota_exceeded") {
    return quotaMessages(usage)[problem.part] ?? problem.message;
  }
  return problem.message;
}

/** The composer's quota notices: one used up is a notice; both used up blocks sending. */
export function composerQuota(usage: Usage): { notice?: string; blocked?: string } {
  const { record, ask } = quotaMessages(usage);
  if (record && ask)
    return { blocked: "今日已达上限：今天的记录和提问都已用完，北京时间 0 点重置" };
  return { notice: record ?? ask };
}
