import { describe, expect, it } from "vitest";
import { edge, graph, node, SELF } from "./fixtures.ts";
import {
  atParam,
  initialPlayback,
  PLAYBACK_YEARS_PER_SECOND,
  type Playback,
  pause,
  play,
  seek,
  step,
  timeRange,
  timeSlice,
  toYear,
  yearLabel,
} from "./timeline.ts";

const g = graph(
  [
    node("li", { met_at: "2015" }),
    node("su", { met_at: "2016-07" }),
    node("zhang", { met_at: "2018-03-12" }),
    node("daughter", { met_at: "2026-11-10", anchor_person_id: "zhang" }),
    node("unknown", { met_at: null }),
  ],
  [
    edge(SELF, "li", { mine: "close" }),
    edge("su", SELF, { theirs: "distant" }),
    edge(SELF, "zhang", { mine: "intimate" }),
    edge(SELF, "unknown"),
    edge("zhang", "daughter"),
  ],
  { timeline: { from: "2015", to: "2026-11-16" } },
);

describe("dates as years", () => {
  it("reads partial dates as the start of their period", () => {
    expect(toYear("2015")).toBe(2015);
    expect(toYear("2015-07")).toBeCloseTo(2015.5, 1);
    expect(toYear("2026-11-16")).toBeCloseTo(2026.875, 2);
  });

  it("the axis runs from the earliest met date to today", () => {
    expect(timeRange(g)).toEqual({ from: 2015, to: toYear("2026-11-16") });
    expect(timeRange(graph([], [], { timeline: { from: null, to: "2026-11-16" } }))).toEqual({
      from: Math.floor(toYear("2026-11-16")),
      to: toYear("2026-11-16"),
    });
  });

  it("asks the API for the month shown, and for now at today", () => {
    expect(atParam(2013.2, 2026.9)).toBe("2013-03");
    expect(atParam(2013, 2026.9)).toBe("2013-01");
    expect(atParam(2026.9, 2026.9)).toBeNull();
  });

  it("labels the year, or 今天 at the end", () => {
    expect(yearLabel(2013.7, 2026.9)).toBe("2013 年");
    expect(yearLabel(2026.9, 2026.9)).toBe("今天");
  });
});

describe("time point → visible set and rings (AC-14)", () => {
  it("shows me and those met by then; people with no met date always", () => {
    expect([...timeSlice(g, 2015.2).visible].sort()).toEqual([SELF, "li", "unknown"].sort());
    expect(timeSlice(g, 2016.6).visible.has("su")).toBe(true); // met 2016-07
    expect(timeSlice(g, 2016.4).visible.has("su")).toBe(false);
    expect(timeSlice(g, 2018).visible.has("zhang")).toBe(false);
    expect(timeSlice(g, 2018.3).visible.has("zhang")).toBe(true);
    expect(timeSlice(g, 2026.88).visible.has("daughter")).toBe(true);
  });

  it("puts each person on the ring of the snapshot's closeness; 间接认识 outermost", () => {
    const { rings } = timeSlice(g, 2026.9);
    expect(rings.get("li")).toBe(2);
    expect(rings.get("su")).toBe(5);
    expect(rings.get("zhang")).toBe(1);
    expect(rings.get("unknown")).toBe(4); // no closeness → 一般
    expect(rings.get("daughter")).toBe(6);
    expect(rings.get(SELF)).toBe(0);
  });
});

describe("playback (AC-15, AC-19)", () => {
  const start: Playback = initialPlayback({ from: 2015, to: 2026.9 });

  it("starts paused at today", () => {
    expect(start).toMatchObject({ year: 2026.9, playing: false });
  });

  it("plays from the start when at today, about 1.5 years a second", () => {
    expect(PLAYBACK_YEARS_PER_SECOND).toBe(1.5);
    const p = play(start);
    expect(p).toMatchObject({ year: 2015, playing: true });
    expect(step(p, 1).year).toBeCloseTo(2016.5);
    expect(step(step(p, 0.5), 0.5).year).toBeCloseTo(2016.5);
  });

  it("stops at today", () => {
    const end = step(play(start), 100);
    expect(end).toMatchObject({ year: 2026.9, playing: false });
    expect(yearLabel(end.year, end.to)).toBe("今天");
  });

  it("does not move while paused", () => {
    const p = pause(step(play(start), 1));
    expect(step(p, 5)).toEqual(p);
  });

  it("dragging pauses and clamps to the axis", () => {
    const p = play(start);
    expect(seek(p, 2010)).toMatchObject({ year: 2015, playing: false });
    expect(seek(p, 2030)).toMatchObject({ year: 2026.9, playing: false });
    expect(seek(p, 2020.25).year).toBe(2020.25);
  });

  it("resumes from where it was paused", () => {
    const p = play(seek(start, 2020));
    expect(p).toMatchObject({ year: 2020, playing: true });
  });

  it("jumps whole years with reduced motion", () => {
    const p = play(start);
    const reduce = { reducedMotion: true };
    const a = step(p, 0.3, reduce);
    expect(a.year).toBe(2015); // not a whole year yet
    const b = step(a, 0.4, reduce); // 0.7 s × 1.5 ≥ 1 year
    expect(b.year).toBe(2016);
    const c = step(b, 1.4, reduce); // two more years (with the carried fraction)
    expect(c.year).toBe(2018);
    expect(Number.isInteger(step(c, 0.9, reduce).year)).toBe(true);
    expect(step(c, 100, reduce)).toMatchObject({ year: 2026.9, playing: false });
  });
});
