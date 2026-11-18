import type { Preview } from "@storybook/react-vite";
import { installInputModality } from "../src/lib/inputModality.ts";
import { emulateReducedMotion } from "../src/test/reducedMotion.ts";
import "../src/styles/index.css";
import "./preview-motion.css";

installInputModality();

const preview: Preview = {
  parameters: {
    layout: "padded",
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
    // An axe violation on any story fails the story test run (incl. colour contrast, AC-3).
    a11y: { test: "error" },
    viewport: {
      options: {
        mobile: { name: "Mobile 375", styles: { width: "375px", height: "812px" } },
        desktop: { name: "Desktop 1280", styles: { width: "1280px", height: "800px" } },
      },
    },
  },
  // `motion: true` keeps real durations (see preview-motion.css); `reducedMotion: true`
  // emulates the system 「减少动态效果」 setting for the story (AC-16).
  beforeEach: async ({ parameters }) => {
    const root = document.documentElement;
    if (parameters.motion) root.dataset.motion = "on";
    else delete root.dataset.motion;
    delete root.dataset.inputModality;
    // Set it for every story, not only the reduced ones: a teardown that did not run must
    // not leave the next story (or file) under 「减少动态效果」.
    await emulateReducedMotion(Boolean(parameters.reducedMotion));
    return async () => {
      delete root.dataset.motion;
      if (parameters.reducedMotion) await emulateReducedMotion(false);
    };
  },
  // Every story renders on the app's own page background, so a component that only
  // looks right on one surface is caught here rather than in review.
  decorators: [
    (Story) => (
      <div className="bg-neutral-bg-layout text-neutral-text-primary font-sans p-md">
        <Story />
      </div>
    ),
  ],
};

export default preview;
