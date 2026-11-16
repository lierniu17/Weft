import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./styles/index.css";

// Placeholder entry: pages are assembled in batch 5. Components live in Storybook.
const root = document.getElementById("root");
if (root) {
  createRoot(root).render(
    <StrictMode>
      <main className="p-md text-body-md">Weft</main>
    </StrictMode>,
  );
}
