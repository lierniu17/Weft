/**
 * The panorama's body (graph-viz): RelationGraph or GraphListView, legend, timeline, the
 * answer being shown with 「清除」, and the 500+ hint. Used by 全景图 and, from 1200px, by
 * the chat's right column (在图上查看 without leaving the chat).
 */
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../api/client.ts";
import { type GraphView, useProfile } from "../../api/graph.ts";
import { keys } from "../../api/keys.ts";
import { useGraphTheme } from "../../api/preferences.ts";
import { exposeGraph } from "../../app/devHooks.ts";
import { Banner } from "../../components/basics/Banner/Banner.tsx";
import { Button } from "../../components/basics/Button/Button.tsx";
import { SegmentedControl } from "../../components/basics/SegmentedControl/SegmentedControl.tsx";
import { Skeleton } from "../../components/basics/Skeleton/Skeleton.tsx";
import { GraphLegend } from "../../components/business/GraphLegend/GraphLegend.tsx";
import { GraphListView } from "../../components/business/GraphListView/GraphListView.tsx";
import { GraphTimeline } from "../../components/business/GraphTimeline/GraphTimeline.tsx";
import {
  type FilterMode,
  RelationGraph,
} from "../../components/business/RelationGraph/RelationGraph.tsx";
import type { Answer } from "../../contracts/answer.ts";
import { answerHighlight } from "../../lib/graph/answerHighlight.ts";
import { atParam, isToday, timeRange, toYear } from "../../lib/graph/timeline.ts";
import { usePlayback } from "../../lib/graph/usePlayback.ts";
import { useCompactViewport, useReducedMotion } from "../../lib/useMediaQuery.ts";

/** Above this many people the panorama asks to filter first (AC-21). */
export const FILTER_FIRST = 500;

function useGraph(query: string, enabled = true) {
  return useQuery({
    queryKey: keys.panorama(query),
    queryFn: () => api.get<GraphView>(query ? `/graph?${query}` : "/graph"),
    placeholderData: keepPreviousData,
    enabled,
  });
}

const withAt = (query: string, at: string | null) => {
  const p = new URLSearchParams(query);
  if (at) p.set("at", at);
  return p.toString();
};

export function answerText(answer: Answer): string {
  return answer.segments.map((s) => s.text).join("");
}

export type PanoramaBodyProps = {
  /** Serialized GraphFilter ('' = none). */
  filterQuery?: string;
  filterMode?: FilterMode;
  /** Time point from the URL (YYYY-MM); null = now. */
  at?: string | null;
  onAtChange?: (at: string | null) => void;
  answer?: Answer | null;
  onClearAnswer?: () => void;
  onOpenPerson: (id: string) => void;
  onOpenFilter?: () => void;
  /** Reports how many people are shown (the page's subtitle). */
  onCount?: (count: number) => void;
  /** The chat's right column: no timeline. */
  panel?: boolean;
};

