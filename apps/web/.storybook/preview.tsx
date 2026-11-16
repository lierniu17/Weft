import type { Preview } from "@storybook/react-vite";
import "../src/styles/index.css";
import "./preview-motion.css";

const preview: Preview = {
  parameters: {
    layout: "padded",
    controls: { matchers: { color: /(background|color)$/i, date: /Date$/i } },
    // AC-UI-9: an axe violation on any story fails the story test run.
    a11y: { test: "error" },
    viewport: {
      options: {
        mobile: { name: "Mobile 375", styles: { width: "375px", height: "812px" } },
        desktop: { name: "Desktop 1280", styles: { width: "1280px", height: "800px" } },
      },
    },
  },
  // Every story renders on the app's own layout background, so a component that
  // only looks right on pure white is caught here rather than in review.
  decorators: [
    (Story) => (
      <div className="bg-neutral-bg-layout text-neutral-text-primary font-sans p-md">
        <Story />
      </div>
    ),
  ],
};

export default preview;
