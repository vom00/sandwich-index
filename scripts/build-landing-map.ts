/**
 * Builds `src/data/landing/price-map.json`: every store projected with Albers
 * USA onto a 1000x620 canvas, binned into square cells, one point per cell
 * with the median McChicken price of the stores in it. Deterministic.
 *
 * Run: npm run build:landing-map. d3-geo is used here only, never under src/.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { geoAlbersUsa } from "d3-geo";

const ROOT = new URL("..", import.meta.url);
const read = (p: string) => JSON.parse(readFileSync(new URL(p, ROOT), "utf8"));

const WIDTH = 1000;
const HEIGHT = 620;
const MARGIN = 12;
const CELL = 5;

type Row = [string, number, number, ...unknown[]];

function median(sorted: number[]): number {
  const n = sorted.length;
  const mid = n >> 1;
  return n % 2 ? sorted[mid]! : Math.round((sorted[mid - 1]! + sorted[mid]!) / 2);
}

function quantile(sorted: number[], q: number): number {
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!;
}

const rows: Row[] = [...read("src/data/us-stores.json"), ...read("src/data/us-stores-dti.json")];
const feed = read("src/data/feeds/drivethruindex.json");

const priceByStore = new Map<string, number[]>();
let newest = "";
let oldest = "";
for (const r of feed.rows as { storeId: string; mcchickenCents: number; observedAt: string }[]) {
  if (!r.storeId || !(r.mcchickenCents > 100 && r.mcchickenCents <= 600)) continue;
  const list = priceByStore.get(r.storeId) ?? [];
  list.push(r.mcchickenCents);
  priceByStore.set(r.storeId, list);
  if (!newest || r.observedAt > newest) newest = r.observedAt;
  if (!oldest || r.observedAt < oldest) oldest = r.observedAt;
}

const projection = geoAlbersUsa();
const all = rows.map((r) => [r[2], r[1]] as [number, number]);
projection.fitExtent(
  [
    [MARGIN, MARGIN],
    [WIDTH - MARGIN, HEIGHT - MARGIN],
  ],
  { type: "MultiPoint", coordinates: all },
);

const cells = new Map<number, { x: number; y: number; count: number; prices: number[] }>();
let skipped = 0;
let projected = 0;
let pricedStores = 0;
const storePrices: number[] = [];
const seen = new Set<string>();

for (const r of rows) {
  const id = `atp-${r[0]}`;
  if (seen.has(id)) continue;
  seen.add(id);
  const p = projection([r[2], r[1]]);
  if (!p) {
    skipped++;
    continue;
  }
  const cx = Math.min(Math.floor(p[0] / CELL), Math.floor(WIDTH / CELL) - 1);
  const cy = Math.min(Math.floor(p[1] / CELL), Math.floor(HEIGHT / CELL) - 1);
  if (p[0] < 0 || p[1] < 0 || p[0] > WIDTH || p[1] > HEIGHT) {
    skipped++;
    continue;
  }
  projected++;
  const key = cy * 10000 + cx;
  let cell = cells.get(key);
  if (!cell) {
    cell = { x: Math.round(cx * CELL + CELL / 2), y: Math.round(cy * CELL + CELL / 2), count: 0, prices: [] };
    cells.set(key, cell);
  }
  cell.count++;
  const prices = priceByStore.get(id);
  if (prices) {
    const m = median([...prices].sort((a, b) => a - b));
    cell.prices.push(m);
    storePrices.push(m);
    pricedStores++;
  }
}

const points = [...cells.values()]
  .map((c) => [c.x, c.y, c.prices.length ? median(c.prices.sort((a, b) => a - b)) : 0, c.count])
  .sort((a, b) => a[1]! - b[1]! || a[0]! - b[0]!);

storePrices.sort((a, b) => a - b);
const out = {
  width: WIDTH,
  height: HEIGHT,
  generatedFrom: { stores: projected, priced: pricedStores, newestObservedAt: newest, oldestObservedAt: oldest },
  priceCents: {
    min: storePrices[0],
    p10: quantile(storePrices, 0.1),
    median: median(storePrices),
    p90: quantile(storePrices, 0.9),
    max: storePrices[storePrices.length - 1],
  },
  points,
};

mkdirSync(new URL("src/data/landing/", ROOT), { recursive: true });
const json = JSON.stringify(out).replace(/\],\[/g, "],\n[");
writeFileSync(new URL("src/data/landing/price-map.json", ROOT), json + "\n");

console.log(`stores read: ${seen.size}, projected: ${projected}, skipped (null projection): ${skipped}`);
console.log(`cell size: ${CELL}, points: ${points.length}`);
console.log(`price scale: ${JSON.stringify(out.priceCents)}`);
console.log(`size: ${json.length} bytes raw, ${gzipSync(json).length} bytes gzipped`);
