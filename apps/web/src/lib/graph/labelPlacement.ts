/**
 * Where the graph's names go (graph-viz AC-2, AC-11): deterministic label placement in
 * screen space, so that no two drawn labels overlap and no label covers someone's disc.
 *
 * Every label wants a few positions, in order of preference; labels are placed one by one
 * in a fixed order and each takes its first position that collides with nothing placed so
 * far (nor with any disc but its own) — or is left out:
 *
 *   1. sector names (past the outer ring; fixed, never moved)
 *   2. ring names (at the top of their ring, right of the 12 o'clock line, else left of it)
 *   3. person names — the focused person first, then by ring (closer first), then the lit
 *      (focus / answer / filter) before the rest, then by name: below the disc, else above,
 *      right, left. A name left out still shows on hover (tooltip), when focused and once
 *      zooming in gives it room.
 *   4. group names (on the halo's outer edge, away from 我; else turned a little either
 *      way; else left out)
 *
 * Pure: the renderer measures text and maps the layout to the screen; tests do the same
 * with `estimateTextWidth`.
 */

export type Box = { x: number; y: number; w: number; h: number };
export type LabelKind = "sector" | "ring" | "person" | "group";
export type Disc = { id: string; x: number; y: number; r: number };
export type Measure = (text: string, px: number) => number;

export type PersonLabelInput = {
  id: string;
  /** Already truncated (`truncateName`). */
  text: string;
  /** Disc centre and radius on screen. */
  x: number;
  y: number;
  r: number;
  /** 0 = the centre, 1..5 closeness rings, 6 = 间接认识. */
  ring: number;
  focused: boolean;
  /** Kept lit by a focus, an answer or a 淡化 filter. */
  lit: boolean;
};

export type LabelScene = {
  origin: { x: number; y: number };
  /** Ring names to show: screen radius of each ring. */
  rings: { label: string; r: number }[];
  /** Sector names: direction (radians, screen) and the screen radius they sit at. */
  sectors: { id: string; label: string; angle: number; r: number }[];
  /** Group halos on screen. */
  halos: { id: string; name: string; x: number; y: number; r: number }[];
  /** People whose name should show (semantic zoom already applied). */
  persons: PersonLabelInput[];
  /** Every drawn disc (labels keep off them, except their own person's). */
  discs: Disc[];
  font: { person: number; ring: number; sector: number; group: number };
  measure: Measure;
};

export type PlacedLabel = {
  /** Person id; `ring:<i>`, `sector:<category>`, `group:<id>` for the others. */
  id: string;
  kind: LabelKind;
  text: string;
  /** Drawn left-aligned at box.x, vertically centred in the box. */
  box: Box;
  fontSize: number;
};

/** Labels keep this far (px) from each other and from discs. */
export const LABEL_GAP = 2;
const NAME_GAP = 3;

export const MAX_NAME_LENGTH = 7;

export function truncateName(name: string, max = MAX_NAME_LENGTH): string {
  const chars = Array.from(name);
  return chars.length > max ? `${chars.slice(0, max).join("")}…` : name;
}

/** A text's width without a canvas: CJK and full-width characters are square, the rest
 *  about 0.6 em (close to the system UI fonts; tests and the layout use it). */
export function estimateTextWidth(text: string, px: number): number {
  let w = 0;
  for (const ch of text) {
    const code = ch.codePointAt(0) ?? 0;
    w += code >= 0x2e80 || ch === "…" ? px : px * 0.6;
  }
  return w;
}

/** Box height for a line of text at `px`. */
export const lineHeight = (px: number) => Math.ceil(px * 1.25);

export function boxesIntersect(a: Box, b: Box, gap = 0): boolean {
  return (
    a.x < b.x + b.w + gap && b.x < a.x + a.w + gap && a.y < b.y + b.h + gap && b.y < a.y + a.h + gap
  );
}

export function boxHitsDisc(b: Box, d: Disc, gap = 0): boolean {
  const cx = Math.max(b.x, Math.min(d.x, b.x + b.w));
  const cy = Math.max(b.y, Math.min(d.y, b.y + b.h));
  return Math.hypot(d.x - cx, d.y - cy) < d.r + gap;
}

/** Person order: focused, closer ring, lit, name, id. */
function comparePersons(a: PersonLabelInput, b: PersonLabelInput): number {
  return (
    Number(b.focused) - Number(a.focused) ||
    a.ring - b.ring ||
    Number(b.lit) - Number(a.lit) ||
    a.text.localeCompare(b.text) ||
    a.id.localeCompare(b.id)
  );
}

