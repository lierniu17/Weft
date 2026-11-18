import { useCallback, useEffect, useRef, useState } from "react";
import {
  initialPlayback,
  type Playback,
  pause as pausePlayback,
  seek as seekPlayback,
  play as startPlayback,
  step,
  type TimeRange,
} from "./timeline.ts";

/**
 * Drives the timeline's playback state machine (`timeline.ts`) with animation frames while
 * playing: ~1.5 years per second, stops at today; reduced motion jumps a whole year at a
 * time. `range` changes (new data) keep the current year when it is still on the axis.
 */
export function usePlayback(range: TimeRange, options: { reducedMotion?: boolean } = {}) {
  const [p, setP] = useState<Playback>(() => initialPlayback(range));
  const reduced = useRef(options.reducedMotion);
  reduced.current = options.reducedMotion;

  useEffect(() => {
    setP((prev) =>
      prev.from === range.from && prev.to === range.to
        ? prev
        : {
            ...prev,
            from: range.from,
            to: range.to,
            // at today stays at today; otherwise the same year, kept on the axis
            year:
              prev.year >= prev.to ? range.to : Math.min(range.to, Math.max(range.from, prev.year)),
          },
    );
  }, [range.from, range.to]);

  useEffect(() => {
    if (!p.playing) return;
    let last = performance.now();
    let raf = requestAnimationFrame(function tick(now) {
      const dt = Math.min(0.25, (now - last) / 1000);
      last = now;
      setP((prev) => step(prev, dt, { reducedMotion: reduced.current }));
      raf = requestAnimationFrame(tick);
    });
    return () => cancelAnimationFrame(raf);
  }, [p.playing]);

  return {
    ...p,
    play: useCallback(() => setP(startPlayback), []),
    pause: useCallback(() => setP(pausePlayback), []),
    toggle: useCallback(
      () => setP((prev) => (prev.playing ? pausePlayback(prev) : startPlayback(prev))),
      [],
    ),
    seek: useCallback((year: number) => setP((prev) => seekPlayback(prev, year)), []),
  };
}