export function PanoramaBody({
  filterQuery = "",
  filterMode = "fade",
  at = null,
  onAtChange,
  answer,
  onClearAnswer,
  onOpenPerson,
  onOpenFilter,
  onCount,
  panel,
}: PanoramaBodyProps) {
  const theme = useGraphTheme();
  const compact = useCompactViewport();
  const reducedMotion = useReducedMotion();
  const [view, setView] = useState<"graph" | "list">("graph");
  const [focusId, setFocusId] = useState<string | null>(null);
  const highlight = useMemo(() => (answer ? answerHighlight(answer) : null), [answer]);

  // time point: the URL's `at`, or the timeline while it plays (yearly snapshots)
  const base = useGraph(withAt("", answer ? null : at));
  const range = useMemo(
    () => (base.data ? timeRange(base.data) : { from: 2000, to: 2001 }),
    [base.data],
  );
  const playback = usePlayback(range, { reducedMotion });
  const { playing, seek: seekTo } = playback;
  // the URL is the time point whenever the timeline is not playing
  useEffect(() => {
    if (!playing) seekTo(at ? toYear(at) : range.to);
  }, [at, range.to, playing, seekTo]);
  // playback ended at today: so does the URL
  const wasPlaying = useRef(false);
  useEffect(() => {
    if (wasPlaying.current && !playing) onAtChange?.(null);
    wasPlaying.current = playing;
  }, [playing, onAtChange]);
  const year = playback.year;
  const fetchAt = answer
    ? null
    : playback.playing
      ? isToday(playback.year, range.to)
        ? null
        : `${Math.floor(playback.year)}-01`
      : at;
  const graph = useGraph(withAt("", fetchAt));
  const filtered = useGraph(withAt(filterQuery, fetchAt), Boolean(filterQuery));
  const matching = useMemo(
    () => (filterQuery && filtered.data ? new Set(filtered.data.nodes.map((n) => n.id)) : null),
    [filterQuery, filtered.data],
  );
  const focused = useProfile(focusId ?? undefined);
  const likes = focused.data?.facts
    .filter((f) => f.predicate === "LIKES" && f.current && f.subject_id === focusId)
    .map((f) => f.object)
    .slice(0, 3);

  const seek = (y: number) => {
    wasPlaying.current = false;
    playback.seek(y);
    onClearAnswer?.();
    onAtChange?.(atParam(y, range.to));
  };
  const toggle = () => {
    if (playback.playing) {
      wasPlaying.current = false;
      playback.pause();
      onAtChange?.(atParam(playback.year, range.to));
    } else {
      onClearAnswer?.();
      setFocusId(null);
      playback.play();
    }
  };
  const data = graph.data;
  const shown = data
    ? matching && filterMode === "only"
      ? matching.size
      : data.nodes.length
    : null;
  useEffect(() => {
    if (shown !== null) onCount?.(shown);
  }, [shown, onCount]);
  return (
    <div className="flex min-h-[0] flex-1 flex-col gap-sm">
      {answer && (
        <div
          role="status"
          data-graph-answer=""
          className="flex items-start gap-sm rounded-md bg-neutral-bg-subtle p-sm"
        >
          <p className="min-w-[0] flex-1 text-body-sm text-neutral-text-primary">
            {answerText(answer)}
          </p>
          {onClearAnswer && (
            <Button variant="ghost" size="sm" onClick={onClearAnswer}>
              清除
            </Button>
          )}
        </div>
      )}
      {data && data.nodes.length > FILTER_FIRST && (
        <Banner variant="warning">
          共 {data.nodes.length} 人，人太多时图会很密，建议先筛选。
          {onOpenFilter && (
            <Button variant="ghost" size="sm" onClick={onOpenFilter}>
              去筛选
            </Button>
          )}
        </Banner>
      )}
      <div className="flex items-center justify-between gap-sm">
        <SegmentedControl
          aria-label="视图"
          size="sm"
          options={[
            { value: "graph", label: "图谱" },
            { value: "list", label: "列表" },
          ]}
          value={view}
          onValueChange={(v) => setView(v === "list" ? "list" : "graph")}
        />
        {graph.isError && <span className="text-meta text-status-error-6">全景图加载失败</span>}
      </div>
      {data ? (
        view === "graph" ? (
          <RelationGraph
            variant="panorama"
            data={data}
            theme={theme}
            onOpenPerson={onOpenPerson}
            focusId={focusId}
            onFocusChange={setFocusId}
            highlight={highlight}
            matching={matching}
            filterMode={filterMode}
            year={playback.playing ? playback.year : undefined}
            likes={likes}
            compact={compact || panel}
            reducedMotion={reducedMotion}
            onReady={exposeGraph}
            overlay={<GraphLegend theme={theme} defaultCollapsed={compact || panel} />}
            className="min-h-[0] flex-1"
          />
        ) : (
          <GraphListView
            data={data}
            matching={filterMode === "fade" ? matching : null}
            visible={
              matching && filterMode === "only" ? new Set([...matching, data.center_id]) : undefined
            }
            focusId={focusId}
            onFocusChange={setFocusId}
            highlight={highlight}
            onOpenPerson={onOpenPerson}
            likes={likes}
            className="min-h-[0] flex-1 rounded-md border border-neutral-divider"
          />
        )
      ) : (
        !graph.isError && (
          <div role="status" aria-busy="true" aria-label="正在加载全景图" className="flex-1">
            <Skeleton variant="card" height="100%" />
          </div>
        )
      )}
      {!panel && base.data && (
        <GraphTimeline
          from={range.from}
          to={range.to}
          year={year}
          playing={playback.playing}
          onSeek={seek}
          onTogglePlay={toggle}
        />
      )}
    </div>
  );
}
