/**
 * Builds `src/data/landing/price-strip.json`: the national spread of McChicken
 * prices as a dot strip, every dot's position worked out here so the store
 * page only draws them.
 *
 * Same stores and prices as the landing map (`build-landing-map.ts`): each
 * store's median price in the DriveThruIndex feed. Prices go in 10-cent
 * columns, one dot per DOT_STORES stores, stacked up from the axis. The
 * page rings where one store's price falls, and says what share of stores are
 * cheaper and pricier, from the exact count at every cent (`atCent`).
 *
 * Run: npm run build:price-strip. Deterministic.
 */

import { readFileSync, writeFileSync } from "node:fs";

const ROOT = new URL("..", import.meta.url);
const read = (p: string) => JSON.parse(readFileSync(new URL(p, ROOT), "utf8"));

const WIDTH = 640;
const HEIGHT = 180;
const LEFT = 16;
const RIGHT = 16;
const AXIS_Y = 164;
const BUCKET = 10;
const PITCH = 11;
const MAX_DOTS = 13;
/** Prices above this share the last column, so a handful of airports don't stretch the axis. */
const CAP = 400;

function median(sorted: number[]): number {
  const n = sorted.length;
  const mid = n >> 1;
  return n % 2 ? sorted[mid]! : Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
}

const rows: [string, ...unknown[]][] = [...read("src/data/us-stores.json"), ...read("src/data/us-stores-dti.json")];
const known = new Set(rows.map((r) => `atp-${r[0]}`));
const feed = read("src/data/feeds/drivethruindex.json") as {
  rows: { storeId: string; mcchickenCents: number; observedAt: string }[];
};

const byStore = new Map<string, number[]>();
let newest = "";
let oldest = "";
for (const r of feed.rows) {
  if (!r.storeId || !known.has(r.storeId) || !(r.mcchickenCents > 100 && r.mcchickenCents <= 600)) continue;
  const list = byStore.get(r.storeId) ?? [];
  list.push(r.mcchickenCents);
  byStore.set(r.storeId, list);
  if (!newest || r.observedAt > newest) newest = r.observedAt;
  if (!oldest || r.observedAt < oldest) oldest = r.observedAt;
}

const prices = [...byStore.values()].map((list) => median([...list].sort((a, b) => a - b))).sort((a, b) => a - b);
const min = Math.floor(prices[0]! / BUCKET) * BUCKET;
const max = prices[prices.length - 1]!;
const top = CAP;

// Exact counts at every cent, for "cheaper than n%".
const atCent = new Array<number>(max - min + 1).fill(0);
for (const p of prices) atCent[p - min]! += 1;

const columns: { cents: number; stores: number }[] = [];
for (let c = min; c <= top; c += BUCKET) {
  const stores = prices.filter((p) => (c >= top ? p >= c : p >= c && p < c + BUCKET)).length;
  columns.push({ cents: c, stores });
}
const busiest = Math.max(...columns.map((c) => c.stores));
const DOT_STORES = Math.ceil(busiest / MAX_DOTS / 10) * 10;

const span = WIDTH - LEFT - RIGHT;
// The axis runs to the end of the last column, which holds everything from CAP up.
const axisMax = top + BUCKET;
const xOf = (cents: number) => Math.round((LEFT + ((Math.min(cents, axisMax) - min) / (axisMax - min)) * span) * 10) / 10;
// [x, y, scale]: full dots, then one smaller dot for what is left over, its
// area in proportion, so a column of 20 stores doesn't look like 160.
const dots: [number, number, number][] = [];
const placed = columns.map((column) => {
  const x = xOf(column.cents + BUCKET / 2);
  const exact = column.stores / DOT_STORES;
  const full = Math.floor(exact);
  const left = exact - full;
  for (let i = 0; i < full; i += 1) dots.push([x, AXIS_Y - 8 - i * PITCH, 1]);
  if (column.stores > 0 && (left >= 0.05 || full === 0)) {
    dots.push([x, AXIS_Y - 8 - full * PITCH, Math.round(Math.max(0.3, Math.sqrt(left)) * 100) / 100]);
  }
  return { cents: column.cents, x, stores: column.stores, dots: full + (left > 0 ? 1 : 0) };
});

const out = {
  width: WIDTH,
  height: HEIGHT,
  axisY: AXIS_Y,
  left: LEFT,
  right: WIDTH - RIGHT,
  minCents: min,
  capCents: top,
  axisMaxCents: axisMax,
  bucketCents: BUCKET,
  dotStores: DOT_STORES,
  source: { feed: "drivethruindex", stores: prices.length, oldestObservedAt: oldest, newestObservedAt: newest },
  medianCents: median(prices),
  columns: placed,
  dots,
  atCent,
};

writeFileSync(new URL("src/data/landing/price-strip.json", ROOT), `${JSON.stringify(out)}\n`);
console.log(
  `price-strip: ${prices.length} stores, ${columns.length} columns, ${dots.length} dots of ${DOT_STORES} stores, ` +
    `${(JSON.stringify(out).length / 1024).toFixed(1)} KB`,
);
