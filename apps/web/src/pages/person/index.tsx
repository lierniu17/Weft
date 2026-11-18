/**
 * 人物页: PersonHeader (with 「我和他的关系 ›」), 画像, then 他的关系 with the local
 * RelationGraph (1 / 2 hops) on top — in the right column from 1200px.
 */
import { useEffect, useRef, useState } from "react";
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
  useSummaryPending,
} from "../../api/graph.ts";
import { useGraphTheme } from "../../api/preferences.ts";
import { exposeGraph } from "../../app/devHooks.ts";
import {
  CONTENT_COLUMN,
  RIGHT_COLUMN,
  useLayout,
  useSidePanel,
  useToday,
} from "../../app/layout.ts";
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
import { cx } from "../../lib/cx.ts";
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
  const summaryPending = useSummaryPending(personId);
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
  /** 「还可以补充」 → the field or section to focus when in-place editing opens. */
  const [focus, setFocus] = useState<string | null>(null);
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
    setFocus(null);
  };

  const rel = pair.data?.relationship;
  // Phones: 编辑 moves to the NavBar so the header's relation line has the full width.
  const phone = layout === "mobile";
  const startEditing = editing ? undefined : () => setEditing(true);
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
      onEdit={phone ? undefined : startEditing}
      onOpenRelationship={
        p.person.is_self || !selfId
          ? undefined
          : () => navigate(`/people/${enc(selfId)}/relationships/${enc(personId)}`)
      }
      onDelete={p.person.is_self ? undefined : () => setDeleting(true)}
      className="pt-sm"
    />
  ) : (
    <PersonHeader name="" loading className="pt-sm" />
  );

  // Desktop: the graph and his relations in the 380px right column, unless 出处 is open there.
  const sideColumn = layout === "desktop" && citations === null;

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

  // Empty sections take no room (style refresh AC-5 / AC-9): no 「还没有记录」 here either.
  // Below 1200px the graph opens 他的关系, after the 画像 (the profile comes first on phones).
  const relationsTitle = isSelf ? "我的关系" : "他的关系";
  const relations = (neighbours.length > 0 || !sideColumn) && (
    <section aria-label={relationsTitle} className="flex flex-col gap-sm">
      {neighbours.length > 0 && <SectionHeader title={relationsTitle} count={neighbours.length} />}
      {!sideColumn && relationGraph}
      {neighbours.length > 0 && (
        <ul className="motion-stagger -mx-md flex flex-col">
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
      focus={focus}
      onPick={(key) => {
        setFocus(key);
        setEditing(true);
      }}
      pending={pending.current}
      relations={rel?.types.map((t) => t.subtype)}
      summaryPending={summaryPending}
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
          // the name is the page's h1 in PersonHeader
          title={p ? "" : "人物"}
          subtitle={editing ? "编辑中" : undefined}
          variant="pushed"
          onBack={back}
          actions={
            editing ? (
              <Button variant="ghost" size="sm" loading={edit.isPending} onClick={finishEditing}>
                完成
              </Button>
            ) : phone && p ? (
              <Button variant="ghost" size="sm" onClick={startEditing}>
                编辑
              </Button>
            ) : undefined
          }
        />
        <div className="min-h-[0] flex-1 overflow-y-auto bg-neutral-bg-layout">
          <div
            data-page-content=""
            className={cx(CONTENT_COLUMN, "motion-stagger flex flex-col gap-lg pt-xs pb-xl")}
          >
            {profile.isError && !notFound && <Banner variant="error">人物加载失败</Banner>}
            {header}
            {body}
            {!sideColumn && relations}
          </div>
        </div>
      </div>
      {sideColumn && (
        <aside
          aria-label="关系图"
          className={cx(
            RIGHT_COLUMN,
            "flex flex-col gap-lg overflow-y-auto border-l border-neutral-divider p-md",
          )}
        >
          {relationGraph}
          {relations}
        </aside>
      )}
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
