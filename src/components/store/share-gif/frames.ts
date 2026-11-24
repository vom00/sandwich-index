import type { StoreCard } from "@/lib/store-card";

/**
 * The frames of a store's receipt GIF, drawn on a canvas in the page so they
 * use the page's own Plex Mono. The same slip as the link-preview card
 * (`components/og/receipt`), cut to a square: blank paper first, then the
 * print head runs down it a row at a time, and as it reaches the price the
 * figure rolls up on its wheels with the page's own odometer timing (1100ms a
 * wheel, 70ms between wheels, ease-out-expo). The last frame holds. Nothing
 * repeats: the encoder writes no loop.
 *
 * Pure apart from the canvas it draws on, and the timing is exported for tests.
 */

export const SIZE = 600;
export const FRAME_MS = 50;
/** The print head, top of the slip to the bottom. */
export const PRINT_MS = 1100;
/** One price wheel, as `.odo-col` on the page. */
export const WHEEL_MS = 1100;
export const WHEEL_STAGGER_MS = 70;
/** The blank slip before printing starts, and the finished card at the end. */
export const LEAD_MS = 250;
export const HOLD_MS = 4000;

// The site's tokens (globals.css).
const PAPER_SUNKEN = "#f2efe8";
const SLIP = "#ffffff";
const INK = "#15140f";
const INK_MUTED = "#524f45";
const INK_SUBTLE = "#6b675b";
const TIER: Record<NonNullable<StoreCard["tier"]>, string> = { low: "#0f5c55", mid: "#8a5a12", high: "#7b2d3b" };

const SLIP_W = 404;
const SLIP_X = (SIZE - SLIP_W) / 2;
const PAD = 30;
const TOOTH = 12.625;
const PRICE_PX = 54;

const easeOutExpo = (t: number) => (t >= 1 ? 1 : 1 - 2 ** (-10 * t));
const clamp01 = (t: number) => Math.min(1, Math.max(0, t));

type Draw = (context: CanvasRenderingContext2D, now: number) => void;

interface Layout {
  top: number;
  height: number;
  priceTop: number;
  draws: Draw[];
  /** When the price wheels start, in ms from the GIF's start; set once laid out. */
  wheels: { from: number };
}

function wrap(context: CanvasRenderingContext2D, text: string, width: number, maxLines: number): string[] {
  const lines: string[] = [];
  let line = "";
  for (const word of text.split(/\s+/)) {
    const next = line === "" ? word : `${line} ${word}`;
    if (context.measureText(next).width <= width || line === "") line = next;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line !== "") lines.push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = `${kept[maxLines - 1]!.replace(/\s*\S*$/, "")}…`;
    return kept;
  }
  return lines;
}

function setFont(context: CanvasRenderingContext2D, font: string, px: number, weight: 400 | 500, spacing = 0): void {
  context.font = `${weight} ${px}px ${font}`;
  context.letterSpacing = `${spacing}px`;
}

