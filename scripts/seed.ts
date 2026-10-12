/**
 * Seed the local emulator with real store locations and synthetic price history.
 *
 * ---------------------------------------------------------------------------
 * THIS SCRIPT WILL NOT RUN AGAINST A REAL DATABASE, BY DESIGN.
 * ---------------------------------------------------------------------------
 *
 * The prices it generates are invented. Publishing invented prices as
 * crowdsourced data would destroy exactly the trust that every abuse-control
 * mechanism in this codebase exists to build — a visitor cannot tell a
 * fabricated median from a real one, so shipping one makes every real number
 * suspect too. The guard below is not a convenience check; removing it defeats
 * the point of the project.
 *
 * Store *locations* are real, pulled live from OpenStreetMap. Only the prices
 * are fiction.
 *
 * Run: npm run seed   (with the emulator already running)
 */

import { Timestamp } from "firebase-admin/firestore";

import { getAdminDb } from "../src/lib/firebase/admin";
import { OverpassError, fetchNearbyStores } from "../src/lib/overpass";
import { milesToMeters } from "../src/lib/geohash";
import { recomputeStoreRollup, upsertStores } from "../src/lib/stores.server";
import { PRICE_SOURCES, type PriceSource, type SubmissionStatus } from "../src/types";

/**
 * Coppell, TX by default — the metro the spec calls out — but overridable,
 * because the app is a national index and "what does the empty state look
 * like in a city with no reports yet" is a question worth being able to ask
 * anywhere:
 *
 *   SEED_LAT=34.0522 SEED_LNG=-118.2437 npm run seed
 *
 * Only the coordinates move. The prices stay synthetic and the emulator guard
 * below stays absolute.
 */
const SEED_CENTER = {
  lat: Number(process.env.SEED_LAT ?? 32.9546),
  lng: Number(process.env.SEED_LNG ?? -96.99),
};
const SEED_RADIUS_MILES = Number(process.env.SEED_RADIUS_MILES ?? 15);
const MAX_STORES = Number(process.env.SEED_MAX_STORES ?? 15);

const DAY_MS = 24 * 60 * 60 * 1000;

/** Deterministic PRNG so repeated seeds produce an identical database. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const random = mulberry32(0x5a4d);

function randomInt(min: number, max: number): number {
  return Math.floor(random() * (max - min + 1)) + min;
}

function pick<T>(items: readonly T[]): T {
  const value = items[Math.floor(random() * items.length)];
  if (value === undefined) throw new Error("pick() from an empty list");
  return value;
}

/**
 * Reject a nonsense seed area before it reaches Overpass.
 *
 * A mistyped `SEED_LAT` becomes `NaN`, which Overpass answers with a parse
 * error several seconds and one opaque stack trace later — and, being a
 * donated shared resource, it should not be the thing that validates our
 * input.
 */
function assertSeedArea(): void {
  const problems: string[] = [];

  for (const [name, value] of [
    ["SEED_LAT", SEED_CENTER.lat],
    ["SEED_LNG", SEED_CENTER.lng],
    ["SEED_RADIUS_MILES", SEED_RADIUS_MILES],
    ["SEED_MAX_STORES", MAX_STORES],
  ] as const) {
    if (!Number.isFinite(value)) problems.push(`${name} is not a number`);
  }
  if (Math.abs(SEED_CENTER.lat) > 90) problems.push("SEED_LAT is outside -90..90");
  if (Math.abs(SEED_CENTER.lng) > 180) problems.push("SEED_LNG is outside -180..180");
  if (SEED_RADIUS_MILES <= 0) problems.push("SEED_RADIUS_MILES must be positive");
  if (MAX_STORES <= 0) problems.push("SEED_MAX_STORES must be positive");

  if (problems.length > 0) {
    console.error("\nRefusing to seed: the area to seed does not make sense.");
    for (const problem of problems) console.error(`  - ${problem}`);
    console.error("");
    process.exit(1);
  }
}

/**
 * Refuse to touch anything that is not the emulator.
 *
 * Two independent checks, because either one alone has a failure mode: the
 * host variable could point at a real instance, and a demo project id could be
 * paired with a live connection.
 */
function assertEmulator(): void {
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  const projectId = process.env.FIREBASE_PROJECT_ID ?? "";

  const problems: string[] = [];
  if (host === undefined || host === "") {
    problems.push("FIRESTORE_EMULATOR_HOST is not set");
  }
  if (!projectId.startsWith("demo-")) {
    problems.push(`FIREBASE_PROJECT_ID is "${projectId}", which is not a demo- project`);
  }

  if (problems.length > 0) {
    console.error("\nRefusing to seed: this does not look like the emulator.");
    for (const problem of problems) console.error(`  - ${problem}`);
    console.error(
      "\nSeed data is synthetic. Writing it to a real database would present\n" +
        "fabricated prices as crowdsourced data. Start the emulator and use\n" +
        ".env.local instead.\n",
    );
    process.exit(1);
  }
}

interface PlannedSubmission {
  storeId: string;
  priceCents: number;
  submittedAt: Date;
  source: PriceSource;
  status: SubmissionStatus;
  flagCount: number;
}

/**
 * Build a plausible price history for one store.
 *
 * Shaped to exercise every UI state rather than to look tidy: some stores are
 * well covered, some have a single report, some are stale, some have delivery
 * prices that must stay out of the median, and a few carry a pending outlier.
 */
