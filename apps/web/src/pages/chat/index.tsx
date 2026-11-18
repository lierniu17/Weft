/** 对话: the chat-centred home — record or ask in one composer, drafts and answers in the feed. */
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { ApiError, enc } from "../../api/client.ts";
import { useEntries, useSubmitEntry } from "../../api/entries.ts";
import { useAsk, useUsage } from "../../api/graph.ts";
import { useChatSession } from "../../app/chatSession.tsx";
import { useLayout, useSheetVariant, useToday } from "../../app/layout.ts";
import { Button } from "../../components/basics/Button/Button.tsx";
import { Drawer } from "../../components/basics/Drawer/Drawer.tsx";
import { Skeleton } from "../../components/basics/Skeleton/Skeleton.tsx";
import { Toast } from "../../components/basics/Toast/Toast.tsx";
import { AnswerCard } from "../../components/business/AnswerCard/AnswerCard.tsx";
import {
  ChatComposer,
  type ComposerMode,
  type ComposerSubmit,
} from "../../components/business/ChatComposer/ChatComposer.tsx";
import { CitationSheet } from "../../components/business/CitationSheet/CitationSheet.tsx";
import { MessageBubble } from "../../components/business/MessageBubble/MessageBubble.tsx";
import { Card } from "../../components/composites/Card/Card.tsx";
import { EmptyState } from "../../components/composites/EmptyState/EmptyState.tsx";
import { NavBar } from "../../components/composites/NavBar/NavBar.tsx";
import type { Answer, Citation } from "../../contracts/answer.ts";
import { type OccurredOn, todayOccurredOn } from "../../lib/datePrecision.ts";
import { draftCardLabels, quotaMessages, toPartialDate } from "../../lib/pageModels.ts";
import { PanoramaBody } from "../panorama/PanoramaView.tsx";
import { CurrentPersonPanel } from "./CurrentPersonPanel.tsx";
import { DraftReview } from "./DraftReview.tsx";
import { EntryThread } from "./EntryThread.tsx";

const EXAMPLES = [
  "今天和老张吃饭，他说女儿明年高考",
  "读大学时在社团认识了小李",
  "小王是我通过老张认识的客户",
];

/** How many earlier Entries the feed shows; the full history is in 记录. */
const HISTORY = 20;

