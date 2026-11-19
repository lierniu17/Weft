/** Query hooks for 记录 and 草稿. Sending goes through 消息 (messages.ts). */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Draft, QuestionAnswer, QuestionField } from "../contracts/draft.ts";
import { api, enc, type Schemas } from "./client.ts";
import { invalidateGraph, keys } from "./keys.ts";
import { expectSummariesForAll } from "./summaryExpectation.ts";

export type Entry = Schemas["EntryOut"];
export type EntryDetail = Schemas["EntryDetailOut"];
export type DraftOut = Omit<Schemas["DraftOut"], "content"> & { content: Draft | null };

/** While a draft is being extracted the card polls it, so its state changes in place. */
const POLL_MS = 1000;

export function useEntries(enabled = true) {
  return useQuery({
    queryKey: keys.entries,
    queryFn: () => api.get<Entry[]>("/entries"),
    enabled,
  });
}

export function useEntry(id: string | undefined, enabled = true) {
  return useQuery({
    queryKey: keys.entry(id ?? ""),
    queryFn: () => api.get<EntryDetail>(`/entries/${enc(id ?? "")}`),
    enabled: Boolean(id) && enabled,
  });
}

export function useDraft(id: string | undefined) {
  const qc = useQueryClient();
  return useQuery({
    queryKey: keys.draft(id ?? ""),
    queryFn: async () => {
      const draft = await api.get<DraftOut>(`/drafts/${enc(id ?? "")}`);
      const previous = qc.getQueryData<DraftOut>(keys.draft(id ?? ""));
      if (previous && previous.status !== draft.status) {
        void qc.invalidateQueries({ queryKey: keys.entries });
        void qc.invalidateQueries({ queryKey: keys.messages });
      }
      return draft;
    },
    enabled: Boolean(id),
    refetchInterval: (q) => (q.state.data?.status === "extracting" ? POLL_MS : false),
  });
}

type DraftActionInput = {
  id: string;
  content?: Draft;
  /** PUT only: move the Entry's 发生日期; the server re-times the Draft's relative dates. */
  occurred_on?: string;
};

function useDraftAction(
  path: (id: string) => string,
  method: "post" | "put" = "post",
  afterSuccess?: () => void,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, content, occurred_on }: DraftActionInput) =>
      method === "put"
        ? api.put<DraftOut>(path(id), { content, ...(occurred_on ? { occurred_on } : {}) })
        : api.post<DraftOut>(path(id)),
    onSuccess: (draft, { occurred_on }) => {
      qc.setQueryData(keys.draft(draft.id), draft);
      afterSuccess?.();
      if (method === "post") void invalidateGraph(qc);
      // A moved 发生日期 shows on the message and in 记录.
      if (occurred_on) {
        void qc.invalidateQueries({ queryKey: keys.messages });
        void qc.invalidateQueries({ queryKey: keys.entries });
      }
    },
  });
}

export const useUpdateDraft = () => useDraftAction((id) => `/drafts/${enc(id)}`, "put");
export const useConfirmDraft = () =>
  useDraftAction((id) => `/drafts/${enc(id)}/confirm`, "post", expectSummariesForAll);
export const useDiscardDraft = () => useDraftAction((id) => `/drafts/${enc(id)}/discard`);
export const useRetryDraft = () => useDraftAction((id) => `/drafts/${enc(id)}/retry`);

type QuestionAnswerInput = {
  draftId: string;
  questionId: string;
  /** The question's field: an occurred answer moves the Entry's 发生日期. */
  field: QuestionField;
  answer: QuestionAnswer;
};

/**
 * 补充追问 (conversation-context AC-6, AC-7): a clicked option is applied by the server
 * without a model call; a typed answer (自己填) is read by one. The answered Draft comes
 * back; no quota is counted. An occurred answer moved the Entry's 发生日期, which the
 * message and 记录 show.
 */
export function useAnswerDraftQuestion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ draftId, questionId, answer }: QuestionAnswerInput) =>
      api.post<DraftOut>(`/drafts/${enc(draftId)}/questions/${enc(questionId)}/answer`, answer),
    onSuccess: (draft, { field }) => {
      qc.setQueryData(keys.draft(draft.id), draft);
      if (field === "occurred") {
        void qc.invalidateQueries({ queryKey: keys.messages });
        void qc.invalidateQueries({ queryKey: keys.entries });
      }
    },
  });
}

/** The Entry as it is now (e.g. its 发生日期 after a 补充追问 moved it). */
export function fetchEntry(id: string) {
  return api.get<EntryDetail>(`/entries/${enc(id)}`);
}
