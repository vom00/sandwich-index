/**
 * Keep the local data in the shape the browser suites test against.
 *
 *   npm run seed:fixtures      (emulator running; also runs before test:browser)
 *
 * The suites check how the site renders a stale store, an unpriced one, and a
 * store with a long, fresh visitor history. The saved emulator data drifts
 * away from all three:
 *
 *   - A feed import gives every store it covers a fresh price, which erases the
 *     seed's stale stores (MenuPriceTracker covered all of them).
 *   - The data ages. A visitor history seeded "a week ago" is three months old
 *     a quarter later and turns stale itself, and the "fresh history" checks
 *     have nothing left to check.
 *
 * So, idempotently:
 *
 *   1. Stale: if fewer than two stores within 14 miles of Coppell have a price
 *      older than 90 days, give an old invented history to the farthest
 *      unpriced stores still on the map's 15-mile view, never leaving fewer
 *      than two unpriced there. It never touches a store that has a price.
 *   2. Fresh: every store within 40 miles whose price came from visitors (no
 *      feed) and is 30 to 89 days old gets one more report at its current
 *      price, dated in the last three days. The price doesn't change; it just
 *      never crosses the 90-day line while the suites keep running. Stores
 *      already past 90 days are the stale fixtures and are left alone.
 *
 * Like the seed, every price it writes is invented, and it refuses anything
 * but the emulator.
 */

import { Timestamp } from "firebase-admin/firestore";

import { getAdminDb } from "../src/lib/firebase/admin";
import { recomputeStoreRollup } from "../src/lib/stores.server";
import { PRICE_SOURCES, STALE_AFTER_DAYS } from "../src/types";

/** Coppell, TX: where the browser suites stand. */
const CENTER = { lat: 32.9546, lng: -96.99 };
/** Inside the map's 15-mile view, with a margin. */
const IN_VIEW_MILES = 14;
/** How far phase 4 looks for its fixtures. */
const FIXTURE_MILES = 40;
const STALE_WANTED = 2;
const KEEP_UNPRICED = 2;
const REFRESH_AFTER_DAYS = 30;
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

interface Row {
  id: string;
  address: string | null;
  miles: number;
  priceCents: number | null;
  priceFeed: string | null;
  reportCount: number;
  ageDays: number | null;
}

async function main(): Promise<void> {
  assertEmulator();
  const db = getAdminDb();
  const now = Date.now();

  const rows: Row[] = (await db.collection("stores").get()).docs
    .map((doc) => {
      const data = doc.data();
      const pricedAt = data["pricedAt"] instanceof Timestamp ? data["pricedAt"].toMillis() : null;
      return {
        id: doc.id,
        address: typeof data["address"] === "string" ? data["address"] : null,
        miles: milesBetween(CENTER, { lat: Number(data["lat"]), lng: Number(data["lng"]) }),
        priceCents: typeof data["priceCents"] === "number" ? data["priceCents"] : null,
        priceFeed: typeof data["priceFeed"] === "string" ? data["priceFeed"] : null,
        reportCount: Number(data["reportCount"] ?? 0),
        ageDays: pricedAt === null ? null : (now - pricedAt) / DAY_MS,
      };
    })
    .filter((row) => Number.isFinite(row.miles));

  const sources = PRICE_SOURCES.filter((source) => source !== "delivery");

  // 1. Stale stores in view.
  const inView = rows.filter((row) => row.miles <= IN_VIEW_MILES);
  const stale = inView.filter((row) => row.ageDays !== null && row.ageDays > STALE_AFTER_DAYS);
  const unpriced = inView
    .filter((row) => row.priceCents === null && row.reportCount === 0 && row.priceFeed === null)
    .sort((a, b) => b.miles - a.miles);
  const toMakeStale = unpriced.slice(0, Math.max(0, Math.min(STALE_WANTED - stale.length, unpriced.length - KEEP_UNPRICED)));

  for (const store of toMakeStale) {
    const basePrice = randomInt(289, 429);
    const count = randomInt(4, 8);
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
        submittedAt: Timestamp.fromDate(new Date(now - daysAgo * DAY_MS)),
        source: sources[Math.floor(random() * sources.length)],
        status: "accepted",
        flagCount: 0,
      });
    }
    await batch.commit();
    await recomputeStoreRollup(store.id, db);
    console.log(`  stale   ${store.id.padEnd(20)} ${store.address ?? "(no address)"}, ${store.miles.toFixed(1)} mi, newest ${newestDaysAgo} days ago`);
  }

  // 2. Visitor histories that would otherwise age out.
  const aging = rows.filter(
    (row) =>
      row.miles <= FIXTURE_MILES &&
      row.priceFeed === null &&
      row.priceCents !== null &&
      row.ageDays !== null &&
      row.ageDays >= REFRESH_AFTER_DAYS &&
      row.ageDays < STALE_AFTER_DAYS,
  );
  for (const store of aging) {
    await db.collection("submissions").add({
      storeId: store.id,
      priceCents: store.priceCents,
      submittedAt: Timestamp.fromDate(new Date(now - randomInt(1, 3) * DAY_MS)),
      source: "in_store",
      status: "accepted",
      flagCount: 0,
    });
    await recomputeStoreRollup(store.id, db);
    console.log(`  fresh   ${store.id.padEnd(20)} ${store.address ?? "(no address)"}: was ${Math.round(store.ageDays!)} days old`);
  }

  const unpricedLeft = unpriced.length - toMakeStale.length;
  console.log(
    `seed:fixtures: ${stale.length + toMakeStale.length} stale in view (${toMakeStale.length} made), ` +
      `${aging.length} visitor histories refreshed, ${unpricedLeft} unpriced in view.`,
  );
  if (unpricedLeft < 1) {
    console.warn("  No unpriced store is left near Coppell, so phase 3's \"no prices yet\" checks will fail. Re-seed.");
  }
}

main().catch((error: unknown) => {
  console.error("\nseed:fixtures failed:", error instanceof Error ? error.message : error);
  process.exit(1);
});