export function ChatPage() {
  const navigate = useNavigate();
  const today = useToday();
  const layout = useLayout();
  const sheetVariant = useSheetVariant();
  const session = useChatSession();
  const entries = useEntries();
  const usage = useUsage();
  const submitEntry = useSubmitEntry();
  const ask = useAsk();

  const [mode, setMode] = useState<ComposerMode>("record");
  const [text, setText] = useState("");
  const [occurredOn, setOccurredOn] = useState<OccurredOn>(() => todayOccurredOn(today));
  const [reviewing, setReviewing] = useState<{ draftId: string; occurredOn: string } | null>(null);
  const [citations, setCitations] = useState<Citation[] | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  /** Desktop: the panorama in the right column, with the answer lit (清除 keeps the graph). */
  const [graphPanel, setGraphPanel] = useState<{ answer: Answer | null } | null>(null);
  const bottom = useRef<HTMLDivElement>(null);
  const feed = useRef<HTMLDivElement>(null);
  const pinned = useRef(true);

  // Stay at the newest message while cards grow (drafts settle, chips load), unless the
  // user has scrolled up to read history.
  useEffect(() => {
    const el = feed.current;
    const content = el?.firstElementChild;
    if (!el || !content) return;
    const onScroll = () => {
      pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    };
    const observer = new ResizeObserver(() => {
      if (pinned.current) el.scrollTop = el.scrollHeight;
    });
    observer.observe(content);
    el.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      observer.disconnect();
      el.removeEventListener("scroll", onScroll);
    };
  });

  const byId = useMemo(() => new Map((entries.data ?? []).map((e) => [e.id, e])), [entries.data]);
  const sessionEntryIds = new Set(session.items.filter((i) => i.kind === "entry").map((i) => i.id));
  const history = (entries.data ?? [])
    .filter((e) => e.kind === "user" && !sessionEntryIds.has(e.id))
    .slice(0, HISTORY)
    .reverse();
  // Every draft card is a region: each gets its own name (AC-UI-9, axe landmark-unique).
  const labels = draftCardLabels(
    (entries.data ?? []).filter((e) => e.kind === "user"),
    today,
  );
  const firstUse = entries.isSuccess && history.length === 0 && session.items.length === 0;
  const latestConfirmed = (entries.data ?? []).find(
    (e) => e.kind === "user" && e.draft?.status === "confirmed",
  );

  // Keep the newest message in view.
  const count =
    history.length +
    session.items.length +
    session.items.filter((i) => i.kind === "ask" && (i.answer || i.error)).length;
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll when the feed grows
  useEffect(() => {
    pinned.current = true;
    bottom.current?.scrollIntoView({ block: "end" });
  }, [count]);

  const openPerson = (id: string) => navigate(`/people/${enc(id)}`);
  // Desktop (wireframe D1/D2): review / 出处 open in the right column beside the chat,
  // non-modal; one at a time. Tablet and mobile keep the modal panel / bottom sheet.
  const inline = layout === "desktop";
  const review = (draftId: string, entryOccurredOn: string) => {
    setCitations(null);
    setGraphPanel(null);
    setReviewing({ draftId, occurredOn: entryOccurredOn });
  };

  const onSubmit = (payload: ComposerSubmit) => {
    if (payload.mode === "record") {
      submitEntry.mutate(
        { text: payload.text, occurred_on: toPartialDate(payload.occurredOn) },
        {
          onSuccess: (s) => {
            session.addEntry(s.entry.id);
            setOccurredOn(todayOccurredOn(new Date()));
          },
          onError: (e) => {
            setText(payload.text);
            if (!(e instanceof ApiError && e.quotaExceeded)) {
              setToast(e instanceof ApiError ? e.message : "提交失败，请稍后再试");
            }
          },
        },
      );
      return;
    }
    const id = session.addAsk(payload.text);
    ask.mutate(payload.text, {
      onSuccess: (answer) => session.settleAsk(id, { answer }),
      onError: (e) =>
        session.settleAsk(id, {
          error: e instanceof ApiError ? e.message : "问答暂时不可用，请稍后再试",
        }),
    });
  };

  // 在图上查看 (graph-viz AC-17): phones and tablets go to 全景图; desktop keeps the chat
  // and opens the panorama in the right column.
  const showOnGraph = (answer: Answer) => {
    if (inline) {
      setReviewing(null);
      setCitations(null);
      setGraphPanel({ answer });
    } else {
      navigate("/graph", { state: { answer } });
    }
  };

  const answerHandlers = {
    today,
    onPersonClick: (p: { person_id: string }) => openPerson(p.person_id),
    onFollowUp: (q: string) => {
      setMode("ask");
      setText(q);
    },
    onRecord: () => setMode("record"),
  };

  return (
    <div className="flex min-h-[0] flex-1">
      <div className="flex min-w-[0] flex-1 flex-col">
        <NavBar
          title="Weft"
          actions={
            <Button variant="ghost" size="sm" onClick={() => navigate("/entries")}>
              记录
            </Button>
          }
        />
        <div ref={feed} className="min-h-[0] flex-1 overflow-y-auto" aria-live="off">
          {entries.isPending ? (
            <div
              role="status"
              aria-busy="true"
              aria-label="正在加载对话"
              className="flex flex-col gap-md p-md"
            >
              <Skeleton variant="card" />
              <Skeleton variant="card" />
            </div>
          ) : firstUse ? (
            <EmptyState
              variant="first-use"
              examples={EXAMPLES}
              onExample={(t) => {
                setMode("record");
                setText(t);
              }}
            />
          ) : (
            <ol aria-label="对话" className="flex flex-col gap-md px-md py-md">
              {history.map((e) => (
                <EntryThread
                  key={e.id}
                  entry={e}
                  today={today}
                  label={labels.get(e.id)}
                  onReview={(id) => review(id, e.occurred_on)}
                  onPersonClick={openPerson}
                />
              ))}
              {session.items.map((item) => {
                if (item.kind === "entry") {
                  const e = byId.get(item.id);
                  return e ? (
                    <EntryThread
                      key={item.id}
                      entry={e}
                      today={today}
                      label={labels.get(e.id)}
                      onReview={(id) => review(id, e.occurred_on)}
                      onPersonClick={openPerson}
                    />
                  ) : null;
                }
                return (
                  <li key={item.id} className="flex flex-col gap-sm">
                    <MessageBubble variant="question" today={today}>
                      {item.question}
                    </MessageBubble>
                    {item.answer ? (
                      <AnswerCard
                        answer={item.answer}
                        onCitationOpen={(i) => {
                          const c = item.answer?.citations.find((x) => x.index === i);
                          if (!c) return;
                          setReviewing(null);
                          setGraphPanel(null);
                          setCitations([c]);
                        }}
                        onShowOnGraph={() => item.answer && showOnGraph(item.answer)}
                        {...answerHandlers}
                      />
                    ) : item.error ? (
                      <Card className="max-w-[88%] text-body-sm text-status-error-6" role="alert">
                        {item.error}
                      </Card>
                    ) : (
                      <Card
                        role="status"
                        aria-busy="true"
                        aria-label="正在查找"
                        className="flex max-w-[88%] flex-col gap-sm"
                      >
                        <p className="text-body-md text-neutral-text-secondary">正在图谱里查找…</p>
                        <Skeleton width="80%" />
                        <Skeleton width="60%" />
                      </Card>
                    )}
                  </li>
                );
              })}
            </ol>
          )}
          <div ref={bottom} />
        </div>
        <ChatComposer
          mode={mode}
          onModeChange={setMode}
          value={text}
          onValueChange={setText}
          occurredOn={occurredOn}
          onOccurredOnChange={setOccurredOn}
          today={today}
          onSubmit={onSubmit}
          sending={submitEntry.isPending}
          exhausted={quotaMessages(usage.data)}
        />
      </div>
      {inline && graphPanel && (
        <Drawer
          open
          onOpenChange={(open) => !open && setGraphPanel(null)}
          title="全景图"
          variant="side-panel"
          modal={false}
          width="wide"
        >
          <div className="flex h-full min-h-[480px] flex-col">
            <PanoramaBody
              panel
              answer={graphPanel.answer}
              onClearAnswer={() => setGraphPanel({ answer: null })}
              onOpenPerson={openPerson}
            />
          </div>
        </Drawer>
      )}
      {inline && !reviewing && citations === null && !graphPanel && (
        <aside
          aria-label="右栏"
          className="flex w-[360px] shrink-0 flex-col overflow-y-auto border-l border-neutral-divider bg-neutral-bg-container"
        >
          <CurrentPersonPanel entryId={latestConfirmed?.id} />
        </aside>
      )}
      {reviewing && (
        <DraftReview
          key={reviewing.draftId}
          draftId={reviewing.draftId}
          occurredOn={reviewing.occurredOn}
          onClose={() => setReviewing(null)}
          onError={setToast}
          modal={!inline}
        />
      )}
      <CitationSheet
        open={citations !== null}
        onOpenChange={(open) => !open && setCitations(null)}
        citations={citations ?? []}
        today={today}
        variant={sheetVariant}
        modal={!inline}
        onOpenRelationship={([a, b]) =>
          navigate(`/people/${enc(a.person_id)}/relationships/${enc(b.person_id)}`)
        }
      />
      <Toast open={toast !== null} onOpenChange={(o) => !o && setToast(null)} variant="error">
        {toast}
      </Toast>
    </div>
  );
}
