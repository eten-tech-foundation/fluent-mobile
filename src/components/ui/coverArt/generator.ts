/**
 * Passage cover art as plain data: the same passage at the same progress
 * always gets the same cover. Soft blobs and gradients stand in for a noise
 * field, and every colour comes from one ramp over that field. Zero progress
 * has no blue, which covers never reach (see `artProgress`); more progress
 * adds blue and brightness.
 */

export type CoverStyle = 'mist' | 'current' | 'dawn';
/** `night` is the darker ground, for books; `surface` is for passages. */
export type CoverPalette = 'night' | 'surface';

export interface CoverColors {
  ground: string;
  /** The haze over the ground in the lightest places. */
  tone: string;
  /** Status blues, darkest first: Foundations blue 900 to 500. */
  status: readonly string[];
}

export interface CoverArtInput {
  /** Stable passage id, e.g. "Mark:pericope::2". */
  seed: string;
  /** Art progress, 0–1: `artProgress(recordedVerses / totalVerses)`. */
  progress: number;
  style: CoverStyle;
}

/** A gradient across the cover; points are fractions of its size. */
export interface CoverGradient {
  from: { x: number; y: number };
  to: { x: number; y: number };
  stops: { offset: number; color: string }[];
}

/**
 * A soft ellipse in a 100 × 100 box, its colour stepping down from the centre
 * out to its fully transparent edge.
 */
export interface CoverBlob {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  rotation: number;
  stops: { offset: number; color: string; opacity: number }[];
}

export interface CoverArtSpec {
  ground: string;
  gradient: CoverGradient | null;
  blobs: CoverBlob[];
}

