import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Tailwind v4 is a Vite plugin — no postcss.config, no tailwind.config.js.
// Design tokens live in src/styles/tokens.css, generated from DESIGN.md.
// `/api` is proxied to the FastAPI app (WEFT_API_URL, default :8000), so the session
// cookie stays same-origin.
export default defineConfig({
  plugins: [react(), tailwindcss()],
  // Pre-bundle every runtime dependency at startup, so a first visit never triggers a
  // re-optimization + full reload mid-session (it made the first e2e:bot page flaky).
  optimizeDeps: {
    include: [
      "react",
      "react-dom/client",
      "react-router",
      "@tanstack/react-query",
      "radix-ui",
      "cytoscape",
      "react-icons/fi",
    ],
  },
  server: {
    port: Number(process.env.WEFT_WEB_PORT ?? 5173),
    strictPort: true,
    proxy: {
      "/api": { target: process.env.WEFT_API_URL ?? "http://127.0.0.1:8000", changeOrigin: false },
    },
  },
});
