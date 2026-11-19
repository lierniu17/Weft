/**
 * 问答联动 (graph-viz AC-16, AC-17): which people and links an Answer lights up on the
 * graph, derived from the Answer contract alone (no contract change).
 *
 * - path  → the chain's people; its links lit in order (`sequence`, ~0.7 s per link)
 * - list / stat → the listed / counted people (pulse), no links
 * - pair  → a text answer about exactly two people with a citation on their relationship
 *           (or about one person, cited together with 我): both people and their link
 * - person → any other answer naming people
 * - none  → no answer, or nobody to show (no 「在图上查看」 button)
 */
import type { Answer } from "../../contracts/answer.ts";

export const PATH_STEP_SECONDS = 0.7;

export type HighlightKind = "path" | "list" | "pair" | "person" | "none";

export type AnswerHighlight = {
  kind: HighlightKind;
  /** Person ids to keep lit, in answer order. */
  persons: string[];
  /** Links to light, as [a, b] person ids. */
  edges: [string, string][];
  /** Links in the order they light up (path / pair); empty when all at once. */
  sequence: [string, string][];
};

const NONE: AnswerHighlight = { kind: "none", persons: [], edges: [], sequence: [] };

export function edgeKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

const unique = (ids: string[]) => [...new Set(ids)];

export function answerHighlight(answer: Answer): AnswerHighlight {
  switch (answer.kind) {
    case "no_answer":
    case "clarify": // a 指代确认 asks who is meant: nobody to light yet
      return NONE;
    case "path": {
      const persons = unique((answer.path ?? []).map((p) => p.person_id));
      if (persons.length < 2) return persons.length ? person(persons) : NONE;
      const edges = persons.slice(1).map((id, i) => [persons[i], id] as [string, string]);
      return { kind: "path", persons, edges, sequence: edges };
    }
    case "list":
      return list(unique((answer.items ?? []).map((i) => i.person_id)));
    case "stat":
      return list(unique((answer.stat?.persons ?? []).map((p) => p.person_id)));
    default: {
      const persons = unique(answer.persons.map((p) => p.person_id));
      if (persons.length === 2) {
        const key = edgeKey(persons[0], persons[1]);
        const about = answer.citations.some(
          (c) => c.pair && edgeKey(c.pair[0].person_id, c.pair[1].person_id) === key,
        );
        if (about) {
          const link: [string, string] = [persons[0], persons[1]];
          return { kind: "pair", persons, edges: [link], sequence: [link] };
        }
      }
      // 我 is never a chip: an answer about 我 and one person names him only, its
      // citation pairs him with 我
      if (persons.length === 1) {
        const mine = answer.citations
          .map((c) => c.pair)
          .find(
            (p) =>
              p?.some((x) => x.person_id === persons[0]) &&
              p.some((x) => x.is_self && x.person_id !== persons[0]),
          );
        const self = mine?.find((x) => x.is_self);
        if (self) {
          const link: [string, string] = [self.person_id, persons[0]];
          return { kind: "pair", persons: link, edges: [link], sequence: [link] };
        }
      }
      return persons.length ? person(persons) : NONE;
    }
  }
}

function list(persons: string[]): AnswerHighlight {
  return persons.length ? { kind: "list", persons, edges: [], sequence: [] } : NONE;
}

function person(persons: string[]): AnswerHighlight {
  return { kind: "person", persons, edges: [], sequence: [] };
}