/** FNV-1a. */
export function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** mulberry32, seeded from a string. */
export function rng(seed: string): () => number {
  let a = hash(seed);
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Per group, so a group's covers read as a set. */
export function pickStyle(groupSeed: string): CoverStyle {
  const r = rng(`style:${groupSeed}`)();
  if (r < 1 / 3) return 'mist';
  return r < 2 / 3 ? 'current' : 'dawn';
}

type Rgb = [number, number, number];

function toRgb(hex: string): Rgb {
  const n = parseInt(hex.slice(1, 7), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function toHex([r, g, b]: Rgb): string {
  const part = (v: number) =>
    Math.round(Math.min(255, Math.max(0, v)))
      .toString(16)
      .padStart(2, '0');
  return `#${part(r)}${part(g)}${part(b)}`.toUpperCase();
}

function mix(a: Rgb, b: Rgb, t: number): Rgb {
  return [
    a[0] + (b[0] - a[0]) * t,
    a[1] + (b[1] - a[1]) * t,
    a[2] + (b[2] - a[2]) * t,
  ];
}

function clamp01(x: number): number {
  return Math.min(1, Math.max(0, x));
}

function smoothstep(lo: number, hi: number, x: number): number {
  const q = clamp01((x - lo) / (hi - lo));
  return q * q * (3 - 2 * q);
}

/**
 * The colour at field value `u` (0 darkest, 1 lightest). Neutral haze at zero
 * progress, then blue blends into the lightest places, reaching further and
 * brighter as progress grows.
 */
function rampColor(
  u: number,
  progress: number,
  threshold: number,
  colors: CoverColors,
): string {
  const blues = colors.status.map(toRgb);
  const blueAt = (x: number): Rgb => {
    const c = Math.min(blues.length - 1, Math.max(0, x));
    const i = Math.max(0, Math.min(blues.length - 2, Math.floor(c)));
    const lo = blues[i] ?? toRgb(colors.tone);
    return mix(lo, blues[i + 1] ?? lo, c - i);
  };

  let col = mix(
    toRgb(colors.ground),
    toRgb(colors.tone),
    Math.pow(u, 1.4) * 0.75,
  );
  if (progress <= 0) return toHex(col);
  const top = 0.8 + 1.6 * progress;
  const amt = smoothstep(threshold - 0.3, threshold + 0.35, u);
  col = mix(col, blueAt(Math.min(top, 0.4 + u * top)), amt * 0.9);
  return toHex(col);
}

/**
 * Smooth value noise over the cover, `cols` × `rows` features across, at a
 * seeded offset so the lattice doesn't line up with the edges. Takes and
 * returns 0–1.
 */
function valueNoise(
  seed: string,
  cols: number,
  rows: number,
): (x: number, y: number) => number {
  const rnd = rng(seed);
  const ox = rnd();
  const oy = rnd();
  const width = cols + 2;
  const lattice = Array.from({ length: width * (rows + 2) }, () => rnd());
  const at = (i: number, j: number) => lattice[j * width + i] ?? 0;
  return (x, y) => {
    const fx = clamp01(x) * cols + ox;
    const fy = clamp01(y) * rows + oy;
    const i = Math.floor(fx);
    const j = Math.floor(fy);
    const sx = smoothstep(0, 1, fx - i);
    const sy = smoothstep(0, 1, fy - j);
    const top = at(i, j) + (at(i + 1, j) - at(i, j)) * sx;
    const bottom = at(i, j + 1) + (at(i + 1, j + 1) - at(i, j + 1)) * sx;
    return top + (bottom - top) * sy;
  };
}

/** Field values spread to fill 0–1, like normalised noise. */
function normalise(values: number[]): number[] {
  const lo = Math.min(...values);
  const hi = Math.max(...values);
  return values.map(v => (hi > lo ? (v - lo) / (hi - lo) : 0.5));
}

/**
 * Mist: big soft clouds, wider than tall, about three across. Past half
 * progress a second, finer layer adds detail. Blue seeps into the lightest
 * folds first.
 */
function mist(
  { seed, progress }: CoverArtInput,
  colors: CoverColors,
): CoverArtSpec {
  const threshold = 0.75 - 0.4 * progress;
  const color = (u: number) => rampColor(u, progress, threshold, colors);
  const blob = (
    rnd: () => number,
    cx: number,
    cy: number,
    size: number,
  ): BlobShape => {
    const rx = size * (0.8 + 0.4 * rnd());
    return {
      cx: cx + (rnd() - 0.5) * size * 0.6,
      cy: cy + (rnd() - 0.5) * size * 0.4,
      rx,
      ry: rx / 1.5,
      rotation: (rnd() - 0.5) * 30,
    };
  };

  // Heights come from a smooth field, so neighbouring clouds are alike and
  // the light ones join into folds. Higher clouds are a little smaller, and
  // each falls off to the field around it.
  const field = valueNoise(`mist-field:${seed}`, 3, 4);
  const fold = (u: number, opacity: number): CoverBlob['stops'] => [
    { offset: 0, color: color(u), opacity },
    { offset: 0.45, color: color(u * 0.85), opacity: opacity * 0.75 },
    { offset: 1, color: color(u * 0.65), opacity: 0 },
  ];

  const rnd = rng(`mist:${seed}`);
  const COLS = 4;
  const ROWS = 5;
  const shapes = Array.from({ length: COLS * ROWS }, (_, i) =>
    blob(
      rnd,
      (((i % COLS) + 0.5) / COLS) * 100,
      ((Math.floor(i / COLS) + 0.5) / ROWS) * 100,
      36,
    ),
  );
  const heights = normalise(shapes.map(s => field(s.cx / 100, s.cy / 100)));
  const blobs: FieldBlob[] = shapes.map((s, i) => {
    const u = heights[i] ?? 0;
    const shrink = 1.1 - 0.3 * u;
    return {
      ...s,
      rx: s.rx * shrink,
      ry: s.ry * shrink,
      stops: fold(u, 0.9),
      u,
    };
  });

  if (progress > 0.5) {
    const fine = rng(`mist-detail:${seed}`);
    for (let i = 0; i < 8; i++) {
      const s = blob(fine, fine() * 100, fine() * 100, 14);
      const u = clamp01(
        0.15 + 0.85 * field(s.cx / 100, s.cy / 100) + (fine() - 0.5) * 0.3,
      );
      blobs.push({ ...s, stops: fold(u, 0.6), u });
    }
  }

  return {
    ground: colors.ground,
    gradient: null,
    blobs: sortByHeight(blobs),
  };
}

/**
 * Current and Dawn: a gradient from dark to light, gently warped. Current
 * runs top to bottom, so blue rises from the bottom; Dawn turns it onto a
 * seeded diagonal, so blue glows in from a corner. Warping grows with
 * progress.
 */
function warpedGradient(
  { seed, progress, style }: CoverArtInput,
  colors: CoverColors,
): CoverArtSpec {
  const threshold = 0.9 - 0.6 * progress;
  const fieldAt = (t: number) => clamp01((0.85 * t - 0.005) / 1.05);
  const color = (u: number) => rampColor(u, progress, threshold, colors);
  const rnd = rng(`${style}:${seed}`);

  const angle = style === 'dawn' ? (-(30 + rnd() * 35) * Math.PI) / 180 : 0;
  const dir = { x: -Math.sin(angle), y: Math.cos(angle) };
  const STOPS = 9;
  const gradient: CoverGradient = {
    from: { x: 0.5 - 0.5 * dir.x, y: 0.5 - 0.5 * dir.y },
    to: { x: 0.5 + 0.5 * dir.x, y: 0.5 + 0.5 * dir.y },
    stops: Array.from({ length: STOPS }, (_, i) => {
      const offset = i / (STOPS - 1);
      return { offset, color: color(fieldAt(offset)) };
    }),
  };

  const warp = 0.14 + 0.1 * progress;
  const blobs = Array.from({ length: 6 }, (): FieldBlob => {
    const cx = rnd() * 100;
    const cy = rnd() * 100;
    const rx = 22 + rnd() * 14;
    const t = (cx / 100 - 0.5) * dir.x + (cy / 100 - 0.5) * dir.y + 0.5;
    const u = fieldAt(t + (rnd() * 2 - 1) * warp);
    const c = color(u);
    return {
      cx,
      cy,
      rx,
      ry: rx * (0.7 + rnd() * 0.4),
      rotation: (rnd() - 0.5) * 60,
      stops: [
        { offset: 0, color: c, opacity: 0.85 },
        { offset: 0.5, color: c, opacity: 0.85 * 0.6 },
        { offset: 1, color: c, opacity: 0 },
      ],
      u,
    };
  });

  return { ground: colors.ground, gradient, blobs: sortByHeight(blobs) };
}

type BlobShape = Omit<CoverBlob, 'stops'>;

/** A blob and the field value its colour came from. */
type FieldBlob = CoverBlob & { u: number };

/** Lightest last, so the lightest folds sit on top. */
function sortByHeight(blobs: FieldBlob[]): CoverBlob[] {
  return [...blobs]
    .sort((a, b) => a.u - b.u)
    .map(({ cx, cy, rx, ry, rotation, stops }) => ({
      cx,
      cy,
      rx,
      ry,
      rotation,
      stops,
    }));
}

/** Art progress before anything is recorded, so no cover starts blank. */
const ART_START = 0.3;

/** How far along a cover's art is drawn for how much is recorded, both 0–1. */
export function artProgress(recorded: number): number {
  return ART_START + (1 - ART_START) * clamp01(recorded);
}

export function coverArtSpec(
  input: CoverArtInput,
  colors: CoverColors,
): CoverArtSpec {
  const clamped = { ...input, progress: clamp01(input.progress) };
  return input.style === 'mist'
    ? mist(clamped, colors)
    : warpedGradient(clamped, colors);
}
