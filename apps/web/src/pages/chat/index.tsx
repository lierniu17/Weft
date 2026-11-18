/**
 * 对话: the chat-centred home. One composer; every message is handled by its 意图 (ADR 0005)
 * — drafts, answers and short replies appear in the feed under the message, with 纠正.
 */
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router";
import { ApiError, enc } from "../../api/client.ts";
import { useUsage } from "../../api/graph.ts";
import { keys } from "../../api/keys.ts";
import {
  chronological,
  type Message,
  useClarify,
  useMessages,
  useReroute,
  useSendMessage,
} from "../../api/messages.ts";
import {
  CONTENT_COLUMN,
  RIGHT_COLUMN,
  useLayout,
  useSheetVariant,
  useToday,
} from "../../app/layout.ts";
import { Button } from "../../components/basics/Button/Button.tsx";
import { Drawer } from "../../components/basics/Drawer/Drawer.tsx";
import { Skeleton } from "../../components/basics/Skeleton/Skeleton.tsx";
import { Toast } from "../../components/basics/Toast/Toast.tsx";
import { ChatComposer } from "../../components/business/ChatComposer/ChatComposer.tsx";
import { CitationSheet } from "../../components/business/CitationSheet/CitationSheet.tsx";
import { MessageBubble } from "../../components/business/MessageBubble/MessageBubble.tsx";
import { EmptyState } from "../../components/composites/EmptyState/EmptyState.tsx";
import { NavBar } from "../../components/composites/NavBar/NavBar.tsx";
import type { Answer, Citation } from "../../contracts/answer.ts";
import { cx } from "../../lib/cx.ts";
import {
  composerQuota,
  type MessageActionTarget,
  optionPart,
  problemText,
} from "../../lib/messages.ts";
import { draftCardLabels } from "../../lib/pageModels.ts";
import { PanoramaBody } from "../panorama/PanoramaView.tsx";
import { CurrentPersonPanel } from "./CurrentPersonPanel.tsx";
import { DraftReview } from "./DraftReview.tsx";
import { MessageThread, Searching } from "./MessageThread.tsx";

const EXAMPLES = [
  "今天和老张吃饭，他说女儿明年高考",
  "2015 年读大学时在社团认识了小李",
  "小王是我通过老张认识的客户",
];

