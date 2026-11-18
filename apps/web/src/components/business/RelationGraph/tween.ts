/** Timed transitions for the graph renderer (ease in-out; 0 ms = jump, e.g. reduced motion). */
export type Tween = { from: number; to: number; start: number; dur: number };

export const easeInOut = (k: number) => (k < 0.5 ? 4 * k * k * k : 1 - (-2 * k + 2) ** 3 / 2);

export function tweenValue(t: Tween, now: number): number {
  if (t.dur <= 0 || now >= t.start + t.dur) return t.to;
  const k = Math.max(0, (now - t.start) / t.dur);
  return t.from + (t.to - t.from) * easeInOut(k);
}

export function tweenTo(t: Tween, to: number, now: number, dur: number) {
  if (t.to === to) return;
  t.from = tweenValue(t, now);
  t.to = to;
  t.start = now;
  t.dur = dur;
}

export const tween = (v: number): Tween => ({ from: v, to: v, start: 0, dur: 0 });
export const tweening = (t: Tween, now: number) => t.dur > 0 && now < t.start + t.dur;

/** The equivalent of `target` (± 2π k) closest to `current`, so easing takes the short way. */
export function nearestAngle(current: number, target: number) {
  const TAU = Math.PI * 2;
  let t = target;
  while (t - current > Math.PI) t -= TAU;
  while (current - t > Math.PI) t += TAU;
  return t;
}