/** Where everything sits on the slip, measured once. */
function layout(context: CanvasRenderingContext2D, card: StoreCard, font: string, host: string): Layout {
  const inner = SLIP_W - PAD * 2;
  const left = SLIP_X + PAD;
  const right = SLIP_X + SLIP_W - PAD;
  const draws: Draw[] = [];
  const wheels = { from: 0 };
  let y = 0;

  const text = (value: string, px: number, weight: 400 | 500, color: string, align: CanvasTextAlign, x: number, spacing = 0) => {
    const at = y;
    draws.push((c) => {
      setFont(c, font, px, weight, spacing);
      c.fillStyle = color;
      c.textAlign = align;
      c.textBaseline = "top";
      c.fillText(value, x, at);
    });
  };
  const rule = () => {
    y += 14;
    const at = y;
    draws.push((c) => {
      c.strokeStyle = INK_SUBTLE;
      c.lineWidth = 1.5;
      c.setLineDash([5, 4]);
      c.beginPath();
      c.moveTo(left, at);
      c.lineTo(right, at);
      c.stroke();
      c.setLineDash([]);
    });
    y += 14;
  };
  const line = (label: string, value: string, color: string, tier: StoreCard["tier"]) => {
    text(label, 12, 400, INK_SUBTLE, "left", left, 1);
    const at = y;
    draws.push((c) => {
      setFont(c, font, 13, 500);
      c.fillStyle = color;
      c.textAlign = "right";
      c.textBaseline = "top";
      c.fillText(value, right, at);
      if (tier !== null) {
        const x = right - c.measureText(value).width - 16;
        c.fillStyle = TIER[tier];
        c.beginPath();
        if (tier === "mid") c.arc(x + 5, at + 6.5, 4.5, 0, Math.PI * 2);
        else if (tier === "low") {
          c.moveTo(x, at + 2);
          c.lineTo(x + 10, at + 2);
          c.lineTo(x + 5, at + 11);
        } else {
          c.moveTo(x, at + 11);
          c.lineTo(x + 10, at + 11);
          c.lineTo(x + 5, at + 2);
        }
        c.fill();
      }
    });
    y += 22;
  };

  text("SANDWICH INDEX", 18, 500, INK, "center", SIZE / 2, 4);
  y += 25;
  text("MCCHICKEN PRICE CHECK", 11, 400, INK_SUBTLE, "center", SIZE / 2, 2);
  y += 13;
  rule();

  text("STORE", 11, 400, INK_SUBTLE, "left", left, 2);
  y += 18;
  setFont(context, font, 16, 500);
  for (const row of wrap(context, card.store, inner, 2)) {
    text(row, 16, 500, INK, "left", left);
    y += 21;
  }
  if (card.qualifier !== null) {
    text(`(${card.qualifier})`, 12, 400, INK_MUTED, "left", left);
    y += 17;
  }
  rule();

  const priceTop = y;
  const price = card.price ?? "NO PRICE YET";
  // The label sits on the price's baseline, as on the link-preview card.
  y += card.price === null ? 2 : 24;
  text("1 MCCHICKEN", 14, 500, INK, "left", left, 2);
  y = priceTop;
  draws.push((c, now) => drawPrice(c, font, price, right, priceTop - 8, now - wheels.from));
  y += card.price === null ? 24 : 50;
  line("TIER", card.tierLabel ?? "—", card.tier === null ? INK_SUBTLE : TIER[card.tier], card.tier);
  line(card.dateLabel, card.date ?? "—", card.date === null ? INK_SUBTLE : INK, null);
  rule();

  setFont(context, font, 10.5, 400);
  for (const row of wrap(context, card.source, inner, 3)) {
    text(row, 10.5, 400, INK_SUBTLE, "left", left);
    y += 15;
  }
  y += 8;
  text(host, 10.5, 400, INK_SUBTLE, "center", SIZE / 2, 1);
  y += 14;

  const height = y + PAD * 1.6;
  const top = Math.round((SIZE - height) / 2);
  // Everything above was laid out from 0; move it onto the slip.
  const shift = top + PAD * 0.9;
  const placed = draws.map<Draw>((draw) => (c, now) => {
    c.save();
    c.translate(0, shift);
    draw(c, now);
    c.restore();
  });
  return { top, height, priceTop: priceTop + shift, draws: placed, wheels };
}

/** When the price wheels start: as the print head reaches the price row. */
function rollStart(view: Layout): number {
  return LEAD_MS + PRINT_MS * clamp01((view.priceTop - view.top) / view.height);
}

