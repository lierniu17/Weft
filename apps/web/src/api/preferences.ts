/** 用户偏好 (graph-viz AC-18): 图谱外观, saved to the account. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { GraphThemeName } from "../lib/graph/scene.ts";
import { api, type Schemas } from "./client.ts";
import { keys } from "./keys.ts";

export type Preferences = Schemas["PreferencesOut"];

export function usePreferences() {
  return useQuery({
    queryKey: keys.preferences,
    queryFn: () => api.get<Preferences>("/me/preferences"),
    staleTime: 60_000,
  });
}

/** The 图谱外观 every graph uses; 清蓝 until the preference has loaded. */
export function useGraphTheme(): GraphThemeName {
  return usePreferences().data?.graph_theme ?? "light";
}

export function useUpdatePreferences() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (patch: Schemas["PreferencesPatch"]) =>
      api.patch<Preferences>("/me/preferences", patch),
    onMutate: async (patch) => {
      await qc.cancelQueries({ queryKey: keys.preferences });
      const before = qc.getQueryData<Preferences>(keys.preferences);
      if (patch.graph_theme)
        qc.setQueryData(keys.preferences, { ...before, graph_theme: patch.graph_theme });
      return { before };
    },
    onError: (_e, _patch, ctx) => qc.setQueryData(keys.preferences, ctx?.before),
    onSuccess: (prefs) => qc.setQueryData(keys.preferences, prefs),
  });
}
