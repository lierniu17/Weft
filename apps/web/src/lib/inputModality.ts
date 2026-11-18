/**
 * Last input modality on <html data-input-modality="pointer|keyboard">, so the focus ring
 * (styles/index.css `focus-ring`) shows only for keyboard users — even when script moves
 * focus after a click, e.g. an overlay focusing its ✕ on open (style refresh AC-6).
 */
export type InputModality = "pointer" | "keyboard";

const ATTR = "data-input-modality";

export function inputModality(doc: Document = document): InputModality | null {
  const v = doc.documentElement.getAttribute(ATTR);
  return v === "pointer" || v === "keyboard" ? v : null;
}

const installed = new WeakSet<Document>();

/** Idempotent; call once at startup (main.tsx, Storybook preview). */
export function installInputModality(doc: Document = document): void {
  if (installed.has(doc)) return;
  installed.add(doc);
  const set = (m: InputModality) => {
    if (doc.documentElement.getAttribute(ATTR) !== m) doc.documentElement.setAttribute(ATTR, m);
  };
  doc.addEventListener(
    "keydown",
    (e) => {
      // Shortcuts (⌘C, Ctrl+Tab between windows…) are not keyboard navigation.
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      set("keyboard");
    },
    true,
  );
  for (const type of ["pointerdown", "mousedown", "touchstart"] as const) {
    doc.addEventListener(type, () => set("pointer"), { capture: true, passive: true });
  }
}
