/**
 * Give a couple of unpriced stores an old, synthetic price history, so the
 * "stale" state has something to render against.
 *
 *   npm run seed:stale            (with the emulator already running)
 *
 * `npm run seed` makes a few stores stale on purpose. A feed import gives
 * every store it covers a fresh price, and when it covers those stores too,
 * the stale state disappears from the local data and the suites that check it
 * have nothing to test. This puts it back without touching a real price: it
 * only picks stores that have no price at all, from anyone, and leaves at
 * least two of those unpriced so the "no prices yet" state survives as well.
 *
 * Like the seed, the prices are invented and the script will not run against
 * anything but the emulator.
 */

import { Timestamp } from "firebase-admin/firestore";

import { getAdminDb } from "../src/lib/firebase/admin";
import { recomputeStoreRollup } from "../src/lib/stores.server";
import { PRICE_SOURCES } from "../src/types";

/** Coppell, TX: where the browser suites stand. */
const CENTER = { lat: 32.9546, lng: -96.99 };
const COUNT = Number(process.env.SEED_STALE_COUNT ?? 2);
const KEEP_UNPRICED = 2;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Deterministic PRNG, as in the seed, so reruns write the same history. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const random = mulberry32(0x57a1e);
const randomInt = (min: number, max: number): number => Math.floor(random() * (max - min + 1)) + min;

function milesBetween(a: { lat: number; lng: number }, b: { lat: number; lng: number }): number {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(h));
}

/** The same two checks as the seed: an emulator host and a demo- project. */
function assertEmulator(): void {
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  const projectId = process.env.FIREBASE_PROJECT_ID ?? "";
  if (host === undefined || host === "" || !projectId.startsWith("demo-")) {
    console.error(
      "\nRefusing to run: this does not look like the emulator.\n" +
        "These prices are invented. Start the emulator and use .env.local.\n",
    );
    process.exit(1);
  }
}

async function main(): Promise<void> {
  assertEmulator();
  if (!Number.isInteger(COUNT) || COUNT <= 0) {
    console.error("SEED_STALE_COUNT must be a positive whole number.");
    process.exit(1);
  }

  const db = getAdminDb();
  const snapshot = await db.collection("stores").get();
  const unpriced = snapshot.docs
    .map((doc) => ({ id: doc.id, data: doc.data() }))
    .filter(({ data }) => data.priceCents == null && (data.reportCount ?? 0) === 0 && data.priceFeed == null)
    .filter(({ data }) => typeof data.lat === "number" && typeof data.lng === "number")
    .map(({ id, data }) => ({ id, address: data.address as string | null, miles: milesBetween(CENTER, data as { lat: number; lng: number }) }))
    .sort((a, b) => a.miles - b.miles);

  const available = Math.max(0, unpriced.length - KEEP_UNPRICED);
  const chosen = unpriced.slice(0, Math.min(COUNT, available));
  if (chosen.length === 0) {
    console.error(`Only ${unpriced.length} unpriced stores on file; keeping them unpriced. Nothing written.`);
    process.exit(1);
  }

  const sources = PRICE_SOURCES.filter((source) => source !== "delivery");
  for (const store of chosen) {
    const basePrice = randomInt(289, 429);
    const count = randomInt(4, 8);
    // Entirely outside the 90-day freshness window.
    const newestDaysAgo = randomInt(95, 150);
    const oldestDaysAgo = newestDaysAgo + randomInt(60, 220);

    const batch = db.batch();
    for (let index = 0; index < count; index += 1) {
      const progress = count === 1 ? 1 : index / (count - 1);
      const daysAgo = Math.round(oldestDaysAgo - progress * (oldestDaysAgo - newestDaysAgo));
      const drift = Math.round((1 - progress) * -randomInt(8, 34));
      batch.set(db.collection("submissions").doc(), {
        storeId: store.id,
        priceCents: Math.max(100, basePrice + drift + randomInt(-12, 12)),
        submittedAt: Timestamp.fromDate(new Date(Date.now() - daysAgo * DAY_MS)),
        source: sources[Math.floor(random() * sources.length)],
        status: "accepted",
        flagCount: 0,
      });
    }
    await batch.commit();
    const rollup = await recomputeStoreRollup(store.id, db);
    console.log(
      `  ${store.id.padEnd(20)} ${store.address ?? "(no address)"}, ${store.miles.toFixed(1)} mi: ` +
        `${count} reports, newest ${newestDaysAgo} days ago, $${((rollup?.priceCents ?? 0) / 100).toFixed(2)}`,
    );
  }
  console.log(`\n${chosen.length} stores made stale; ${unpriced.length - chosen.length} left unpriced.`);
}

main().catch((error: unknown) => {
  console.error("\nseed:stale failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
