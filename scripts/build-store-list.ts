/**
 * Build the US store list the server syncs areas from.
 *
 *   npm run build:store-list -- --file feeds/alltheplaces/mcdonalds-2026-09-26.geojson
 *
 * Reads All The Places' McDonald's spider output (CC0; see
 * `scripts/import-store-numbers.ts` for where to get it and why it is read
 * line by line) and writes `src/data/us-stores.json`: one
 * `[ref, lat, lng, street, city, state, postcode]` row per US restaurant,
 * coordinates to five decimals (about a metre). `lib/store-list` turns a row
 * into a store; the sync route reads the list instead of asking Overpass
 * whenever an area is inside it (`stores.server` `syncAreaIfStale`).
 *
 * Rerun it with a newer All The Places file to pick up openings and closures.
 * A store that drops out of the list is not deleted from Firestore: it may
 * own price history, and removing one is a human decision.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

import type { ListedRow } from "../src/lib/store-list";

const OUT = resolve("src/data/us-stores.json");

const at = process.argv.indexOf("--file");
const file = at === -1 ? undefined : process.argv[at + 1];
if (file === undefined) {
  console.error("Usage: npm run build:store-list -- --file <mcdonalds.geojson>");
  process.exit(1);
}

const rows: ListedRow[] = [];
const seen = new Set<string>();
for (const raw of readFileSync(resolve(file), "utf8").split("\n")) {
  const line = raw.trim().replace(/,$/, "");
  if (!line.startsWith('{"type": "Feature"')) continue;
  const feature = JSON.parse(line) as {
    properties: Record<string, string | undefined>;
    geometry: { coordinates: [number, number] } | null;
  };
  const p = feature.properties;
  if (p["addr:country"] !== "US" || p["brand"] !== "McDonald's") continue;
  const ref = p["ref"]?.trim() ?? "";
  if (!/^\d{1,6}$/.test(ref) || feature.geometry === null || seen.has(ref)) continue;
  seen.add(ref);
  const [lng, lat] = feature.geometry.coordinates;
  const text = (key: string) => p[key]?.trim() || null;
  rows.push([
    ref,
    Number(lat.toFixed(5)),
    Number(lng.toFixed(5)),
    text("addr:street_address"),
    text("addr:city"),
    text("addr:state"),
    text("addr:postcode"),
  ]);
}

rows.sort((a, b) => a[1] - b[1] || a[2] - b[2]);
writeFileSync(OUT, `[${rows.map((row) => JSON.stringify(row)).join(",\n")}]\n`);
console.log(`Wrote ${rows.length} stores to ${OUT}`);
