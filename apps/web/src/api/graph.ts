/** Query hooks for 人物, 画像, 关系, 图, 词表, 用量 and 问答. */
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { Answer } from "../contracts/answer.ts";
import type { Category } from "../contracts/draft.ts";
import type { Taxonomy } from "../contracts/taxonomy.ts";
import { api, enc, type Schemas } from "./client.ts";
import { invalidateGraph, keys } from "./keys.ts";

export type Person = Schemas["PersonOut"];
export type Profile = Schemas["ProfileOut"];
export type Fact = Schemas["FactOut"];
export type CitationOut = Schemas["CitationOut"];
export type Pair = Schemas["PairOut"];
export type GraphView = Schemas["GraphOut"];
export type Usage = Schemas["UsageOut"];
export type ProfileEdit =
  | Schemas["SetIdentityOp"]
  | Schemas["AddFactOp"]
  | Schemas["UpdateFactOp"]
  | Schemas["DeleteFactOp"];

export function usePersons(q = "") {
  const query = q.trim();
  return useQuery({
    queryKey: keys.persons(query),
    queryFn: () => api.get<Person[]>(query ? `/persons?q=${enc(query)}` : "/persons"),
    placeholderData: keepPreviousData,
  });
}

export function useProfile(id: string | undefined) {
  return useQuery({
    queryKey: keys.person(id ?? ""),
    queryFn: () => api.get<Profile>(`/persons/${enc(id ?? "")}`),
    enabled: Boolean(id),
    // 综合描述 is generated in the background after a confirmation: poll until it arrives.
    refetchInterval: (q) =>
      q.state.data &&
      !q.state.data.summary &&
      q.state.data.facts.length > 0 &&
      q.state.dataUpdateCount < 15
        ? 2000
        : false,
  });
}

export function usePair(a: string | undefined, b: string | undefined) {
  return useQuery({
    queryKey: keys.pair(a ?? "", b ?? ""),
    queryFn: () => api.get<Pair>(`/persons/${enc(a ?? "")}/relationships/${enc(b ?? "")}`),
    enabled: Boolean(a && b && a !== b),
  });
}

export function useLocalGraph(id: string | undefined, hops: 1 | 2) {
  return useQuery({
    queryKey: keys.localGraph(id ?? "", hops),
    queryFn: () => api.get<GraphView>(`/persons/${enc(id ?? "")}/graph?hops=${hops}`),
    enabled: Boolean(id),
    placeholderData: keepPreviousData,
  });
}

/** `filter` is the serialized GraphFilter (lib/graphFilter), the API's own query string. */
export function usePanorama(filter = "") {
  return useQuery({
    queryKey: keys.panorama(filter),
    queryFn: () => api.get<GraphView>(filter ? `/graph?${filter}` : "/graph"),
    placeholderData: keepPreviousData,
  });
}

export function useDeletionImpact(id: string | undefined, enabled: boolean) {
  return useQuery({
    queryKey: keys.deletionImpact(id ?? ""),
    queryFn: () =>
      api.get<Schemas["DeletionImpactOut"]>(`/persons/${enc(id ?? "")}/deletion-impact`),
    enabled: Boolean(id) && enabled,
    staleTime: 0,
  });
}

export function useDeletePerson() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/persons/${enc(id)}`),
    onSuccess: (_, id) => {
      qc.removeQueries({ queryKey: keys.person(id) });
      return invalidateGraph(qc);
    },
  });
}

export function useEditProfile(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (edit: ProfileEdit) =>
      api.patch<Schemas["ProfileEdited"]>(`/persons/${enc(id)}/profile`, edit),
    onSuccess: (edited) => {
      qc.setQueryData(keys.person(id), edited.profile);
      void invalidateGraph(qc);
    },
  });
}

export function useTaxonomy() {
  return useQuery({
    queryKey: keys.taxonomy,
    queryFn: () => api.get<Taxonomy>("/taxonomy"),
    staleTime: 60_000,
  });
}

export function useAddSubtype() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (body: { category: Category; name: string }) =>
      api.post<Taxonomy>("/taxonomy/subtypes", body),
    onSuccess: (t) => qc.setQueryData(keys.taxonomy, t),
  });
}

export function useUsage() {
  return useQuery({ queryKey: keys.usage, queryFn: () => api.get<Usage>("/usage") });
}

export function useAsk() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (question: string) => api.post<Answer>("/ask", { question }),
    onSettled: () => qc.invalidateQueries({ queryKey: keys.usage }),
  });
}
