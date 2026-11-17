# design-refs

Design inputs for the Weft MVP (spec: `docs/specs/2026-11-16-weft-mvp.md`). Exported from the CanvasAgents canvas on 2026-11-16.

| File | What it is | How to use it |
| --- | --- | --- |
| `wireframe-S1.png` … `wireframe-S6.png` | Wireframe panorama for structure scheme C (chat-centric), one image per user-journey scene: S1 first use, S2 daily recording, S3 asking, S4 browsing people and relationships, S5 errors / empty / loading, S6 edit, delete and settings | **Source of truth for information structure**: which screens exist, what is on each screen, what lives in a bottom sheet vs a page, navigation between screens (arrow labels). Check AC-UI-1 / AC-UI-2 / AC-UI-3 against these screen by screen. |
| `wireframe-desktop.png` | Desktop layouts D1–D3: SideNav (incl. "recently mentioned") / chat / right panel (draft, citation, current person) | Source of truth for the >= 1200px layout (AC-UI-7). |
| `final.html` | Runnable hi-fi mockup implementing the final tokens from `DESIGN.md` (scheme 2, indigo): chat page with draft card and cited answer, draft review sheet, person page | **Source of truth for visual style**. Open it in a browser and inspect computed styles; do not just look at the PNG. |
| `final.png` | Screenshot of `final.html` | Side-by-side comparison during the AC-UI walkthrough. |

`DESIGN.md` (repo root) is the only source for tokens and the component list (basics / composites / business). Wireframes define structure, not style; `final.html` defines style. If they conflict, stop and report rather than redesigning.
