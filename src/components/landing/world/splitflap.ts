/**
 * Split-flap timing for the price board in the landing scene's counter shot.
 *
 * When the board moves to another price, each character that changes turns
 * like a station departure board: its flaps fall one at a time, always
 * forward through the drum, until the new character is showing, and then it
 * stops. Columns start left to right, a few tens of milliseconds apart.
 * Nothing repeats: once every column has landed the board is still until the
 * next price.
 *
 * Pure functions of time, so the scene can draw any moment of a flip and the
 * timing can be tested without a canvas. The drawing is in `world.ts`.
 */

/** The characters on a column's drum, in the order its flaps turn. */
export const DRUM = " $.0123456789";

/**
 * Between two digits a column turns on its digits alone, like the number
 * wheels on a price board: 9 to 0 is one flap, not a trip past "$" and ".".
 */
const DIGITS = "0123456789";

function drumFor(from: string, to: string): string {
  return DIGITS.includes(from) && DIGITS.includes(to) ? DIGITS : DRUM;
}

/** One flap falling: inside the 60-90ms a real board takes. */
export const FLIP_MS = 75;

/** Between one changing column starting and the next, left to right. */
export const STAGGER_MS = 30;

export interface FlapColumn {
  from: string;
  to: string;
  /** How many flaps fall to get from `from` to `to` (0: this column does not move). */
  flips: number;
  /** When this column starts, after the flip does. */
  delay: number;
}

export interface Flip {
  columns: FlapColumn[];
  start: number;
  /** When the last column lands, after `start`. */
  duration: number;
}

/** One column at one moment: the flap now falling takes `current` away and shows `next`. */
export interface FlapFrame {
  current: string;
  next: string;
  /** 0 to 1 through the flap now falling; 0 when the column is still. */
  progress: number;
}

/** Flaps from one character to another, forward only. Off the drum (the dash for no price): one flap. */
export function flapsBetween(from: string, to: string): number {
  if (from === to) return 0;
  const drum = drumFor(from, to);
  const a = drum.indexOf(from);
  const b = drum.indexOf(to);
  if (a < 0 || b < 0) return 1;
  return (b - a + drum.length) % drum.length;
}

/**
 * Plan a flip from the text on the board to the next. Right-aligned, so the
 * same place value turns in the same column ($9.99 to $10.09).
 */
export function planFlip(from: string, to: string, start: number): Flip {
  const width = Math.max(from.length, to.length);
  const a = Array.from(from.padStart(width, " "));
  const b = Array.from(to.padStart(width, " "));
  let order = 0;
  let duration = 0;
  const columns = b.map((target, index) => {
    const source = a[index] ?? " ";
    const flips = flapsBetween(source, target);
    const delay = flips > 0 ? order++ * STAGGER_MS : 0;
    duration = Math.max(duration, delay + flips * FLIP_MS);
    return { from: source, to: target, flips, delay };
  });
  return { columns, start, duration };
}

/** A column `elapsed` milliseconds into its flip. */
export function columnAt(column: FlapColumn, elapsed: number): FlapFrame {
  const local = elapsed - column.delay;
  if (column.flips === 0 || local >= column.flips * FLIP_MS) {
    return { current: column.to, next: column.to, progress: 0 };
  }
  if (local <= 0) return { current: column.from, next: column.from, progress: 0 };
  const fallen = Math.floor(local / FLIP_MS);
  const progress = (local - fallen * FLIP_MS) / FLIP_MS;
  const drum = drumFor(column.from, column.to);
  const origin = drum.indexOf(column.from);
  if (origin < 0) return { current: column.from, next: column.to, progress };
  const current = drum[(origin + fallen) % drum.length] ?? column.to;
  const next = fallen + 1 >= column.flips ? column.to : (drum[(origin + fallen + 1) % drum.length] ?? column.to);
  return { current, next, progress };
}

/** Every column of a flip at `now`, and whether the whole board has landed. */
export function flipAt(flip: Flip, now: number): { columns: FlapFrame[]; done: boolean } {
  const elapsed = now - flip.start;
  return {
    columns: flip.columns.map((column) => columnAt(column, elapsed)),
    done: elapsed >= flip.duration,
  };
}

/** What a reader sees at `now`: each column's character, the falling flap counted once it is past halfway. */
export function textAt(flip: Flip, now: number): string {
  return flipAt(flip, now)
    .columns.map((frame) => (frame.progress >= 0.5 ? frame.next : frame.current))
    .join("");
}

/** A board that is not moving. */
export function stillColumns(text: string): FlapFrame[] {
  return Array.from(text).map((character) => ({ current: character, next: character, progress: 0 }));
}
