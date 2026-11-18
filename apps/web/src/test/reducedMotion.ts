/**
 * 「减少动态效果」 in story tests (style refresh AC-16). Under Vitest, .storybook/vitest.setup.ts
 * installs a Playwright `emulateMedia` command here; in the plain Storybook UI there is none.
 */
type Emulate = (reduce: boolean) => Promise<void>;

declare global {
  var __weftEmulateReducedMotion: Emulate | undefined;
}

export const canEmulateReducedMotion = () => Boolean(globalThis.__weftEmulateReducedMotion);

export async function emulateReducedMotion(reduce: boolean): Promise<void> {
  await globalThis.__weftEmulateReducedMotion?.(reduce);
}
