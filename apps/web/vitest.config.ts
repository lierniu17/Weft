import { storybookTest } from "@storybook/addon-vitest/vitest-plugin";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { playwright } from "@vitest/browser-playwright";
import { defineConfig } from "vitest/config";
import type { BrowserCommand } from "vitest/node";

// Story tests for 「减少动态效果」 (style refresh AC-16) emulate the media feature for real.
const emulateReducedMotion: BrowserCommand<[reduce: boolean]> = async (ctx, reduce) => {
  await ctx.page.emulateMedia({ reducedMotion: reduce ? "reduce" : "no-preference" });
};

// Two projects, run separately:
//   pnpm test:unit     -> unit      (plain node, pure functions + token generator)
//   pnpm test:stories  -> storybook (real browser, every story's play() + axe)
export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: "unit",
          environment: "node",
          include: ["src/**/*.test.ts", "scripts/**/*.test.ts"],
        },
      },
      {
        plugins: [react(), tailwindcss(), storybookTest({ configDir: ".storybook" })],
        optimizeDeps: {
          include: [
            "react-icons/fi",
            "radix-ui",
            "sigma",
            "sigma/rendering",
            "sigma/utils",
            "graphology",
          ],
        },
        test: {
          name: "storybook",
          testTimeout: 30_000,
          // Story files share one browser page; a story emulating 「减少动态效果」 (page-wide
          // media emulation) must not leak into motion assertions of a file running beside it.
          fileParallelism: false,
          setupFiles: ["./.storybook/vitest.setup.ts"],
          browser: {
            enabled: true,
            headless: true,
            provider: playwright(),
            instances: [{ browser: "chromium" }],
            commands: { emulateReducedMotion },
          },
        },
      },
    ],
  },
});
