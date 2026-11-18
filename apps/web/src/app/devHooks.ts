import type { GraphHandle } from "../components/business/RelationGraph/RelationGraph.tsx";

type E2EWindow = { __weftGraph?: GraphHandle; __weftE2E?: boolean };

/**
 * The page's relationship graph on `window.__weftGraph` (read-only state, where a person
 * is drawn), so e2e:bot can check what is shown and click a person with a real pointer.
 * Dev builds always; built images (stage) only when the test opted in with
 * `window.__weftE2E = true` before load.
 */
export function exposeGraph(graph: GraphHandle) {
  const w = window as unknown as E2EWindow;
  if (import.meta.env.DEV || w.__weftE2E === true) w.__weftGraph = graph;
}