/** The price, right-aligned, its digits on wheels that roll up from 0. `elapsed`: ms since the wheels started. */
function drawPrice(c: CanvasRenderingContext2D, font: string, price: string, right: number, top: number, elapsed: number): void {
  const px = price.startsWith("$") ? PRICE_PX : 22;
  setFont(c, font, px, 500, price.startsWith("$") ? -1 : 1);
  c.fillStyle = INK;
  c.textAlign = "left";
  c.textBaseline = "top";
  const advance = c.measureText("0").width - (price.startsWith("$") ? 1 : -1);
  const width = advance * price.length;
  // Each wheel shows through a window just the height of a figure, so the
  // digits rolling in and out never cross the rule above or the line below.
  const lineHeight = px * 0.9;
  const windowTop = px * 0.04;
  const windowHeight = px * 0.8;
  let digit = 0;
  Array.from(price).forEach((character, i) => {
    const x = right - width + i * advance;
    const y = top + (price.startsWith("$") ? 0 : 20);
    const value = Number(character);
    if (!/[0-9]/.test(character)) {
      c.fillText(character, x, y);
      return;
    }
    const k = digit++;
    const roll = value * easeOutExpo(clamp01((elapsed - k * WHEEL_STAGGER_MS) / WHEEL_MS));
    const base = Math.floor(roll);
    c.save();
    c.beginPath();
    c.rect(x - 2, y + windowTop, advance + 4, windowHeight);
    c.clip();
    for (const n of [base, base + 1]) {
      if (n > 9) continue;
      c.fillText(String(n), x, y + (n - roll) * lineHeight);
    }
    c.restore();
  });
}

function drawSlip(c: CanvasRenderingContext2D, top: number, height: number): void {
  c.fillStyle = PAPER_SUNKEN;
  c.fillRect(0, 0, SIZE, SIZE);
  c.save();
  c.shadowColor = "rgba(21, 20, 15, 0.16)";
  c.shadowBlur = 14;
  c.shadowOffsetY = 8;
  c.fillStyle = SLIP;
  c.beginPath();
  // Torn edges: teeth up along the top, down along the bottom.
  c.moveTo(SLIP_X, top + 6);
  for (let x = SLIP_X; x < SLIP_X + SLIP_W - 0.5; x += TOOTH) {
    c.lineTo(x + TOOTH / 2, top);
    c.lineTo(x + TOOTH, top + 6);
  }
  c.lineTo(SLIP_X + SLIP_W, top + height - 6);
  for (let x = SLIP_X + SLIP_W; x > SLIP_X + 0.5; x -= TOOTH) {
    c.lineTo(x - TOOTH / 2, top + height);
    c.lineTo(x - TOOTH, top + height - 6);
  }
  c.closePath();
  c.fill();
  c.restore();
}

export interface Frames {
  width: number;
  height: number;
  frames: ArrayBuffer[];
  delays: number[];
}

/** Frame times, in milliseconds from the start, for a card whose price wheels start at `rollAt`. */
export function frameTimes(rollAt: number, digits: number): number[] {
  const end = Math.max(LEAD_MS + PRINT_MS, rollAt + Math.max(0, digits - 1) * WHEEL_STAGGER_MS + WHEEL_MS);
  const times = [0];
  for (let t = LEAD_MS; t < end; t += FRAME_MS) times.push(t);
  times.push(end);
  return times;
}

export function renderFrames(card: StoreCard, font: string, host: string): Frames {
  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const context = canvas.getContext("2d", { willReadFrequently: true })!;
  const view = layout(context, card, font, host);
  view.wheels.from = rollStart(view);
  const digits = (card.price ?? "").replace(/[^0-9]/g, "").length;
  const times = frameTimes(view.wheels.from, digits);

  const frames: ArrayBuffer[] = [];
  const delays: number[] = [];
  times.forEach((now, i) => {
    drawSlip(context, view.top, view.height);
    const printed = view.top + view.height * clamp01((now - LEAD_MS) / PRINT_MS);
    context.save();
    context.beginPath();
    context.rect(0, 0, SIZE, printed);
    context.clip();
    for (const draw of view.draws) draw(context, now);
    context.restore();
    frames.push(context.getImageData(0, 0, SIZE, SIZE).data.buffer as ArrayBuffer);
    const next = times[i + 1];
    delays.push(next === undefined ? HOLD_MS : next - now);
  });
  return { width: SIZE, height: SIZE, frames, delays };
}
