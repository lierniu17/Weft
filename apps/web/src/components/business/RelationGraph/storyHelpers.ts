/** Shared by the RelationGraph stories: the live graph handle and real clicks on it. */
import { expect, waitFor } from "storybook/test";
import type { GraphHandle } from "./RelationGraph.tsx";

/** The live graph of the current story (a previous story's one is killed). */
export const live: { graph?: GraphHandle } = {};
export const onReady = (g: GraphHandle) => {
  live.graph = g;
};

/** Waits until the current story's graph shows `count` people, then returns its handle. */
export async function ready(count: number): Promise<GraphHandle> {
  await waitFor(() => expect(live.graph?.state().visible).toHaveLength(count), { timeout: 5000 });
  return live.graph as GraphHandle;
}

/** A real click at a person's disc (Sigma picks it on the GPU). */
export async function clickPerson(g: GraphHandle, name: string, settle = true) {
  const id = g.idOf(name);
  const at = id ? g.clientPosition(id) : null;
  if (!at) throw new Error(`no ${name} on the graph`);
  await clickAt(at.x, at.y);
  // Sigma reads two clicks within its double-click timeout as a zoom
  if (settle) await new Promise((r) => setTimeout(r, 350));
}

export async function clickAt(x: number, y: number) {
  const target = document.elementFromPoint(x, y) as HTMLElement;
  const init = { clientX: x, clientY: y, bubbles: true, cancelable: true, button: 0 };
  target.dispatchEvent(new MouseEvent("mousedown", init));
  target.dispatchEvent(new MouseEvent("mouseup", init));
  target.dispatchEvent(new MouseEvent("click", init));
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
