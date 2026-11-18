# design-refs/graph-viz

Design inputs for the relationship-graph visualization upgrade (spec: `docs/specs/2026-11-17-graph-viz.md`). Confirmed by the requester after hands-on use on 2026-11-17: keep concentric rings + sectors, focus fade + person card, Q&A path animation, timeline, starfield theme, line encoding.

| File | What it is | How to use it |
| --- | --- | --- |
| `prototype.html` | Runnable interactive prototype (Canvas 2D, zero deps, fictional data). JS/CSS comments explain every value. | **Source of truth for interaction and encoding.** Open it in a browser and click through every control (focus, three Q&A buttons, timeline play/drag, theme toggle, reduced motion, zoom/pan) before and after implementing. |
| `light.png` | Screenshot, light theme (DESIGN.md tokens), desktop + 375 phone side by side | Visual comparison for AC-UI-1 |
| `starfield-path.png` | Starfield theme with the “我是怎么认识小王的？” path lit | Visual comparison: path animation end state |
| `starfield-pair.png` | Starfield, “老张和小李什么关系？” pair highlight | Visual comparison: pair highlight |
| `starfield-timeline-2013.png` | Starfield, timeline dragged to 2013 | Visual comparison: time travel |

Differences from the prototype that the spec decided afterwards (the spec wins): sectors are the 5 taxonomy categories (亲属/情感/社会/利益/敌对), not the prototype's separate 同学 sector; people not directly related to 我 sit on a 6th outer ring “间接认识” near their anchor person; multiple relationship types show as small arcs around the node; the starfield setting lives in 我的 and is saved to the account; Q&A “在图上查看” opens the graph (desktop: right column). Tokens: `colors.graph` and `colors.graph-dark` in DESIGN.md.
