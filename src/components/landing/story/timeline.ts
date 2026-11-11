/**
 * The landing story's scroll timeline, as pure functions.
 *
 * The story is one number, `S`, read from `scrollY` every frame:
 *   0..1 hero leaving   1..2 exploded view   2..3 price ruler   3..4 dot map
 * Everything on the pinned stage (the canvas box, the leader lines, the ruler,
 * the dot map) is a function of `S` and the layout measured on resize, so the
 * 3D object and the DOM around it are always computed in the same frame.
 */

export const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
export const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
export const smooth = (t: number) => {
  const c = clamp01(t);
  return c * c * (3 - 2 * c);
};
export const easeInOutCubic = (t: number) => {
  const c = clamp01(t);
  return c < 0.5 ? 4 * c * c * c : 1 - (-2 * c + 2) ** 3 / 2;
};
export const easeOutCubic = (t: number) => 1 - (1 - clamp01(t)) ** 3;
/** 0→1 across [from, to], eased, flat outside. */
export const span = (t: number, from: number, to: number) => easeInOutCubic((t - from) / (to - from));

/* -------------------------------------------------------------------------- */
/* The sandwich's geometry, in model units (after restacking the Kenney parts) */

export const GAP = 0.12;
/** bottom bun, patty, lettuce, top bun: base height, thickness, rim radius. */
export const LAYERS = [
  { base: 0, h: 0.04, r: 0.18, anchor: 0.02 },
  { base: 0.04, h: 0.056, r: 0.189, anchor: 0.028 },
  { base: 0.096, h: 0.03, r: 0.2, anchor: 0.015 },
  { base: 0.12, h: 0.12, r: 0.187, anchor: 0.03 },
] as const;
export const STACK_HEIGHT = 0.24;

export interface Pose {
  /** Centre of the sandwich on the stage, CSS px. */
  x: number;
  y: number;
  /** CSS px per model unit. */
  k: number;
  /** Camera elevation, radians. */
  pitch: number;
}

export interface Layout {
  vw: number;
  vh: number;
  side: boolean;
  /** Document y where the story starts, and the four chapter boundaries after it. */
  storyTop: number;
  bounds: [number, number, number, number, number];
  /** The hero slot: document top and stage-relative x, plus size. */
  slot: { docTop: number; x: number; w: number; h: number };
  /** The canvas box's side, CSS px. */
  box: number;
  heroK: number;
  explode: Pose & { labelX: number; labelW: number };
  ruler: {
    x: number;
    readingY: number;
    pxPerCent: number;
    sandwich: Pose;
    /** Width available to the mark and end labels beside the tape. */
    labelW: number;
    readingX: number;
    readingY2: number;
    readingAlign: "left" | "right";
  };
  map: { x: number; y: number; w: number; h: number };
}

export interface RulerScale {
  lo: number;
  hi: number;
  marks: number[];
}

export interface StageState {
  S: number;
  sandwich: Pose & { yaw: number; explode: number; shadow: number; scale: number; visible: boolean };
  labels: number;
  title: number;
  ruler: number;
  rulerSlide: number;
  cents: number;
  map: number;
  /** Dot flight progress 0..1. */
  flight: number;
  /** Highlight weights: cheapest tenth, dearest tenth, both at the end. */
  wLow: number;
  wHigh: number;
  wEnd: number;
  origin: number;
}

/** Scroll position → story clock. */
export function storyClock(y: number, layout: Layout): number {
  const b = layout.bounds;
  if (y <= b[0]) return 0;
  for (let i = 0; i < 4; i += 1) {
    const from = b[i]!;
    const to = b[i + 1]!;
    if (y < to) return i + (y - from) / Math.max(1, to - from);
  }
  return 4;
}

/**
 * The price on the tape for ruler progress `t` (0..1 over the ride). Holds
 * briefly at each national mark so the reader sees the reading land on it.
 */
export function rideCents(t: number, scale: RulerScale): number {
  const { lo, hi } = scale;
  if (hi <= lo) return lo;
  const marks = scale.marks.filter((m) => m > lo && m < hi).sort((a, b) => a - b);
  const stops = [lo, ...marks, hi];
  const hold = 0.06;
  const travel = Math.max(0.1, 1 - hold * marks.length);
  let clock = clamp01(t);
  for (let i = 0; i < stops.length - 1; i += 1) {
    const a = stops[i]!;
    const b = stops[i + 1]!;
    const d = (travel * (b - a)) / (hi - lo);
    if (clock <= d) return a + (b - a) * smooth(clock / d);
    clock -= d;
    if (i < stops.length - 2) {
      if (clock <= hold) return b;
      clock -= hold;
    }
  }
  return hi;
}

