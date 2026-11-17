import type { Core } from "cytoscape";

type E2EWindow = { __weftCy?: Core; __weftE2E?: boolean };

/**
 * The page's Cytoscape instance on `window.__weftCy`, so e2e:bot can find where a person
 * is drawn and click that point with a real pointer (BOT-9). Dev builds always; built
 * images (stage) only when the test opted in with `window.__weftE2E = true` before load.
 */
export function exposeGraph(cy: Core) {
  const w = window as unknown as E2EWindow;
  if (import.meta.env.DEV || w.__weftE2E === true) w.__weftCy = cy;
}