function personPositions(p: PersonLabelInput, w: number, h: number): Box[] {
  return [
    { x: p.x - w / 2, y: p.y + p.r + NAME_GAP, w, h }, // below
    { x: p.x - w / 2, y: p.y - p.r - NAME_GAP - h, w, h }, // above
    { x: p.x + p.r + NAME_GAP + 1, y: p.y - h / 2, w, h }, // right
    { x: p.x - p.r - NAME_GAP - 1 - w, y: p.y - h / 2, w, h }, // left
  ];
}

/** A box centred `dist` from (x, y) in direction `a`, pushed out so its near side is there. */
function boxOut(x: number, y: number, a: number, dist: number, w: number, h: number): Box {
  const ux = Math.cos(a);
  const uy = Math.sin(a);
  const push = (Math.abs(ux) * w) / 2 + (Math.abs(uy) * h) / 2;
  const cx = x + ux * (dist + push);
  const cy = y + uy * (dist + push);
  return { x: cx - w / 2, y: cy - h / 2, w, h };
}

/** Halo labels: on the outer edge (the glow fades out towards its radius). */
const HALO_EDGE = 0.7;
const HALO_TURNS = [0, 0.45, -0.45, 0.9, -0.9];

export function placeLabels(scene: LabelScene): PlacedLabel[] {
  const { origin, font, measure } = scene;
  const placed: PlacedLabel[] = [];
  const free = (b: Box, owner: string | null, avoidDiscs: boolean) =>
    placed.every((p) => !boxesIntersect(p.box, b, LABEL_GAP)) &&
    (!avoidDiscs || scene.discs.every((d) => d.id === owner || !boxHitsDisc(b, d, LABEL_GAP)));
  const tryPlace = (
    id: string,
    kind: LabelKind,
    text: string,
    fontSize: number,
    positions: Box[],
    owner: string | null,
    avoidDiscs = true,
  ) => {
    const box = positions.find((b) => free(b, owner, avoidDiscs));
    if (box) placed.push({ id, kind, text, box, fontSize });
  };

  // 1. sector names: where they are, whatever is under them
  for (const s of scene.sectors) {
    const w = measure(s.label, font.sector);
    const h = lineHeight(font.sector);
    const ax = origin.x + Math.cos(s.angle) * s.r;
    const ay = origin.y + Math.sin(s.angle) * s.r;
    const c = Math.cos(s.angle);
    const x = c > 0.2 ? ax : c < -0.2 ? ax - w : ax - w / 2;
    tryPlace(
      `sector:${s.id}`,
      "sector",
      s.label,
      font.sector,
      [{ x, y: ay - h / 2, w, h }],
      null,
      false,
    );
  }

  // 2. ring names, innermost first
  scene.rings.forEach((ring, i) => {
    const w = measure(ring.label, font.ring);
    const h = lineHeight(font.ring);
    const y = origin.y - ring.r - 3 - h;
    tryPlace(
      `ring:${i}`,
      "ring",
      ring.label,
      font.ring,
      [
        { x: origin.x + 4, y, w, h },
        { x: origin.x - 4 - w, y, w, h },
      ],
      null,
    );
  });

  // 3. person names, most important first
  for (const p of [...scene.persons].sort(comparePersons)) {
    const w = measure(p.text, font.person);
    const h = lineHeight(font.person);
    tryPlace(p.id, "person", p.text, font.person, personPositions(p, w, h), p.id);
  }

  // 4. group names on their halo's outer edge
  for (const g of [...scene.halos].sort((a, b) => a.id.localeCompare(b.id))) {
    const w = measure(g.name, font.group);
    const h = lineHeight(font.group);
    const dx = g.x - origin.x;
    const dy = g.y - origin.y;
    const out = Math.hypot(dx, dy) > 1 ? Math.atan2(dy, dx) : -Math.PI / 2;
    const positions = HALO_TURNS.map((t) => boxOut(g.x, g.y, out + t, g.r * HALO_EDGE, w, h));
    tryPlace(`group:${g.id}`, "group", g.name, font.group, positions, null);
  }
  return placed;
}

/** Any two of `boxes` that intersect (for tests and the debug state). */
export function overlappingLabels(boxes: { id: string; box: Box }[]): [string, string][] {
  const out: [string, string][] = [];
  for (let i = 0; i < boxes.length; i++) {
    for (let j = i + 1; j < boxes.length; j++) {
      if (boxesIntersect(boxes[i].box, boxes[j].box)) out.push([boxes[i].id, boxes[j].id]);
    }
  }
  return out;
}
