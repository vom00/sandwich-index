/**
 * Report-only cross-reference between third-party tracker rows and our
 * OSM-synced stores.
 *
 * ---------------------------------------------------------------------------
 * THIS SCRIPT WRITES NOTHING, BY DESIGN.
 * ---------------------------------------------------------------------------
 *
 * The rows in research/tracker-samples.json come from a site whose data we do
 * not have permission to republish (see research/price-sources.md). Matching
 * them against our stores is verification — importing them would be
 * republication, which is a licensing decision the code refuses to make by
 * simply not having a write path. If permission arrives, the import belongs in
 * its own script with a provenance field, not a flag on this one.
 *
 * Matching strategy, learned from the Lewisville sample: street NAMES alias
 * freely between sources ("Round Grove Road" is "FM 3040", "S Business 121"
 * is "S Hwy 121") and even ZIPs disagree between them, but the street NUMBER
 * + city pair held for **15 of 15** sampled stores with nothing ambiguous.
 * So the join key is (city, street number).
 *
 * It works because two McDonald's in one city almost never share a street
 * number — the number is nearly a key by itself and the city merely scopes
 * it. "Almost never" is why a row matching more than one store is reported
 * as AMBIG for a human instead of being resolved by guessing; at full DFW
 * scale that branch is the one to watch.
 *
 * Run: npx tsx --conditions=react-server --env-file=.env.local scripts/match-tracker-stores.ts
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { getAdminDb } from "../src/lib/firebase/admin";

interface TrackerRow {
  address: string;
  city: string;
  zip: string;
  mcchickenCents: number | null;
  url: string;
}

interface OurStore {
  id: string;
  address: string | null;
  locality: string | null;
  priceCents: number | null;
}

/** "8435 N Beltline Road" → "8435". Null when there is no leading number. */
function streetNumber(address: string): string | null {
  const match = /^(\d+)\b/.exec(address.trim());
  return match?.[1] ?? null;
}

/** The city segment of "813 South MacArthur Boulevard, Coppell, TX 75019". */
function cityOf(store: OurStore): string | null {
  const source = store.address ?? store.locality;
  if (source === null) return null;
  const parts = source.split(",").map((part) => part.trim());
  // "street, city, ST zip" — city is the second-to-last segment.
  return parts.length >= 2 ? (parts[parts.length - 2] ?? null) : null;
}

function normalise(value: string): string {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
}

async function main(): Promise<void> {
  if (process.env.FIRESTORE_EMULATOR_HOST === undefined) {
    console.error("Set FIRESTORE_EMULATOR_HOST — this reads the dev emulator.");
    process.exit(1);
  }

  const samplePath = resolve(__dirname, "../research/tracker-samples.json");
  const { rows } = JSON.parse(readFileSync(samplePath, "utf8")) as { rows: TrackerRow[] };

  const db = getAdminDb();
  const snapshot = await db.collection("stores").get();
  const stores: OurStore[] = snapshot.docs.map((doc) => {
    const data = doc.data();
    return {
      id: doc.id,
      address: (data["address"] as string | null) ?? null,
      locality: (data["locality"] as string | null) ?? null,
      priceCents: (data["priceCents"] as number | null) ?? null,
    };
  });

  let matched = 0;
  let ambiguous = 0;
  let missed = 0;

  for (const row of rows) {
    const number = streetNumber(row.address);
    const city = normalise(row.city);

    const candidates = stores.filter((store) => {
      const storeCity = cityOf(store);
      const storeNumber = store.address === null ? null : streetNumber(store.address);
      return (
        storeNumber !== null &&
        storeNumber === number &&
        storeCity !== null &&
        normalise(storeCity) === city
      );
    });

    const price =
      row.mcchickenCents === null ? "  (no per-store price sampled)" : ` — their McChicken $${(row.mcchickenCents / 100).toFixed(2)}`;

    if (candidates.length === 1 && candidates[0] !== undefined) {
      matched += 1;
      const ours =
        candidates[0].priceCents === null
          ? "ours: none"
          : `ours: $${(candidates[0].priceCents / 100).toFixed(2)}`;
      console.log(`MATCH  ${row.address}, ${row.city} → ${candidates[0].id} (${ours})${price}`);
    } else if (candidates.length > 1) {
      ambiguous += 1;
      console.log(
        `AMBIG  ${row.address}, ${row.city} → ${candidates.map((c) => c.id).join(", ")} — resolve by hand`,
      );
    } else {
      missed += 1;
      console.log(`MISS   ${row.address}, ${row.city} — no store with that number+city on file`);
    }
  }

  console.log(
    `\n${rows.length} tracker rows: ${matched} matched, ${ambiguous} ambiguous, ${missed} missed ` +
      `(against ${stores.length} synced stores)`,
  );
}

main().catch((error: unknown) => {
  console.error("Match failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
