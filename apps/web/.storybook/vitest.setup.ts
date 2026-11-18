/**
 * Runs before the story tests under Vitest only (not in the Storybook UI): exposes the
 * Playwright media emulation the preview's `reducedMotion` parameter needs.
 */
import { commands } from "vitest/browser";
import "../src/test/reducedMotion.ts";

declare module "vitest/browser" {
  interface BrowserCommands {
    emulateReducedMotion: (reduce: boolean) => Promise<void>;
  }
}

globalThis.__weftEmulateReducedMotion = (reduce: boolean) => commands.emulateReducedMotion(reduce);
