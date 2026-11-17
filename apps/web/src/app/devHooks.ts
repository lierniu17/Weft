import type { Core } from "cytoscape";

/**
 * Dev builds only: the page's Cytoscape instance on `window.__weftCy`, so e2e:bot can find
 * where a person is drawn and click that point with a real pointer (BOT-9).
 */
export function exposeGraph(cy: Core) {
  if (import.meta.env.DEV) (window as unknown as { __weftCy?: Core }).__weftCy = cy;
}
