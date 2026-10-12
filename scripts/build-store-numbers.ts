/**
 * Build the restaurant-number table the server matches stores against.
 *
 *   npm run build:store-numbers -- --file feeds/alltheplaces/mcdonalds-2026-09-26.geojson
 *
 * Reads All The Places' McDonald's spider output (CC0; see
 * `scripts/import-store-numbers.ts` for where to get it and why it is read
 * line by line) and writes `src/data/restaurant-numbers.json`: one
 * `[number, lat, lng, streetNumber]` row per US restaurant, coordinates to
 * five decimals (about a metre). The server reads it when it syncs an area
 * (`lib/store-numbers`), so stores get their number wherever they are first
 * seen, with no import to run against production.
 */

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const OUT = resolve("src/data/restaurant-numbers.json");

const at = process.argv.indexOf("--file");
const file = at === -1 ? undefined : process.argv[at + 1];
if (file === undefined) {
  console.error("Usage: npm run build:store-numbers -- --file <mcdonalds.geojson>");
  process.exit(1);
}

const rows: [string, number, number, string | null][] = [];
for (const raw of readFileSync(resolve(file), "utf8").split("\n")) {
  const line = raw.trim().replace(/,$/, "");
  if (!line.startsWith('{"type": "Feature"')) continue;
  const feature = JSON.parse(line) as {
    properties: Record<string, string | undefined>;
    geometry: { coordinates: [number, number] } | null;
  };
  const p = feature.properties;
  if (p["addr:country"] !== "US" || p["brand"] !== "McDonald's") continue;
  if (!/^\d{3,5}$/.test(p["ref"] ?? "") || feature.geometry === null) continue;
  const [lng, lat] = feature.geometry.coordinates;
  const street = p["addr:street_address"]?.trim().match(/^(\d{1,6})\b/)?.[1] ?? null;
  rows.push([p["ref"]!, Number(lat.toFixed(5)), Number(lng.toFixed(5)), street]);
}

rows.sort((a, b) => a[1] - b[1] || a[2] - b[2]);
writeFileSync(OUT, `${JSON.stringify(rows)}\n`);
console.log(`${rows.length} restaurants written to ${OUT}`);
