/** Query hooks for 记录 and 草稿. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Draft } from "../contracts/draft.ts";
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
      }
      return draft;
    },
    enabled: Boolean(id),
    refetchInterval: (q) => (q.state.data?.status === "extracting" ? POLL_MS : false),
  });
}

export function useSubmitEntry() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: Schemas["SubmitEntryRequest"]) =>
      api.post<Schemas["EntrySubmitted"]>("/entries", body),
    onSuccess: (submitted) => {
      qc.setQueryData(keys.draft(submitted.draft.id), submitted.draft);
      qc.setQueryData<Entry[]>(keys.entries, (list) => [submitted.entry, ...(list ?? [])]);
      void qc.invalidateQueries({ queryKey: keys.entries });
    },
    onSettled: () => qc.invalidateQueries({ queryKey: keys.usage }),
  });
}

function useDraftAction(
  path: (id: string) => string,
  method: "post" | "put" = "post",
  afterSuccess?: () => void,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, content }: { id: string; content?: Draft }) =>
      method === "put" ? api.put<DraftOut>(path(id), { content }) : api.post<DraftOut>(path(id)),
    onSuccess: (draft) => {
      qc.setQueryData(keys.draft(draft.id), draft);
      afterSuccess?.();
      if (method === "post") void invalidateGraph(qc);
    },
  });
}

export const useUpdateDraft = () => useDraftAction((id) => `/drafts/${enc(id)}`, "put");
export const useConfirmDraft = () =>
  useDraftAction((id) => `/drafts/${enc(id)}/confirm`, "post", expectSummariesForAll);
export const useDiscardDraft = () => useDraftAction((id) => `/drafts/${enc(id)}/discard`);
export const useRetryDraft = () => useDraftAction((id) => `/drafts/${enc(id)}/retry`);
