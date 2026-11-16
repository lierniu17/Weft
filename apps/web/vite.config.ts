import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Tailwind v4 is a Vite plugin — no postcss.config, no tailwind.config.js.
// Design tokens live in src/styles/tokens.css, generated from DESIGN.md.
export default defineConfig({
  plugins: [react(), tailwindcss()],
});