export function ChatPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const today = useToday();
  const layout = useLayout();
  const sheetVariant = useSheetVariant();
  const chat = useMessages();
  const usage = useUsage();
  const send = useSendMessage();
  const reroute = useReroute();
  const clarify = useClarify();

  const [text, setText] = useState("");
  const [reviewing, setReviewing] = useState<{ draftId: string; occurredOn: string } | null>(null);
  const [citations, setCitations] = useState<Citation[] | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  /** Desktop: the panorama in the right column, with the answer lit (清除 keeps the graph). */
  const [graphPanel, setGraphPanel] = useState<{ answer: Answer | null } | null>(null);
  const input = useRef<HTMLTextAreaElement>(null);
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

  const messages = useMemo(() => chronological(chat.data), [chat.data]);
  const entries = messages.flatMap((m) => (m.entry ? [m.entry] : []));
  // Every draft card is a region: each gets its own name (AC-UI-9, axe landmark-unique).
  const labels = draftCardLabels(entries, today);
  const sending = send.isPending ? send.variables : null;
  const rerouting = reroute.isPending ? reroute.variables : null;
  const clarifying = clarify.isPending ? clarify.variables : null;
  const firstUse = chat.isSuccess && messages.length === 0 && sending === null;
  const latestConfirmed = [...entries].reverse().find((e) => e.draft?.status === "confirmed");

  // Keep the newest message in view when one is sent or handled (not when older ones load).
  const last = messages.at(-1);
  const newest = `${last?.message_id}:${last?.intent}:${sending ?? ""}`;
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll when the newest message changes
  useEffect(() => {
    pinned.current = true;
    bottom.current?.scrollIntoView({ block: "end" });
  }, [newest]);

  const openPerson = (id: string) => navigate(`/people/${enc(id)}`);
  // Desktop (wireframe D1/D2): review / 出处 open in the right column beside the chat,
  // non-modal; one at a time. Tablet and mobile keep the modal panel / bottom sheet.
  const inline = layout === "desktop";
  const review = (draftId: string, entryOccurredOn: string) => {
    setCitations(null);
    setGraphPanel(null);
    setReviewing({ draftId, occurredOn: entryOccurredOn });
  };

  const onSubmit = (message: string) => {
    send.mutate(message, {
      onError: (e) => {
        setText(message);
        setToast(e instanceof ApiError ? e.message : "发送失败，请稍后再试");
      },
    });
  };

  // 改为记录 / 改为提问 / 记下来 / 帮我查 (AC-6, AC-10): the message is replaced in place.
  const onReroute = (message: Message, target: MessageActionTarget) => {
    reroute.mutate(
      { id: message.message_id, as: target },
      {
        onError: (e) => {
          if (!(e instanceof ApiError)) {
            setToast("操作失败，请稍后再试");
            return;
          }
          // 409: the message changed meanwhile (its draft was confirmed): show it as it is.
          if (e.status === 409) void qc.invalidateQueries({ queryKey: keys.messages });
          setToast(problemText({ part: target, error: e.code, message: e.message }, usage.data));
        },
      },
    );
  };

  // A 反问 option (intent clarify AC-3): the message is handled by it and replaced in place.
  // A used-up quota leaves the 反问 open and says so like the composer does (AC-7).
  const onClarify = (message: Message, option: number) => {
    clarify.mutate(
      { id: message.message_id, option },
      {
        onError: (e) => {
          if (!(e instanceof ApiError)) {
            setToast("操作失败，请稍后再试");
            return;
          }
          // 409: answered or clicked meanwhile (another tab): show it as it is.
          if (e.status === 409) void qc.invalidateQueries({ queryKey: keys.messages });
          const chosen = message.clarify?.options[option];
          setToast(
            chosen
              ? problemText(
                  { part: optionPart(chosen, e.body.kind), error: e.code, message: e.message },
                  usage.data,
                )
              : e.message,
          );
        },
      },
    );
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

  const answerProps = {
    today,
    onPersonClick: (p: { person_id: string }) => openPerson(p.person_id),
    onFollowUp: (q: string) => {
      setText(q);
      input.current?.focus();
    },
    // no_answer 「去记一笔」: just say it — the composer takes records and questions alike.
    onRecord: () => input.current?.focus(),
    onCitationOpen: (answer: Answer, i: number) => {
      const c = answer.citations.find((x) => x.index === i);
      if (!c) return;
      setReviewing(null);
      setGraphPanel(null);
      setCitations([c]);
    },
    onShowOnGraph: showOnGraph,
  };
  const quota = composerQuota(usage.data);

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
          {chat.isPending ? (
            <div
              role="status"
              aria-busy="true"
              aria-label="正在加载对话"
              className={cx(CONTENT_COLUMN, "flex flex-col gap-md py-md")}
            >
              <Skeleton variant="card" />
              <Skeleton variant="card" />
            </div>
          ) : firstUse ? (
            <EmptyState variant="first-use" examples={EXAMPLES} onExample={setText} />
          ) : (
            <div>
              {chat.hasNextPage && (
                <div className={cx(CONTENT_COLUMN, "flex justify-center pt-md")}>
                  <Button
                    variant="ghost"
                    size="sm"
                    loading={chat.isFetchingNextPage}
                    onClick={() => void chat.fetchNextPage()}
                  >
                    更早的消息
                  </Button>
                </div>
              )}
              <ol
                aria-label="对话"
                data-page-content=""
                className={cx(CONTENT_COLUMN, "motion-stagger flex flex-col gap-lg py-md")}
              >
                {messages.map((m) => (
                  <MessageThread
                    key={m.message_id}
                    message={m}
                    today={today}
                    usage={usage.data}
                    label={m.entry ? labels.get(m.entry.id) : undefined}
                    onReview={review}
                    onPersonClick={openPerson}
                    onReroute={(target) => onReroute(m, target)}
                    rerouting={rerouting?.id === m.message_id ? rerouting.as : null}
                    onClarify={(option) => onClarify(m, option)}
                    clarifying={clarifying?.id === m.message_id ? clarifying.option : null}
                    answerProps={answerProps}
                  />
                ))}
                {sending !== null && (
                  <li className="flex flex-col gap-sm">
                    <MessageBubble variant="plain" today={today}>
                      {sending}
                    </MessageBubble>
                    <Searching label="正在处理…" name="正在处理" />
                  </li>
                )}
              </ol>
            </div>
          )}
          <div ref={bottom} />
        </div>
        <ChatComposer
          className="mx-auto w-full max-w-[720px]"
          value={text}
          onValueChange={setText}
          onSubmit={onSubmit}
          sending={send.isPending}
          blocked={quota.blocked}
          notice={quota.notice}
          inputRef={input}
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
          className={cx(
            RIGHT_COLUMN,
            "flex flex-col overflow-y-auto border-l border-neutral-divider bg-neutral-bg-container",
          )}
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
