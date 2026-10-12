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
 * simply not having a write path. That import now exists as its own script,
 * scripts/import-observations.ts, with provenance on every row and a licence
 * check that keeps an unlicensed feed inside the emulator. Its dry run is a
 * superset of this report; this stays as the zero-risk read-only version.
 *
 * Matching is (city, street number), and lives in src/lib/feed-match.ts, which
 * says why and is unit-tested. This script and the import share it, so they
 * cannot disagree about which store a row belongs to.
 *
 * Run: npx tsx --conditions=react-server --env-file=.env.local scripts/match-tracker-stores.ts
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { matchFeedRow } from "../src/lib/feed-match";
import { getAdminDb } from "../src/lib/firebase/admin";

interface TrackerRow {
  address: string;
  city: string;
  zip: string;
  mcchickenCents: number | null;
  url: string;
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
  const stores = snapshot.docs.map((doc) => {
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
    const match = matchFeedRow(row, stores);
    const candidates =
      match.kind === "match"
        ? stores.filter((store) => store.id === match.storeId)
        : match.kind === "ambiguous"
          ? stores.filter((store) => match.storeIds.includes(store.id))
          : [];

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
