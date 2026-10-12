/**
 * Import a price feed: match its rows to our stores and record what it saw.
 *
 *   npm run import:observations -- --feed menupricetracker --file research/tracker-samples.json
 *   npm run import:observations -- --feed menupricetracker --file <file> --write
 *
 * A dry run by default. It prints, row by row, which store each line of the
 * feed matched, what we currently show for that store, and what the feed says,
 * so a human can look before anything changes. `--write` records the
 * observations and recomputes the stores they touch.
 *
 * ---------------------------------------------------------------------------
 * AN UNLICENSED FEED NEVER LEAVES THE EMULATOR.
 * ---------------------------------------------------------------------------
 *
 * Every feed is declared in src/lib/feeds.ts with the permission we hold to
 * republish it. If that is null, `--write` only works against the local
 * emulator. Showing a third party's prices to real visitors without permission
 * is a decision this script refuses to make by accident; making it on purpose
 * means writing the licence down first. See research/price-sources.md.
 *
 * The file format is documented in src/lib/feed-match.ts (`parseFeedFile`). It
 * accepts research/tracker-samples.json as it stands.
 */

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  matchFeedRow,
  observationId,
  parseFeedFile,
  type FeedRow,
} from "../src/lib/feed-match";
import { feedById, type FeedDefinition } from "../src/lib/feeds";
import { getAdminDb } from "../src/lib/firebase/admin";
import { formatCents } from "../src/lib/money";
import { recordObservations, type ObservationInput } from "../src/lib/stores.server";
import { relativeAge } from "../src/lib/tiers";

interface Options {
  feed: string;
  file: string;
  write: boolean;
}

function parseArgs(argv: readonly string[]): Options {
  const value = (flag: string): string | undefined => {
    const at = argv.indexOf(flag);
    return at === -1 ? undefined : argv[at + 1];
  };

  const feed = value("--feed");
  const file = value("--file");
  if (feed === undefined || file === undefined) {
    console.error(
      "Usage: npm run import:observations -- --feed <id> --file <path> [--write]",
    );
    process.exit(1);
  }
  return { feed, file, write: argv.includes("--write") };
}

/** Same two checks as the seed: either alone has a failure mode. */
function isEmulator(): boolean {
  const host = process.env.FIRESTORE_EMULATOR_HOST ?? "";
  const projectId = process.env.FIREBASE_PROJECT_ID ?? "";
  return host !== "" && projectId.startsWith("demo-");
}

function refuseUnlicensedWrite(feed: FeedDefinition): void {
  console.error(
    `\nRefusing to write: ${feed.name} has no licence recorded in src/lib/feeds.ts,\n` +
      "and this does not look like the local emulator.\n\n" +
      "Publishing its prices to real visitors needs permission from its owner.\n" +
      "Record what allows it in the feed's `licence` field first.\n",
  );
  process.exit(1);
}

interface StoreRow {
  id: string;
  address: string | null;
  locality: string | null;
  priceCents: number | null;
  pricedAt: string | null;
  priceFeed: string | null;
}

async function loadStores(): Promise<StoreRow[]> {
  const snapshot = await getAdminDb().collection("stores").get();
  return snapshot.docs.map((doc) => {
    const data = doc.data();
    const pricedAt = data["pricedAt"];
    return {
      id: doc.id,
      address: typeof data["address"] === "string" ? data["address"] : null,
      locality: typeof data["locality"] === "string" ? data["locality"] : null,
      priceCents: typeof data["priceCents"] === "number" ? data["priceCents"] : null,
      pricedAt:
        pricedAt !== null && typeof pricedAt?.toDate === "function"
          ? pricedAt.toDate().toISOString()
          : null,
      priceFeed: typeof data["priceFeed"] === "string" ? data["priceFeed"] : null,
    };
  });
}

function describeOurs(store: StoreRow): string {
  if (store.priceCents === null) return "we show no price";
  const who = store.priceFeed === null ? "a visitor" : store.priceFeed;
  return `we show ${formatCents(store.priceCents)} (${who}, ${relativeAge(store.pricedAt)})`;
}

async function main(): Promise<void> {
  const options = parseArgs(process.argv.slice(2));

  const feed = feedById(options.feed);
  if (feed === null) {
    console.error(`Unknown feed "${options.feed}". Declare it in src/lib/feeds.ts first.`);
    process.exit(1);
  }

  // Check before doing any work, so a refused write costs nothing.
  if (options.write && feed.licence === null && !isEmulator()) refuseUnlicensedWrite(feed);

  const raw: unknown = JSON.parse(readFileSync(resolve(options.file), "utf8"));
  const { rows, problems } = parseFeedFile(raw);

  console.log(`\n${feed.name} — ${rows.length} usable rows from ${options.file}`);
  console.log(
    feed.licence === null
      ? "Licence: NONE. Emulator only.\n"
      : `Licence: ${feed.licence}\n`,
  );

  for (const problem of problems) console.log(`REJECT  ${problem}`);

  const stores = await loadStores();
  const byId = new Map(stores.map((store) => [store.id, store]));

  const planned = new Map<string, ObservationInput>();
  const conflicted = new Set<string>();
  const tally = { matched: 0, ambiguous: 0, missed: 0, unpriced: 0, conflicts: 0 };

  const describeRow = (row: FeedRow) => `${row.address}, ${row.city}`;

  for (const row of rows) {
    if (row.priceCents === null) {
      tally.unpriced += 1;
      console.log(`SKIP    ${describeRow(row)} — the feed lists it, with no McChicken price`);
      continue;
    }

    const match = matchFeedRow(row, stores);
    if (match.kind === "ambiguous") {
      tally.ambiguous += 1;
      console.log(`AMBIG   ${describeRow(row)} → ${match.storeIds.join(", ")} — resolve by hand`);
      continue;
    }
    if (match.kind === "miss") {
      tally.missed += 1;
      console.log(`MISS    ${describeRow(row)} — no store with that number and city on file`);
      continue;
    }

    const store = byId.get(match.storeId);
    if (store === undefined) continue;

    // Two rows for one store on one day must agree, or neither is trusted.
    const id = observationId(feed.id, store.id, row.observedAt);
    const earlier = planned.get(id);
    if (earlier !== undefined && earlier.priceCents !== row.priceCents) {
      conflicted.add(id);
    }

    tally.matched += 1;
    planned.set(id, {
      storeId: store.id,
      priceCents: row.priceCents,
      observedAt: row.observedAt,
      feed: feed.id,
      sourceUrl: row.sourceUrl,
    });
    console.log(
      `MATCH   ${describeRow(row)} → ${store.id}: ${feed.name} saw ` +
        `${formatCents(row.priceCents)} ${relativeAge(row.observedAt)}; ${describeOurs(store)}`,
    );
  }

  for (const id of conflicted) {
    tally.conflicts += 1;
    planned.delete(id);
    console.log(`CONFLICT ${id} — two rows disagree about one store on one day; neither imported`);
  }

  console.log(
    `\n${tally.matched} matched, ${tally.ambiguous} ambiguous, ${tally.missed} missed, ` +
      `${tally.unpriced} without a price, ${problems.length} rejected, ${tally.conflicts} conflicting` +
      ` (against ${stores.length} stores on file).`,
  );

  if (!options.write) {
    console.log(`Dry run. ${planned.size} observations would be recorded; add --write to record them.\n`);
    return;
  }

  const result = await recordObservations([...planned.values()]);
  console.log(
    `Recorded ${result.written} new observations (${result.alreadyRecorded} already on file); ` +
      `recomputed ${result.recomputed} stores.\n`,
  );
}

main().catch((error: unknown) => {
  console.error("Import failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
