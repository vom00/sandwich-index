/**
 * Measures the page once per resize and turns it into the stage `Layout`:
 * where the sandwich sits in each chapter, how big it is, where the ruler,
 * the reading and the map go. Everything per-frame is then arithmetic on
 * this object; nothing in the scroll loop reads layout from the DOM.
 */

import type { Layout } from "./timeline";

/** The model's footprint: widest layer and the closed stack seen from above. */
const MODEL_WIDTH = 0.44;
const MODEL_HEIGHT = 0.4;
const EXPLODED_HEIGHT = 0.72;

/** Desktop: the content column, matching the page's `max-w-[68rem]` and `px-8`. */
const CONTAINER = 1088;
const SIDE_MIN = 1024;

export function measureLayout(story: HTMLElement, stage: HTMLElement, lo: number, hi: number): Layout {
  const vw = document.documentElement.clientWidth;
  const vh = stage.clientHeight || window.innerHeight;
  const side = vw >= SIDE_MIN;
  const scrollY = window.scrollY;
  const docTop = (el: Element | null) => (el ? el.getBoundingClientRect().top + scrollY : 0);

  const chapter = (name: string) => story.querySelector(`[data-ch="${name}"]`);
  const explodeEl = chapter("explode");
  const rulerEl = chapter("ruler");
  const mapEl = chapter("map");
  const copyOf = (el: Element | null) => el?.querySelector(".lc-copy")?.getBoundingClientRect();

  const storyTop = docTop(story);
  const mapTop = docTop(mapEl);
  const mapHeight = mapEl?.getBoundingClientRect().height ?? vh;

  const slotRect = story.querySelector("[data-slot='hero']")?.getBoundingClientRect();
  const slot = {
    docTop: slotRect ? slotRect.top + scrollY : storyTop,
    x: slotRect?.left ?? vw / 2,
    w: Math.max(160, slotRect?.width ?? 300),
    h: Math.max(160, slotRect?.height ?? 300),
  };
  const heroK = Math.min((slot.w * 0.86) / MODEL_WIDTH, (slot.h * 0.84) / MODEL_HEIGHT);

  let explode: Layout["explode"];
  let ruler: Layout["ruler"];
  let map: Layout["map"];

  if (side) {
    // Stage region: from the copy column's right edge to the content edge.
    const l = (copyOf(explodeEl)?.right ?? vw * 0.4) + 56;
    const r = vw - Math.max(32, (vw - CONTAINER) / 2);
    const w = r - l;
    const k = Math.min((vh * 0.62) / EXPLODED_HEIGHT, (w * 0.5) / MODEL_WIDTH);
    const labelX = l + w * 0.6;
    explode = { x: l + w * 0.28, y: vh * 0.5, k, pitch: 0.34, labelX, labelW: r - labelX };

    const rk = Math.min(380, (w * 0.34) / MODEL_WIDTH);
    const rx = l + 56;
    const sx = rx + 170 + 0.2 * rk;
    const right = sx + 0.22 * rk + 40;
    const roomRight = r - right >= 300;
    ruler = {
      x: rx,
      readingY: vh * 0.5,
      pxPerCent: 0,
      sandwich: { x: sx, y: vh * 0.5, k: rk, pitch: 0.4 },
      labelW: 150,
      readingX: roomRight ? right : r,
      readingY2: roomRight ? vh * 0.5 : vh * 0.5 + 0.24 * rk + 24,
      readingAlign: roomRight ? "left" : "right",
    };

    const mw = Math.min(vw - 40 - l, (vh * 0.8) / 0.62);
    map = { x: l, y: (vh - mw * 0.62) / 2, w: mw, h: mw * 0.62 };
  } else {
    // Each chapter's drawing gets the height its own copy panel leaves free.
    const band = (el: Element | null) => vh - (copyOf(el)?.height ?? vh * 0.44);

    const bandE = band(explodeEl);
    const k = Math.min((bandE * 0.84) / EXPLODED_HEIGHT, (vw * 0.46) / MODEL_WIDTH);
    const labelX = vw * 0.58;
    explode = { x: vw * 0.29, y: bandE * 0.52, k, pitch: 0.34, labelX, labelW: vw - labelX - 12 };

    const bandR = band(rulerEl);
    const rk = Math.min((vw * 0.3) / MODEL_WIDTH, 300);
    const rx = vw < 600 ? 58 : 100;
    const readingY = bandR * 0.36;
    const sx = vw * 0.7;
    ruler = {
      x: rx,
      readingY,
      pxPerCent: 0,
      sandwich: { x: sx, y: readingY, k: rk, pitch: 0.4 },
      // Mark and end labels must stop short of the sandwich.
      labelW: Math.max(84, sx - 0.24 * rk - (rx + 32) - 10),
      readingX: vw - 16,
      readingY2: readingY + 0.22 * rk + 16,
      readingAlign: "right",
    };

    const bandM = band(mapEl);
    let mw = vw - 24;
    if (mw * 0.62 > bandM - 32) mw = (bandM - 32) / 0.62;
    map = { x: (vw - mw) / 2, y: (bandM - mw * 0.62) / 2, w: mw, h: mw * 0.62 };
  }

  // The tape is a few screens long whatever the range, ticked every cent.
  ruler.pxPerCent = Math.min(9, Math.max(3, (2.4 * vh) / Math.max(1, hi - lo)));

  // One square canvas big enough for the largest pose; poses then only zoom.
  const box = Math.ceil(Math.max(heroK * 0.62, explode.k * 0.86, ruler.sandwich.k * 0.62, 160) / 2) * 2;

  // Chapter boundaries sit a third of a screen before each chapter's top, so
  // the drawing starts changing as the new copy arrives.
  const lead = vh * 0.35;
  return {
    vw,
    vh,
    side,
    storyTop,
    bounds: [storyTop, docTop(explodeEl) - lead, docTop(rulerEl) - lead, mapTop - lead, mapTop + mapHeight - vh],
    slot,
    box,
    heroK,
    explode,
    ruler,
    map,
  };
}
