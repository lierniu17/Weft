/** 人物页: PersonHeader, 我和他, local RelationGraph (1 / 2 hops), 画像 and 他的关系. */
import { useEffect, useRef, useState } from "react";
import { FiChevronRight } from "react-icons/fi";
import { useNavigate, useParams } from "react-router";
import { useMe } from "../../api/auth.ts";
import { ApiError, enc } from "../../api/client.ts";
import {
  type ProfileEdit,
  useDeletePerson,
  useDeletionImpact,
  useEditProfile,
  useLocalGraph,
  usePair,
  useProfile,
} from "../../api/graph.ts";
import { useGraphTheme } from "../../api/preferences.ts";
import { exposeGraph } from "../../app/devHooks.ts";
import { useLayout, useSidePanel, useToday } from "../../app/layout.ts";
import { Banner } from "../../components/basics/Banner/Banner.tsx";
import { Button } from "../../components/basics/Button/Button.tsx";
import { Modal } from "../../components/basics/Modal/Modal.tsx";
import { Skeleton } from "../../components/basics/Skeleton/Skeleton.tsx";
import { Toast } from "../../components/basics/Toast/Toast.tsx";
import { CitationSheet } from "../../components/business/CitationSheet/CitationSheet.tsx";
import { PersonHeader } from "../../components/business/PersonHeader/PersonHeader.tsx";
import { RelationGraph } from "../../components/business/RelationGraph/RelationGraph.tsx";
import { EmptyState } from "../../components/composites/EmptyState/EmptyState.tsx";
import { ListItem } from "../../components/composites/ListItem/ListItem.tsx";
import { NavBar } from "../../components/composites/NavBar/NavBar.tsx";
import { SectionHeader } from "../../components/composites/SectionHeader/SectionHeader.tsx";
import type { Citation } from "../../contracts/answer.ts";
import { relationshipStatusLabel } from "../../lib/labels.ts";
import { feelingSummary, knownFor, toCitations } from "../../lib/pageModels.ts";
import { ProfileBody } from "./ProfileBody.tsx";