function planSubmissions(
  storeId: string,
  profile: "rich" | "sparse" | "stale" | "unmeasured",
): PlannedSubmission[] {
  if (profile === "unmeasured") return [];

  // Franchise prices for this sandwich realistically sit in this band.
  const basePrice = randomInt(289, 429);

  const count =
    profile === "rich" ? randomInt(9, 22) : profile === "sparse" ? randomInt(1, 3) : randomInt(4, 8);

  // Stale stores get pushed entirely outside the 90-day freshness window.
  const newestDaysAgo = profile === "stale" ? randomInt(95, 150) : randomInt(0, 20);
  const oldestDaysAgo = newestDaysAgo + randomInt(60, 220);

  const submissions: PlannedSubmission[] = [];

  for (let index = 0; index < count; index += 1) {
    const progress = count === 1 ? 1 : index / (count - 1);
    const daysAgo = Math.round(oldestDaysAgo - progress * (oldestDaysAgo - newestDaysAgo));

    // Menu prices drift upward. Older submissions sit below the current price.
    const drift = Math.round((1 - progress) * -randomInt(8, 34));
    const noise = randomInt(-12, 12);

    const isDelivery = random() < 0.16;
    const source: PriceSource = isDelivery
      ? "delivery"
      : pick(PRICE_SOURCES.filter((s) => s !== "delivery"));

    // Delivery platforms mark up substantially — this is exactly why those
    // submissions are recorded but excluded from the median.
    const deliveryMarkup = isDelivery ? Math.round(basePrice * (0.28 + random() * 0.2)) : 0;

    const priceCents = Math.max(
      100,
      Math.min(1500, basePrice + drift + noise + deliveryMarkup),
    );

    submissions.push({
      storeId,
      priceCents,
      submittedAt: new Date(Date.now() - daysAgo * DAY_MS),
      source,
      status: "accepted",
      flagCount: 0,
    });
  }

  // Give well-covered stores an occasional held outlier, so the pending state
  // has something to render against.
  if (profile === "rich" && random() < 0.4) {
    submissions.push({
      storeId,
      priceCents: Math.min(1500, Math.round(basePrice * 2.2)),
      submittedAt: new Date(Date.now() - randomInt(1, 30) * DAY_MS),
      source: "in_store",
      status: "pending",
      flagCount: 0,
    });
  }

  return submissions;
}

function assignProfile(index: number, total: number): "rich" | "sparse" | "stale" | "unmeasured" {
  if (index >= total - 2) return "unmeasured";
  if (index >= total - 4) return "stale";
  if (index % 4 === 3) return "sparse";
  return "rich";
}

async function main(): Promise<void> {
  assertEmulator();
  assertSeedArea();

  const db = getAdminDb();

  console.log(
    `Fetching real store locations from OpenStreetMap within ` +
      `${SEED_RADIUS_MILES} miles of ${SEED_CENTER.lat}, ${SEED_CENTER.lng}...`,
  );
  const found = await fetchNearbyStores(
    SEED_CENTER.lat,
    SEED_CENTER.lng,
    milesToMeters(SEED_RADIUS_MILES),
  );

  const stores = found.slice(0, MAX_STORES);
  if (stores.length === 0) {
    console.error("Overpass returned no stores. Nothing to seed.");
    process.exit(1);
  }

  const withAddress = stores.filter((store) => store.address !== null).length;
  console.log(
    `  ${stores.length} locations (${withAddress} with a usable address, ` +
      `${stores.length - withAddress} without — this is normal for OSM)`,
  );

  const { created, updated } = await upsertStores(stores, db);
  console.log(`  upserted: ${created} created, ${updated} updated`);

  console.log(`\nGenerating synthetic price history...`);
  const planned = stores.flatMap((store, index) =>
    planSubmissions(store.osmId, assignProfile(index, stores.length)),
  );

  let batch = db.batch();
  let pendingWrites = 0;

  for (const submission of planned) {
    batch.set(db.collection("submissions").doc(), {
      storeId: submission.storeId,
      priceCents: submission.priceCents,
      submittedAt: Timestamp.fromDate(submission.submittedAt),
      source: submission.source,
      status: submission.status,
      flagCount: submission.flagCount,
    });

    pendingWrites += 1;
    if (pendingWrites >= 450) {
      await batch.commit();
      batch = db.batch();
      pendingWrites = 0;
    }
  }
  if (pendingWrites > 0) await batch.commit();

  console.log(`  ${planned.length} submissions written`);

  console.log(`\nRecomputing rollups...`);
  for (const store of stores) {
    const rollup = await recomputeStoreRollup(store.osmId, db);
    const median = rollup?.priceCents;
    const label =
      median === null || median === undefined
        ? "no price yet"
        : `$${(median / 100).toFixed(2)} from ${rollup?.confirmedCount} of ${rollup?.reportCount}`;
    console.log(`  ${store.osmId.padEnd(20)} ${label}`);
  }

  console.log(`\nSeed complete.\n`);
}

main().catch((error: unknown) => {
  console.error("\nSeed failed:", error instanceof Error ? error.message : error);

  // `OverpassError` collects why each mirror was rejected. Printing only the
  // summary turned "the DNS for two mirrors does not resolve" into the far more
  // alarming and much less true "every Overpass mirror failed", and cost a
  // detour into rate limits that were never the problem.
  if (error instanceof OverpassError) {
    for (const attempt of error.attempts) console.error(`  · ${attempt}`);
  }

  process.exit(1);
});
