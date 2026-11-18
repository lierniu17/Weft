/**
 * 时间轴 (graph-viz AC-14, AC-15, AC-19): time points as fractional years, what is visible
 * at a time point, and the playback state machine — all pure.
 *
 * The API answers `GET /api/graph?at=YYYY-MM` with the graph as it was then (who was met,
 * closeness and relationships as of then) plus `timeline: {from, to}`. Between fetched
 * snapshots the UI can fade people in by their `met_at` (`timeSlice`).
 *
 * Playback: about 1.5 years per second, stops at today; pressing play at today restarts
 * from the beginning; dragging pauses. With reduced motion the year advances in whole-year
 * jumps at the same average pace.
 */
import type { Schemas } from "../../api/client.ts";
import {
  CLOSENESS_RING,
  DEFAULT_CLOSENESS,
  directions,
  INDIRECT_RING,
  type Ring,
  selfEdge,
} from "./layout.ts";

type GraphData = Pick<Schemas["GraphOut"], "center_id" | "nodes" | "edges"> &
  Partial<Pick<Schemas["GraphOut"], "timeline">>;

export const PLAYBACK_YEARS_PER_SECOND = 1.5;
const EPSILON = 1e-9;

/** A partial date ("2015" | "2015-06" | "2015-06-15") as a fractional year at its start. */
export function toYear(partial: string): number {
  const [y, m, d] = partial.split("-").map(Number);
  if (!m) return y;
  if (!d) return y + (m - 1) / 12;
  const startOfYear = Date.UTC(y, 0, 1);
  const days = (Date.UTC(y, m - 1, d) - startOfYear) / 86_400_000;
  return y + days / 365;
}

export type TimeRange = { from: number; to: number };

/** From the earliest 认识时间 to today (the API's `timeline`). */
export function timeRange(g: GraphData, today?: string): TimeRange {
  const end = g.timeline?.to ?? today ?? new Date().toISOString().slice(0, 10);
  const to = toYear(end);
  const from = g.timeline?.from ? toYear(g.timeline.from) : Math.floor(to);
  return { from: Math.min(from, to), to };
}

export function isToday(year: number, to: number): boolean {
  return year >= to - EPSILON;
}

/** The `at` query parameter for a time point (month precision); null = now. */
export function atParam(year: number, to: number): string | null {
  if (isToday(year, to)) return null;
  const whole = Math.floor(year + EPSILON);
  const month = Math.min(12, Math.floor((year - whole) * 12 + EPSILON) + 1);
  return `${whole}-${String(month).padStart(2, "0")}`;
}

export function yearLabel(year: number, to: number): string {
  return isToday(year, to) ? "今天" : `${Math.floor(year + EPSILON)} 年`;
}

export type TimeSlice = { visible: Set<string>; rings: Map<string, Ring> };

/** Who is on the graph at `year` (我, people met by then, people with no known date) and
 *  on which ring (my closeness in the snapshot; 缺省 一般; no relationship with me → 间接认识). */
export function timeSlice(g: GraphData, year: number): TimeSlice {
  const me = g.center_id;
  const visible = new Set<string>();
  const rings = new Map<string, Ring>();
  for (const n of g.nodes) {
    if (n.id === me || !n.met_at || toYear(n.met_at) <= year + EPSILON) visible.add(n.id);
    if (n.id === me) {
      rings.set(n.id, 0);
      continue;
    }
    const e = selfEdge(g, n.id);
    rings.set(
      n.id,
      e ? CLOSENESS_RING[directions(e, me).mine ?? DEFAULT_CLOSENESS] : INDIRECT_RING,
    );
  }
  return { visible, rings };
}

export type Playback = {
  from: number;
  to: number;
  year: number;
  playing: boolean;
  /** Reduced motion: progress towards the next whole-year jump. */
  carry: number;
};

export function initialPlayback(range: TimeRange): Playback {
  return { ...range, year: range.to, playing: false, carry: 0 };
}

export function play(p: Playback): Playback {
  const year = isToday(p.year, p.to) ? p.from : p.year;
  return { ...p, year, playing: true, carry: 0 };
}

export function pause(p: Playback): Playback {
  return { ...p, playing: false, carry: 0 };
}

/** Dragging the slider: jump there (within the axis) and pause. */
export function seek(p: Playback, year: number): Playback {
  return { ...p, year: Math.min(p.to, Math.max(p.from, year)), playing: false, carry: 0 };
}

/** Advance a playing timeline by `dt` seconds. */
export function step(p: Playback, dt: number, options: { reducedMotion?: boolean } = {}): Playback {
  if (!p.playing) return p;
  const advance = dt * PLAYBACK_YEARS_PER_SECOND;
  let year: number;
  let carry = 0;
  if (options.reducedMotion) {
    const total = p.carry + advance;
    const jumps = Math.floor(total + EPSILON);
    carry = total - jumps;
    year = jumps > 0 ? Math.floor(p.year + EPSILON) + jumps : p.year;
  } else {
    year = p.year + advance;
  }
  if (year >= p.to - EPSILON) return { ...p, year: p.to, playing: false, carry: 0 };
  return { ...p, year, carry };
}