export function PersonPage() {
  const { personId = "" } = useParams();
  const navigate = useNavigate();
  const today = useToday();
  const layout = useLayout();
  const sheet = useSidePanel();
  const me = useMe();
  const selfId = me.data?.self_person_id;
  const profile = useProfile(personId);
  const isSelf = profile.data?.person.is_self ?? personId === selfId;
  const pair = usePair(isSelf ? undefined : selfId, personId);
  const [hops, setHops] = useState<1 | 2>(1);
  const graph = useLocalGraph(personId, hops);
  const graphTheme = useGraphTheme();
  const [graphFocus, setGraphFocus] = useState<string | null>(null);
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new person starts unfocused
  useEffect(() => setGraphFocus(null), [personId]);
  const focusedProfile = useProfile(graphFocus ?? undefined);
  const focusedLikes = focusedProfile.data?.facts
    .filter((f) => f.predicate === "LIKES" && f.current && f.subject_id === graphFocus)
    .map((f) => f.object)
    .slice(0, 3);
  const edit = useEditProfile(personId);
  const del = useDeletePerson();
  const [editing, setEditing] = useState(false);
  const pending = useRef(new Map<string, ProfileEdit>());
  const [deleting, setDeleting] = useState(false);
  const impact = useDeletionImpact(personId, deleting);
  const [citations, setCitations] = useState<Citation[] | null>(null);
  const [toast, setToast] = useState<{ text: string; error?: boolean } | null>(null);

  const back = () => (window.history.length > 1 ? navigate(-1) : navigate("/people"));
  const notFound =
    profile.error instanceof ApiError && (profile.error.notFound || profile.error.status === 422);

  if (notFound) {
    return (
      <>
        <NavBar title="人物" variant="pushed" onBack={() => navigate("/people")} />
        <EmptyState variant="not-found" onAction={() => navigate("/people")} />
      </>
    );
  }

  const p = profile.data;
  const fail = (e: unknown) =>
    setToast({ text: e instanceof ApiError ? e.message : "保存失败，请稍后再试", error: true });
  const apply = (op: ProfileEdit) => edit.mutateAsync(op).catch(fail);
  const finishEditing = async () => {
    const ops = [...pending.current.values()];
    pending.current.clear();
    for (const op of ops) await apply(op);
    setEditing(false);
  };

  const rel = pair.data?.relationship;
  const neighbours = (graph.data?.edges ?? []).flatMap((e) => {
    const other = e.source === personId ? e.target : e.target === personId ? e.source : null;
    const node = graph.data?.nodes.find((n) => n.id === other);
    return node ? [{ edge: e, node }] : [];
  });

  const header = p ? (
    <PersonHeader
      name={p.person.name}
      aliases={p.person.aliases}
      isSelf={p.person.is_self}
      knownFor={knownFor(rel?.met_at, today)}
      relationTypes={rel?.types}
      status={rel?.status ?? undefined}
      feelingSummary={feelingSummary(pair.data?.a_to_b)}
      onEdit={editing ? undefined : () => setEditing(true)}
      onDelete={p.person.is_self ? undefined : () => setDeleting(true)}
    />
  ) : (
    <PersonHeader name="" loading />
  );

  const relationGraph = graph.data ? (
    <RelationGraph
      onReady={exposeGraph}
      variant="local"
      data={graph.data}
      theme={graphTheme}
      hops={hops}
      onHopsChange={setHops}
      truncatedCount={graph.data.omitted}
      focusId={graphFocus}
      onFocusChange={setGraphFocus}
      likes={focusedLikes}
      onOpenPerson={(id) => id !== personId && navigate(`/people/${enc(id)}`)}
    />
  ) : (
    <Skeleton variant="card" height="200px" />
  );

  const relations = (
    <section aria-label={isSelf ? "我的关系" : "他的关系"} className="flex flex-col">
      <SectionHeader title={isSelf ? "我的关系" : "他的关系"} count={neighbours.length} level={3} />
      {neighbours.length === 0 ? (
        <p className="py-sm text-body-sm text-neutral-text-secondary">还没有记录</p>
      ) : (
        <ul className="-mx-md">
          {neighbours.map(({ edge, node }) => (
            <li key={edge.id}>
              <ListItem
                variant="navigational"
                title={node.is_self ? "我" : node.name}
                subtitle={
                  [
                    edge.types.map((t) => t.subtype).join(" · "),
                    edge.status ? relationshipStatusLabel(edge.status) : null,
                  ]
                    .filter(Boolean)
                    .join(" · ") || undefined
                }
                onClick={() => navigate(`/people/${enc(personId)}/relationships/${enc(node.id)}`)}
              />
            </li>
          ))}
        </ul>
      )}
    </section>
  );

  const body = p ? (
    <ProfileBody
      profile={p}
      today={today}
      editing={editing}
      pending={pending.current}
      onEdit={(op) => void apply(op)}
      onOpenSources={(id) => {
        const sources = toCitations(
          id.startsWith("identity:")
            ? (p.identity[id.slice(9)]?.citations ?? [])
            : (p.facts.find((f) => f.id === id)?.citations ?? []),
        );
        setCitations(sources);
      }}
    />
  ) : (
    <div role="status" aria-busy="true" aria-label="正在加载画像" className="flex flex-col gap-md">
      <Skeleton width="50%" />
      <Skeleton width="80%" />
      <Skeleton width="65%" />
    </div>
  );

  return (
    <div className="flex min-h-[0] flex-1">
      <div className="flex min-w-[0] flex-1 flex-col">
        <NavBar
          title={p?.person.name ?? "人物"}
          subtitle={editing ? "编辑中" : undefined}
          variant="pushed"
          onBack={back}
          actions={
            editing ? (
              <Button variant="ghost" size="sm" loading={edit.isPending} onClick={finishEditing}>
                完成
              </Button>
            ) : undefined
          }
        />
        <div className="min-h-[0] flex-1 overflow-y-auto bg-neutral-bg-container">
          {profile.isError && !notFound && (
            <Banner variant="error" className="m-md">
              人物加载失败
            </Banner>
          )}
          {header}
          {!isSelf && p && (
            <ListItem
              variant="navigational"
              title={
                rel ? `我和他：${rel.types.map((t) => t.subtype).join(" · ") || "关系"}` : "我和他"
              }
              subtitle={feelingSummary(pair.data?.a_to_b) ?? (rel ? undefined : "还没有记录")}
              onClick={() =>
                selfId && navigate(`/people/${enc(selfId)}/relationships/${enc(personId)}`)
              }
              trailing={
                <span className="flex items-center">
                  关系
                  <FiChevronRight aria-hidden="true" />
                </span>
              }
            />
          )}
          {layout === "desktop" ? (
            <div className="flex gap-lg p-md">
              <div className="min-w-[0] flex-1">{body}</div>
              <div className="flex w-[360px] shrink-0 flex-col gap-lg">
                {relationGraph}
                {relations}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-lg p-md">
              {relationGraph}
              {body}
              {relations}
            </div>
          )}
        </div>
      </div>
      <CitationSheet
        open={citations !== null}
        onOpenChange={(open) => !open && setCitations(null)}
        citations={citations ?? []}
        today={today}
        {...sheet}
      />
      <Modal
        open={deleting}
        onOpenChange={setDeleting}
        variant="danger"
        title={`删除${p?.person.name ?? ""}？`}
        description={
          impact.data
            ? `有 ${impact.data.entry_count} 条记录提到他，原文会保留。他的画像、关系、感受会被删除，无法恢复。`
            : "正在统计提到他的记录…"
        }
        actionText="删除"
        actionLoading={del.isPending || impact.isPending}
        onAction={() =>
          del.mutate(personId, {
            onSuccess: () => {
              setDeleting(false);
              navigate("/people", { replace: true });
            },
            onError: fail,
          })
        }
      />
      <Toast
        open={toast !== null}
        onOpenChange={(o) => !o && setToast(null)}
        variant={toast?.error ? "error" : "success"}
      >
        {toast?.text}
      </Toast>
    </div>
  );
}
