/**
 * The chat's in-session messages. Entries live in the API (GET /entries); questions and
 * answers do not, so they are kept here for as long as the tab is open, in the order the
 * user sent them. Lives above the routes so switching tabs keeps the conversation.
 */
import { createContext, type ReactNode, useCallback, useContext, useMemo, useState } from "react";
import type { Answer } from "../contracts/answer.ts";

export type SessionItem =
  | { kind: "entry"; id: string }
  | { kind: "ask"; id: string; question: string; answer?: Answer; error?: string };

type ChatSession = {
  items: SessionItem[];
  addEntry: (entryId: string) => void;
  addAsk: (question: string) => string;
  settleAsk: (id: string, result: { answer?: Answer; error?: string }) => void;
  reset: () => void;
};

const Ctx = createContext<ChatSession | null>(null);

let seq = 0;

export function ChatSessionProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<SessionItem[]>([]);
  const addEntry = useCallback(
    (id: string) => setItems((list) => [...list, { kind: "entry", id }]),
    [],
  );
  const addAsk = useCallback((question: string) => {
    seq += 1;
    const id = `ask-${seq}`;
    setItems((list) => [...list, { kind: "ask", id, question }]);
    return id;
  }, []);
  const settleAsk = useCallback(
    (id: string, result: { answer?: Answer; error?: string }) =>
      setItems((list) =>
        list.map((item) => (item.kind === "ask" && item.id === id ? { ...item, ...result } : item)),
      ),
    [],
  );
  const reset = useCallback(() => setItems([]), []);
  const value = useMemo(
    () => ({ items, addEntry, addAsk, settleAsk, reset }),
    [items, addEntry, addAsk, settleAsk, reset],
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useChatSession(): ChatSession {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useChatSession outside ChatSessionProvider");
  return ctx;
}
