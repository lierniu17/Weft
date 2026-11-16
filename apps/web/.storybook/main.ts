import type { StorybookConfig } from "@storybook/react-vite";

const config: StorybookConfig = {
  // Sidebar order follows the dependency direction of the layers:
  // Basics -> Composites -> Business.
  stories: [
    "../src/components/basics/**/*.stories.@(ts|tsx)",
    "../src/components/composites/**/*.stories.@(ts|tsx)",
    "../src/components/business/**/*.stories.@(ts|tsx)",
  ],
  addons: ["@storybook/addon-docs", "@storybook/addon-a11y", "@storybook/addon-vitest"],
  framework: {
    name: "@storybook/react-vite",
    options: {},
  },
};

export default config;
