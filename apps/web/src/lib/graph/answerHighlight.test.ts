import { describe, expect, it } from "vitest";
import type { Answer, Citation, PersonRef } from "../../contracts/answer.ts";
import { answerHighlight, edgeKey, PATH_STEP_SECONDS } from "./answerHighlight.ts";

const me: PersonRef = { person_id: "me", name: "小明", is_self: true };
const zhang: PersonRef = { person_id: "zhang", name: "张伟" };
const wang: PersonRef = { person_id: "wang", name: "王浩" };
const li: PersonRef = { person_id: "li", name: "李明" };

function citation(index: number, pair?: [PersonRef, PersonRef]): Citation {
  return {
    index,
    entry_id: `e${index}`,
    entry_excerpt: "…",
    occurred_on: "2026-10-08",
    confidence: "hearsay",
    pair: pair ?? null,
  };
}

function answer(a: Partial<Answer>): Answer {
  return {
    kind: "text",
    segments: [{ text: "…" }],
    citations: [],
    persons: [],
    follow_ups: [],
    ...a,
  };
}

describe("answer → what lights up on the graph (AC-16, AC-17)", () => {
  it("a path lights its people and links in order, one step per link", () => {
    const h = answerHighlight(answer({ kind: "path", path: [me, zhang, wang], persons: [zhang] }));
    expect(h.kind).toBe("path");
    expect(h.persons).toEqual(["me", "zhang", "wang"]);
    expect(h.edges).toEqual([
      ["me", "zhang"],
      ["zhang", "wang"],
    ]);
    expect(h.sequence).toEqual(h.edges);
    expect(PATH_STEP_SECONDS).toBe(0.7);
  });

  it("a list lights every person it lists (with a pulse), no links", () => {
    const h = answerHighlight(
      answer({
        kind: "list",
        items: [
          { person_id: "li", name: "李明", citations: [1] },
          { person_id: "wang", name: "王浩", citations: [2] },
        ],
      }),
    );
    expect(h).toEqual({ kind: "list", persons: ["li", "wang"], edges: [], sequence: [] });
  });

  it("a count lights who it counts, like a list", () => {
    const h = answerHighlight(answer({ kind: "stat", stat: { count: 2, persons: [zhang, li] } }));
    expect(h).toMatchObject({ kind: "list", persons: ["zhang", "li"] });
  });

  it("a pair answer lights the two people and the link between them", () => {
    const h = answerHighlight(
      answer({ persons: [zhang, li], citations: [citation(1, [zhang, li]), citation(2)] }),
    );
    expect(h).toEqual({
      kind: "pair",
      persons: ["zhang", "li"],
      edges: [["zhang", "li"]],
      sequence: [["zhang", "li"]],
    });
  });

  it("an answer about me and one person lights both and our link (Self is not a chip)", () => {
    const h = answerHighlight(answer({ persons: [zhang], citations: [citation(1, [me, zhang])] }));
    expect(h).toEqual({
      kind: "pair",
      persons: ["me", "zhang"],
      edges: [["me", "zhang"]],
      sequence: [["me", "zhang"]],
    });
  });

  it("an answer about one person lights that person", () => {
    // a profile answer may cite one of his relationships: still about him
    const h = answerHighlight(answer({ persons: [zhang], citations: [citation(1, [zhang, li])] }));
    expect(h).toEqual({ kind: "person", persons: ["zhang"], edges: [], sequence: [] });
  });

  it("no answer, or an answer about nobody, lights nothing", () => {
    expect(answerHighlight(answer({ kind: "no_answer" })).kind).toBe("none");
    expect(answerHighlight(answer({ kind: "text" })).kind).toBe("none");
    expect(answerHighlight(answer({ kind: "path", path: null })).kind).toBe("none");
  });

  it("edge keys ignore direction", () => {
    expect(edgeKey("a", "b")).toBe(edgeKey("b", "a"));
  });
});