const lerpPose = (a: Pose, b: Pose, t: number): Pose => ({
  x: lerp(a.x, b.x, t),
  y: lerp(a.y, b.y, t),
  k: lerp(a.k, b.k, t),
  pitch: lerp(a.pitch, b.pitch, t),
});

export function stageState(S: number, y: number, layout: Layout, scale: RulerScale, spin: number): StageState {
  const hero: Pose = {
    x: layout.slot.x + layout.slot.w / 2,
    y: layout.slot.docTop - Math.max(y, layout.storyTop) + layout.slot.h / 2,
    k: layout.heroK,
    pitch: 0.42,
  };
  const ex: Pose = layout.explode;
  const ru: Pose = layout.ruler.sandwich;
  const mapOrigin: Pose = {
    x: layout.map.x + layout.map.w / 2,
    y: layout.map.y + layout.map.h / 2,
    k: ru.k * 0.6,
    pitch: 0.5,
  };

  const st: StageState = {
    S,
    sandwich: { ...hero, yaw: 0, explode: 0, shadow: 1, scale: 1, visible: true },
    labels: 0,
    title: 0,
    ruler: 0,
    rulerSlide: 0,
    cents: scale.lo,
    map: 0,
    flight: 0,
    wLow: 0,
    wHigh: 0,
    wEnd: 0,
    origin: 0,
  };

  // The turn: time while in the hero, then scroll takes over.
  const yaw = spin + S * 1.6;

  let pose: Pose = hero;
  if (S < 1) {
    pose = lerpPose(hero, { ...ex, pitch: 0.3 }, span(S, 0.15, 1));
  } else if (S < 2) {
    const t = S - 1;
    const e = span(t, 0.05, 0.4);
    pose = { ...ex, pitch: lerp(0.3, ex.pitch, e) };
    st.sandwich.explode = e;
    st.sandwich.shadow = 1 - 0.5 * e;
    st.labels = span(t, 0.3, 0.45) * (1 - span(t, 0.9, 1));
    st.title = span(t, 0.38, 0.52) * (1 - span(t, 0.9, 1));
  } else if (S < 3) {
    const t = S - 2;
    const close = span(t, 0, 0.14);
    pose = lerpPose(ex, ru, close);
    st.sandwich.explode = 1 - close;
    st.sandwich.shadow = lerp(0.5, 0.75, close);
    st.ruler = span(t, 0.04, 0.16) * (1 - span(t, 0.97, 1));
    st.rulerSlide = 1 - span(t, 0.04, 0.16);
    st.cents = rideCents((t - 0.16) / 0.74, scale);
  } else if (S < 4) {
    const t = S - 3;
    const go = span(t, 0, 0.12);
    pose = lerpPose(ru, mapOrigin, go);
    st.sandwich.scale = 1 - span(t, 0.04, 0.13);
    st.sandwich.shadow = 0.75 * (1 - go);
    st.cents = scale.hi;
    st.ruler = 1 - span(t, 0, 0.06);
    st.map = span(t, 0.08, 0.14);
    st.origin = span(t, 0.1, 0.13) * (1 - span(t, 0.16, 0.2));
    st.flight = clamp01((t - 0.14) / 0.46);
    st.wLow = span(t, 0.62, 0.67) * (1 - span(t, 0.77, 0.81));
    st.wHigh = span(t, 0.77, 0.81);
    st.wEnd = span(t, 0.92, 0.96);
  } else {
    pose = mapOrigin;
    st.sandwich.scale = 0;
    st.map = 1;
    st.flight = 1;
    st.wHigh = 1;
    st.wEnd = 1;
    st.cents = scale.hi;
  }

  st.sandwich.x = pose.x;
  st.sandwich.y = pose.y;
  st.sandwich.k = pose.k;
  st.sandwich.pitch = pose.pitch;
  st.sandwich.yaw = yaw;
  st.sandwich.visible = st.sandwich.scale > 0.002;
  return st;
}

/**
 * Where each layer's leader line starts, in stage px: the rim point facing
 * the label column, at the layer's mid height. Orthographic, so this is the
 * same projection the camera does.
 */
export function layerAnchors(s: StageState["sandwich"], out: Float32Array): void {
  const stackH = STACK_HEIGHT + 3 * GAP * s.explode;
  const cos = Math.cos(s.pitch);
  const k = s.k * s.scale;
  for (let i = 0; i < 4; i += 1) {
    const layer = LAYERS[i]!;
    const yModel = layer.base + GAP * s.explode * i + layer.anchor - stackH / 2;
    out[i * 2] = s.x + layer.r * k;
    out[i * 2 + 1] = s.y - yModel * cos * k;
  }
}
