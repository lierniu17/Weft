/**
 * Query hooks for 消息 (intent routing, ADR 0005): the chat is the list of messages the user
 * sent, each handled by its 意图 — a 记录 (Entry + Draft), a 提问 (answer), both, or 无关
 * (a short reply). One text box sends them all; 改为记录 / 改为提问 re-routes one in place.
 */
import {
  type InfiniteData,
  useInfiniteQuery,
  useMutation,
  useQueryClient,
} from "@tanstack/react-query";
import type { Answer } from "../contracts/answer.ts";
import { api, enc, type Schemas } from "./client.ts";
import type { DraftOut } from "./entries.ts";
import { keys } from "./keys.ts";

export type MessageEntry = Omit<Schemas["MessageEntryOut"], "draft"> & { draft: DraftOut | null };
export type Message = Omit<Schemas["MessageOut"], "answer" | "entry"> & {
  answer: Answer | null;
  entry: MessageEntry | null;
};
export type MessageProblem = Schemas["ProblemOut"];
export type RerouteTarget = Schemas["RerouteRequest"]["as"];
type MessagePage = { messages: Message[]; has_more: boolean };
type Pages = InfiniteData<MessagePage, string | null>;

/** How many messages a page of the chat holds; older ones load on request. */
export const MESSAGE_PAGE = 20;

/**
 * The chat, newest page first (`pages[0]`); `before` pages back through older messages.
 * Use `chronological` for the flat, oldest-first list.
 */
export function useMessages() {
  return useInfiniteQuery({
    queryKey: keys.messages,
    queryFn: ({ pageParam }) =>
      api.get<MessagePage>(
        `/messages?limit=${MESSAGE_PAGE}${pageParam ? `&before=${enc(pageParam)}` : ""}`,
      ),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => (last.has_more ? (last.messages[0]?.message_id ?? null) : null),
  });
}

/** All loaded messages, oldest first. */
export function chronological(data: InfiniteData<MessagePage, unknown> | undefined): Message[] {
  return [...(data?.pages ?? [])].reverse().flatMap((p) => p.messages);
}

/** A message's Draft goes into the draft cache, where its card polls it while 抽取中. */
function seedDraft(qc: ReturnType<typeof useQueryClient>, message: Message) {
  const draft = message.entry?.draft;
  if (draft) qc.setQueryData(keys.draft(draft.id), draft);
}

export function useSendMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (text: string) => api.post<Message>("/messages", { text }),
    onSuccess: (message) => {
      seedDraft(qc, message);
      qc.setQueryData<Pages>(keys.messages, (data) => {
        if (!data || data.pages.length === 0) {
          return { pages: [{ messages: [message], has_more: false }], pageParams: [null] };
        }
        const [newest, ...older] = data.pages;
        return {
          ...data,
          pages: [{ ...newest, messages: [...newest.messages, message] }, ...older],
        };
      });
      if (message.entry) void qc.invalidateQueries({ queryKey: keys.entries });
      // A typed answer to a 反问 resolves it unless a part was refused (AC-4, AC-7): reload
      // the original as the server has it now, so its options go once it is resolved.
      if (message.clarification_of) void qc.invalidateQueries({ queryKey: keys.messages });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: keys.usage }),
  });
}

/** Replaces one message wherever it is in the loaded pages. */
export function replaceMessage(data: Pages | undefined, message: Message): Pages | undefined {
  if (!data) return data;
  return {
    ...data,
    pages: data.pages.map((p) => ({
      ...p,
      messages: p.messages.map((m) => (m.message_id === message.message_id ? message : m)),
    })),
  };
}

/** 改为记录 / 改为提问 (AC-10): the server re-handles the message; it is replaced in place. */
export function useReroute() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, as }: { id: string; as: RerouteTarget }) =>
      api.post<Message>(`/messages/${enc(id)}/reroute`, { as }),
    onSuccess: (message) => {
      seedDraft(qc, message);
      qc.setQueryData<Pages>(keys.messages, (data) => replaceMessage(data, message));
      // 改为提问 may have discarded the old Draft; 改为记录 made a new Entry.
      void qc.invalidateQueries({ queryKey: keys.entries });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: keys.usage }),
  });
}

/**
 * Clicking an option of a 反问 (intent clarify AC-3): the server handles the message by the
 * option (记下 records the original text, 查 answers the option's question); it is replaced
 * in place, its 反问 resolved. A used-up quota (429) changes nothing: the 反问 stays open.
 */
export function useClarify() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, option }: { id: string; option: number }) =>
      api.post<Message>(`/messages/${enc(id)}/clarify`, { option }),
    onSuccess: (message) => {
      seedDraft(qc, message);
      qc.setQueryData<Pages>(keys.messages, (data) => replaceMessage(data, message));
      if (message.entry) void qc.invalidateQueries({ queryKey: keys.entries });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: keys.usage }),
  });
}

/**
 * 「不接上文」 (conversation-context AC-10): the message's question is answered again without
 * the earlier questions it was read with — one more ask counted — and replaced in place
 * (its 「接着：…」 goes; a 指代确认 may come back instead of an answer).
 */
export function useReanswer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id }: { id: string }) => api.post<Message>(`/messages/${enc(id)}/reanswer`),
    onSuccess: (message) => {
      qc.setQueryData<Pages>(keys.messages, (data) => replaceMessage(data, message));
    },
    onSettled: () => qc.invalidateQueries({ queryKey: keys.usage }),
  });
}
