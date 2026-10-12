/**
 * Data layer against the Firestore emulator, through the Admin SDK.
 *
 * Covers the half of the system the rules tests cannot reach: the denormalized
 * rollup, the median exclusions, geohash proximity queries, and the sync gate
 * that keeps us from hammering Overpass.
 *
 * Requires the emulator: npm run emulators
 */

import { Timestamp } from "firebase-admin/firestore";
import ngeohash from "ngeohash";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { getAdminDb } from "@/lib/firebase/admin";
import { distanceMeters, milesToMeters, type LatLng } from "@/lib/geohash";
import type { OverpassStore } from "@/lib/overpass";
import {
  OVERPASS_BUDGET_PER_WINDOW,
  OVERPASS_BUDGET_WINDOW_MS,
  backfillMissingAddresses,
  getIndexSnapshot,
  getObservationsForStore,
  getStore,
  getStoresNear,
  getSubmissionsForStore,
  recomputeStoreRollup,
  recordObservations,
  syncAreaIfStale,
  upsertStores,
} from "@/lib/stores.server";
import { encodeGeohash } from "@/lib/geohash";
import type { PriceSource, SubmissionStatus } from "@/types";

const PROJECT_ID = "demo-sandwich-index";
const DAY_MS = 24 * 60 * 60 * 1000;

const COPPELL = { lat: 32.9546, lng: -96.99 };
/** Roughly 6 miles from Coppell — inside a 15-mile radius. */
const IRVING = { lat: 32.8896, lng: -96.9403 };
/** Austin, ~180 miles away. Must never appear in a DFW query. */
const AUSTIN = { lat: 30.2672, lng: -97.7431 };

const db = getAdminDb();

function store(
  id: string,
  point: { lat: number; lng: number },
  overrides: Partial<OverpassStore> = {},
): OverpassStore {
  return {
    osmId: id,
    name: "McDonald's",
    address: null,
    locality: null,
    lat: point.lat,
    lng: point.lng,
    geohash: encodeGeohash(point),
    ...overrides,
  };
}

async function clearFirestore(): Promise<void> {
  // Read from the environment rather than repeating the port. The Admin SDK is
  // already pointed at whichever emulator this is; wiping a different one
  // because a literal drifted would be a memorable afternoon.
  const host = process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080";

  await fetch(
    `http://${host}/emulator/v1/projects/${PROJECT_ID}/databases/(default)/documents`,
    { method: "DELETE" },
  );
}

async function addSubmission(
  storeId: string,
  priceCents: number,
  options: {
    source?: PriceSource;
    status?: SubmissionStatus;
    daysAgo?: number;
  } = {},
): Promise<void> {
  const { source = "in_store", status = "accepted", daysAgo = 1 } = options;

  await db.collection("submissions").add({
    storeId,
    priceCents,
    submittedAt: Timestamp.fromDate(new Date(Date.now() - daysAgo * DAY_MS)),
    source,
    status,
    flagCount: 0,
  });
}

beforeEach(async () => {
  await clearFirestore();
});

afterAll(async () => {
  await clearFirestore();
});

describe("store upsert", () => {
  it("creates new stores with zeroed rollups", async () => {
    const result = await upsertStores([store("node-1", COPPELL)], db);

    expect(result).toEqual({ created: 1, updated: 0 });

    const saved = await getStore("node-1", db);
    expect(saved?.priceCents).toBeNull();
    expect(saved?.reportCount).toBe(0);
    expect(saved?.confirmedCount).toBe(0);
  });

  it("does not reset price rollups when re-syncing a known store", async () => {
    // The failure this guards against: a routine OSM refresh wiping every
    // median in the database.
    await upsertStores([store("node-1", COPPELL)], db);
    await addSubmission("node-1", 319);
    await addSubmission("node-1", 329);
    await addSubmission("node-1", 309);
    await recomputeStoreRollup("node-1", db);

    const before = await getStore("node-1", db);
    expect(before?.priceCents).toBe(309);

    const result = await upsertStores(
      [{ ...store("node-1", COPPELL), name: "McDonald's (renamed)" }],
      db,
    );
    expect(result).toEqual({ created: 0, updated: 1 });

    const after = await getStore("node-1", db);
    expect(after?.name).toBe("McDonald's (renamed)");
    expect(after?.priceCents).toBe(309);
    expect(after?.reportCount).toBe(3);
  });

  it("preserves a null address rather than inventing one", async () => {
    await upsertStores([store("node-1", COPPELL)], db);
    expect((await getStore("node-1", db))?.address).toBeNull();
  });

  it("does not write a blank OSM address over one already on file", async () => {
    // The weekly OSM refresh runs long after the reverse geocoder has filled in
    // the stores whose tags were empty. If a re-sync wrote its own null back,
    // every backfilled address would vanish on a seven-day cycle.
    await upsertStores(
      [store("node-1", COPPELL, { address: "120 S Denton Tap Rd, Coppell, TX 75019" })],
      db,
    );

    await upsertStores([store("node-1", COPPELL)], db);

    expect((await getStore("node-1", db))?.address).toBe(
      "120 S Denton Tap Rd, Coppell, TX 75019",
    );
  });
});

describe("address backfill", () => {
  it("fills in an address the OSM tags did not have", async () => {
    await upsertStores([store("node-1", COPPELL)], db);

    const result = await backfillMissingAddresses(
      COPPELL,
      milesToMeters(15),
      async () => ({ address: "105 W Airport Fwy, Euless, TX 76039", locality: null }),
      db,
    );

    expect(result).toEqual({ attempted: 1, resolved: 1, remaining: 0 });
    expect((await getStore("node-1", db))?.address).toBe(
      "105 W Airport Fwy, Euless, TX 76039",
    );
  });

  it("records a locality when the geocoder has no street either", async () => {
    await upsertStores([store("node-1", COPPELL)], db);

    await backfillMissingAddresses(
      COPPELL,
      milesToMeters(15),
      async () => ({ address: null, locality: "Elizabeth, NJ 07208" }),
      db,
    );

    const saved = await getStore("node-1", db);
    expect(saved?.address).toBeNull();
    expect(saved?.locality).toBe("Elizabeth, NJ 07208");
  });

  it("leaves stores that already have an address alone", async () => {
    await upsertStores([store("node-1", COPPELL, { address: "1 Main St" })], db);

    const result = await backfillMissingAddresses(
      COPPELL,
      milesToMeters(15),
      async () => {
        throw new Error("must not be asked about a store that has an address");
      },
      db,
    );

    expect(result.attempted).toBe(0);
  });

  it("does not ask twice about a store the geocoder could not place", async () => {
    // A store OSM knows nothing about stays unknown tomorrow. Asking on every
    // sync forever is exactly what gets a donated geocoder to block us.
    await upsertStores([store("node-1", COPPELL)], db);

    const first = await backfillMissingAddresses(
      COPPELL,
      milesToMeters(15),
      async () => null,
      db,
    );
    expect(first.attempted).toBe(1);
    expect(first.resolved).toBe(0);

    const second = await backfillMissingAddresses(
      COPPELL,
      milesToMeters(15),
      async () => {
        throw new Error("must not re-ask within the retry window");
      },
      db,
    );
    expect(second.attempted).toBe(0);
  });

  it("keeps a store in the queue when the geocoder itself fails", async () => {
    // An outage is not evidence about the store, so the attempt is not banked.
    await upsertStores([store("node-1", COPPELL)], db);

    await backfillMissingAddresses(
      COPPELL,
      milesToMeters(15),
      async () => {
        throw new Error("geocoder unreachable");
      },
      db,
    );

    const retry = await backfillMissingAddresses(
      COPPELL,
      milesToMeters(15),
      async () => ({ address: "1 Main St, Coppell, TX", locality: null }),
      db,
    );

    expect(retry.resolved).toBe(1);
    expect((await getStore("node-1", db))?.address).toBe("1 Main St, Coppell, TX");
  });

  it("caps how many lookups one call makes", async () => {
    const many = Array.from({ length: 20 }, (_, index) =>
      store(`node-${index}`, COPPELL),
    );
    await upsertStores(many, db);

    const result = await backfillMissingAddresses(
      COPPELL,
      milesToMeters(15),
      async () => ({ address: "1 Main St, Coppell, TX", locality: null }),
      db,
    );

    expect(result.attempted).toBe(15);
    expect(result.remaining).toBe(5);
  });
});

describe("rollup recomputation", () => {
  it("never lets a delivery report become the price", async () => {
    await upsertStores([store("node-1", COPPELL)], db);
    await addSubmission("node-1", 300);
    await addSubmission("node-1", 320);
    await addSubmission("node-1", 340);
    await addSubmission("node-1", 1200, { source: "delivery" });
    await addSubmission("node-1", 1300, { source: "delivery" });

    const rollup = await recomputeStoreRollup("node-1", db);

    // The newest non-delivery report. The two delivery prices are the newest
    // reports overall and are still not the price — being recent does not make
    // a marked-up number describe the same transaction.
    expect(rollup?.priceCents).toBe(340);
    expect(rollup?.reportCount).toBe(5);
    expect(rollup?.confirmedCount).toBe(3);
  });

  it("holds a report that would move the price too far instead of applying it", async () => {
    await upsertStores([store("node-1", COPPELL)], db);
    await addSubmission("node-1", 300);
    await addSubmission("node-1", 320);
    await addSubmission("node-1", 340);
    await addSubmission("node-1", 1499, { status: "pending" });

    const rollup = await recomputeStoreRollup("node-1", db);

    expect(rollup?.priceCents).toBe(340);
    // Surfaced rather than silently dropped: somebody claims it is $14.99, and
    // one more person saying so is all it takes to make that the price.
    expect(rollup?.heldPriceCents).toBe(1499);
    expect(rollup?.confirmedCount).toBe(3);
  });

  it("writes the rollup through to the store document", async () => {
    await upsertStores([store("node-1", COPPELL)], db);
    await addSubmission("node-1", 319, { daysAgo: 2 });
    await addSubmission("node-1", 329, { daysAgo: 1 });

    await recomputeStoreRollup("node-1", db);

    const saved = await getStore("node-1", db);
    // The newest report wins outright. Under the old median model this was 324,
    // the midpoint of 319 and 329 — a number neither contributor ever saw on a
    // menu board and which no visit could confirm or refute.
    expect(saved?.priceCents).toBe(329);
    expect(saved?.pricedAt).not.toBeNull();
  });

  it("promotes a held report once a second one corroborates it", async () => {
    // The most intricate write in the app: the replay decides two previously
    // held reports are now trustworthy, so it must rewrite *their* status and
    // the store's price together. `reconcile` is unit-tested as a pure
    // function, but the indices it returns point into the submission list as
    // fetched — newest first — while it walks the reports oldest first. Only a
    // round trip proves the right documents get rewritten.
    await upsertStores([store("node-1", COPPELL)], db);
    await addSubmission("node-1", 300, { daysAgo: 5 });
    await addSubmission("node-1", 899, { daysAgo: 3, status: "pending" });
    await addSubmission("node-1", 909, { daysAgo: 1, status: "pending" });

    const rollup = await recomputeStoreRollup("node-1", db);

    // 899 is far beyond the 40% gate, so on its own it was held. 909 is within
    // 5% of it: two people independently saw the same jump, which is the one
    // thing that can beat a standing price.
    expect(rollup?.priceCents).toBe(909);
    expect(rollup?.heldPriceCents).toBeNull();
    expect(rollup?.confirmedCount).toBe(3);

    const saved = await getSubmissionsForStore("node-1", db);
    const statusOf = (cents: number) =>
      saved.find((submission) => submission.priceCents === cents)?.status;
    // Both, not just the corroborating one — the report that was doubted is
    // vindicated by the second, and leaving it `pending` would make the next
    // replay reach a different conclusion from identical data.
    expect(statusOf(899)).toBe("accepted");
    expect(statusOf(909)).toBe("accepted");
    expect(statusOf(300)).toBe("accepted");
  });

  it("survives a replay that holds and then promotes the same report", async () => {
    // Both outliers arrive claiming `accepted`, which is what a client that
    // guessed wrong sends. Within one replay the first is settled to
    // `pending` and then promoted back to `accepted` when the second
    // corroborates it — so `changed` carries two entries for the *same*
    // document and the batch writes it twice. Worth an explicit test: if
    // Firestore refused repeated writes to one document in a batch, every
    // corroboration arriving this way would throw rather than resolve.
    await upsertStores([store("node-1", COPPELL)], db);
    await addSubmission("node-1", 300, { daysAgo: 5 });
    await addSubmission("node-1", 899, { daysAgo: 3 });
    await addSubmission("node-1", 909, { daysAgo: 1 });

    const rollup = await recomputeStoreRollup("node-1", db);

    expect(rollup?.priceCents).toBe(909);
    expect(rollup?.heldPriceCents).toBeNull();

    const saved = await getSubmissionsForStore("node-1", db);
    // The last write in the batch is the one that must survive.
    expect(saved.find((s) => s.priceCents === 899)?.status).toBe("accepted");
    expect(saved.find((s) => s.priceCents === 909)?.status).toBe("accepted");

    // And the replay must be stable: running it again reaches the same answer
    // from the statuses it just wrote, rather than oscillating.
    const again = await recomputeStoreRollup("node-1", db);
    expect(again).toEqual(rollup);
  });

  it("leaves an uncorroborated report pending in the database, not just in the rollup", async () => {
    await upsertStores([store("node-1", COPPELL)], db);
    await addSubmission("node-1", 300, { daysAgo: 3 });
    await addSubmission("node-1", 1499, { daysAgo: 1 });

    await recomputeStoreRollup("node-1", db);

    const saved = await getSubmissionsForStore("node-1", db);
    const outlier = saved.find((submission) => submission.priceCents === 1499);
    // Written as `accepted` by the fixture and corrected on the way through:
    // status is derived from the whole history, never taken on the client's
    // word, so a report that arrives claiming to be counted still is not.
    expect(outlier?.status).toBe("pending");

    const store1 = await getStore("node-1", db);
    expect(store1?.priceCents).toBe(300);
    expect(store1?.heldPriceCents).toBe(1499);
  });

  it("drops a held report when the price moves for unrelated reasons", async () => {
    await upsertStores([store("node-1", COPPELL)], db);
    await addSubmission("node-1", 300, { daysAgo: 5 });
    await addSubmission("node-1", 899, { daysAgo: 3 });
    // Close enough to 300 to pass the gate outright, so it becomes the price —
    // and the outstanding $8.99 claim is now stale gossip rather than a
    // pending truth waiting to be confirmed.
    await addSubmission("node-1", 320, { daysAgo: 1 });

    const rollup = await recomputeStoreRollup("node-1", db);

    expect(rollup?.priceCents).toBe(320);
    expect(rollup?.heldPriceCents).toBeNull();

    const saved = await getSubmissionsForStore("node-1", db);
    expect(saved.find((s) => s.priceCents === 899)?.status).toBe("pending");
  });

  it("is idempotent — the whole reason the write path can retry it", async () => {
    await upsertStores([store("node-1", COPPELL)], db);
    await addSubmission("node-1", 319);
    await addSubmission("node-1", 349);
    await addSubmission("node-1", 289);

    const first = await recomputeStoreRollup("node-1", db);
    const second = await recomputeStoreRollup("node-1", db);
    const third = await recomputeStoreRollup("node-1", db);

    expect(second).toEqual(first);
    expect(third).toEqual(first);
  });

  it("writes nothing when a recompute changes nothing", async () => {
    // /api/stores/[id]/recompute is unauthenticated by design, so a repeat
    // call must not cost a write. `updateTime` is the only honest witness:
    // it moves if and only if Firestore actually wrote the document.
    await upsertStores([store("node-1", COPPELL)], db);
    await addSubmission("node-1", 319, { daysAgo: 2 });
    await addSubmission("node-1", 329, { daysAgo: 1 });

    await recomputeStoreRollup("node-1", db);
    const first = await db.collection("stores").doc("node-1").get();

    await recomputeStoreRollup("node-1", db);
    const second = await db.collection("stores").doc("node-1").get();

    expect(second.updateTime?.isEqual(first.updateTime!)).toBe(true);
    // And the timestamp round trip is exact, which is what makes the
    // comparison able to detect "nothing changed" at all.
    expect(second.data()?.["priceCents"]).toBe(329);
  });

  it("still writes when a new submission actually changes the price", async () => {
    await upsertStores([store("node-1", COPPELL)], db);
    await addSubmission("node-1", 319, { daysAgo: 2 });
    await recomputeStoreRollup("node-1", db);
    const before = await db.collection("stores").doc("node-1").get();

    await addSubmission("node-1", 329, { daysAgo: 1 });
    const rollup = await recomputeStoreRollup("node-1", db);
    const after = await db.collection("stores").doc("node-1").get();

    expect(rollup?.priceCents).toBe(329);
    expect(after.updateTime?.isEqual(before.updateTime!)).toBe(false);
  });

  it("returns null for a store that does not exist", async () => {
    expect(await recomputeStoreRollup("node-missing", db)).toBeNull();
  });

  it("leaves a store with only delivery prices unmeasured", async () => {
    // It has prices, but none that describe walking in and buying one.
    await upsertStores([store("node-1", COPPELL)], db);
    await addSubmission("node-1", 899, { source: "delivery" });
    await addSubmission("node-1", 949, { source: "delivery" });

    const rollup = await recomputeStoreRollup("node-1", db);

    expect(rollup?.reportCount).toBe(2);
    expect(rollup?.confirmedCount).toBe(0);
    expect(rollup?.priceCents).toBeNull();
  });
});

describe("proximity queries", () => {
  it("returns stores inside the radius and excludes those outside", async () => {
    await upsertStores(
      [
        store("node-coppell", COPPELL),
        store("node-irving", IRVING),
        store("node-austin", AUSTIN),
      ],
      db,
    );

    const nearby = await getStoresNear(COPPELL, milesToMeters(15), db);
    const ids = nearby.map((s) => s.id);

    expect(ids).toContain("node-coppell");
    expect(ids).toContain("node-irving");
    expect(ids).not.toContain("node-austin");
  });

  it("orders results by distance", async () => {
    await upsertStores(
      [store("node-irving", IRVING), store("node-coppell", COPPELL)],
      db,
    );

    const nearby = await getStoresNear(COPPELL, milesToMeters(15), db);
    expect(nearby[0]?.id).toBe("node-coppell");
  });

  it("returns nothing for an area with no stores", async () => {
    await upsertStores([store("node-coppell", COPPELL)], db);
    expect(await getStoresNear(AUSTIN, milesToMeters(15), db)).toEqual([]);
  });
});

describe("submission log", () => {
  it("returns submissions newest first", async () => {
    await upsertStores([store("node-1", COPPELL)], db);
    await addSubmission("node-1", 300, { daysAgo: 30 });
    await addSubmission("node-1", 320, { daysAgo: 2 });
    await addSubmission("node-1", 310, { daysAgo: 10 });

    const log = await getSubmissionsForStore("node-1", db);
    expect(log.map((s) => s.priceCents)).toEqual([320, 310, 300]);
  });
});

describe("Overpass sync gate", () => {
  it("calls Overpass when an area has never been synced", async () => {
    let calls = 0;
    const fetcher = async () => {
      calls += 1;
      return [store("node-1", COPPELL)];
    };

    const result = await syncAreaIfStale(COPPELL, milesToMeters(15), fetcher, db);

    expect(calls).toBe(1);
    expect(result.cached).toBe(false);
    expect(result.created).toBe(1);
  });

  it("skips Overpass when the area was synced recently", async () => {
    // Overpass is donated infrastructure. Re-querying an unchanged area is
    // spending someone else's bandwidth for nothing.
    let calls = 0;
    const fetcher = async () => {
      calls += 1;
      return [store("node-1", COPPELL)];
    };

    await syncAreaIfStale(COPPELL, milesToMeters(15), fetcher, db);
    const second = await syncAreaIfStale(COPPELL, milesToMeters(15), fetcher, db);

    expect(calls).toBe(1);
    expect(second.cached).toBe(true);
    expect(second.found).toBe(1);
  });

  it("fetches enough to serve the whole cell, whoever asks first", async () => {
    // Visitors at opposite corners of one precision-4 cell are ~38 km apart.
    // A sync centred on the first of them covered ~11% of the second one's
    // 15-mile circle, and the gate then told the second visitor the area was
    // fresh.
    const cell = encodeGeohash(COPPELL, 4);
    const [minLat, minLng, maxLat, maxLng] = ngeohash.decode_bbox(cell);
    const southWest = { lat: minLat + 0.001, lng: minLng + 0.001 };
    const northEast = { lat: maxLat - 0.001, lng: maxLng - 0.001 };
    const radius = milesToMeters(15);

    const fetched: Array<{ center: LatLng; radiusMeters: number }> = [];
    const fetcher = async (center: LatLng, radiusMeters: number) => {
      fetched.push({ center, radiusMeters });
      return [];
    };

    await syncAreaIfStale(southWest, radius, fetcher, db);
    const second = await syncAreaIfStale(northEast, radius, fetcher, db);

    expect(fetched).toHaveLength(1);
    expect(second.cached).toBe(true);

    // Each visitor's whole search circle sits inside the circle that was fetched.
    const [{ center, radiusMeters }] = fetched as [{ center: LatLng; radiusMeters: number }];
    for (const visitor of [southWest, northEast]) {
      expect(distanceMeters(visitor, center) + radius).toBeLessThanOrEqual(radiusMeters);
    }
  });

  it("re-syncs when asked to reach further than the last sync did", async () => {
    // Otherwise one request with a tiny radius marks a 20 x 33 km cell as
    // synced for a week while fetching almost nothing.
    let calls = 0;
    const fetcher = async () => {
      calls += 1;
      return [];
    };

    await syncAreaIfStale(COPPELL, milesToMeters(0.1), fetcher, db);
    const wider = await syncAreaIfStale(COPPELL, milesToMeters(15), fetcher, db);

    expect(calls).toBe(2);
    expect(wider.cached).toBe(false);
  });

  it("does not re-sync for a request the last sync already reached", async () => {
    let calls = 0;
    const fetcher = async () => {
      calls += 1;
      return [];
    };

    await syncAreaIfStale(COPPELL, milesToMeters(15), fetcher, db);
    const narrower = await syncAreaIfStale(COPPELL, milesToMeters(5), fetcher, db);

    expect(calls).toBe(1);
    expect(narrower.cached).toBe(true);
  });

  it("treats a log entry with no recorded reach as covering nothing", async () => {
    // Entries written before coverage was tracked: fresh by date, but nothing
    // says how far they fetched, so the honest reading is "not far enough".
    const cell = encodeGeohash(COPPELL, 4);
    await db
      .collection("syncLog")
      .doc(cell)
      .set({ cellKey: cell, lastSyncedAt: Timestamp.now(), storeCount: 3 });

    let calls = 0;
    const fetcher = async () => {
      calls += 1;
      return [];
    };
    const result = await syncAreaIfStale(COPPELL, milesToMeters(15), fetcher, db);

    expect(calls).toBe(1);
    expect(result.cached).toBe(false);
  });
});

describe("feed observations", () => {
  const observation = (storeId: string, priceCents: number, daysAgo: number) => ({
    storeId,
    priceCents,
    observedAt: new Date(Date.now() - daysAgo * DAY_MS).toISOString(),
    feed: "menupricetracker",
    sourceUrl: "https://menupricetracker.com/mcdonalds/texas/coppell/813-macarthur-blvd",
  });

  it("prices an unreported store and records which feed did it", async () => {
    await upsertStores([store("node-1", COPPELL)], db);

    const result = await recordObservations([observation("node-1", 249, 30)], db);
    const priced = await getStore("node-1", db);

    expect(result).toEqual({ written: 1, alreadyRecorded: 0, recomputed: 1 });
    expect(priced?.priceCents).toBe(249);
    expect(priced?.priceFeed).toBe("menupricetracker");
    // Nobody vouched for it. The visitor counts must still say so.
    expect(priced?.confirmedCount).toBe(0);
    expect(priced?.reportCount).toBe(0);
  });

  it("is idempotent, and does not make old data look newly imported", async () => {
    await upsertStores([store("node-1", COPPELL)], db);
    await recordObservations([observation("node-1", 249, 30)], db);
    const [first] = await getObservationsForStore("node-1", db);

    const again = await recordObservations([observation("node-1", 249, 30)], db);
    const all = await getObservationsForStore("node-1", db);

    expect(again).toEqual({ written: 0, alreadyRecorded: 1, recomputed: 0 });
    expect(all).toHaveLength(1);
    expect(all[0]?.importedAt).toBe(first?.importedAt);
  });

  it("gives way to a newer visitor report, and the label follows", async () => {
    await upsertStores([store("node-1", COPPELL)], db);
    await recordObservations([observation("node-1", 249, 30)], db);

    await addSubmission("node-1", 259, { daysAgo: 2 });
    await recomputeStoreRollup("node-1", db);
    const after = await getStore("node-1", db);

    expect(after?.priceCents).toBe(259);
    expect(after?.priceFeed).toBeNull();
    expect(after?.confirmedCount).toBe(1);
  });

  it("promotes a held visitor report that the feed corroborates", async () => {
    await upsertStores([store("node-1", COPPELL)], db);
    await addSubmission("node-1", 249, { daysAgo: 40 });
    await addSubmission("node-1", 449, { daysAgo: 20, status: "pending" });
    await recomputeStoreRollup("node-1", db);
    expect((await getStore("node-1", db))?.heldPriceCents).toBe(449);

    await recordObservations([observation("node-1", 455, 10)], db);
    const after = await getStore("node-1", db);
    const log = await getSubmissionsForStore("node-1", db);

    expect(after?.priceCents).toBe(455);
    expect(after?.heldPriceCents).toBeNull();
    expect(after?.confirmedCount).toBe(2);
    // The promotion lands on the submission itself, not just in the rollup.
    expect(log.find((submission) => submission.priceCents === 449)?.status).toBe("accepted");
  });

  it("keeps a feed-set price through an OSM re-sync", async () => {
    await upsertStores([store("node-1", COPPELL)], db);
    await recordObservations([observation("node-1", 249, 30)], db);

    await upsertStores([store("node-1", COPPELL, { address: "813 S MacArthur Blvd" })], db);
    const after = await getStore("node-1", db);

    expect(after?.priceCents).toBe(249);
    expect(after?.priceFeed).toBe("menupricetracker");
  });
});

describe("Overpass budget", () => {
  const budgetRef = () => db.doc("syncBudget/overpass");

  it("stops calling Overpass once the site-wide budget is spent", async () => {
    await budgetRef().set({ windowStart: Timestamp.now(), used: OVERPASS_BUDGET_PER_WINDOW });

    let calls = 0;
    const fetcher = async () => {
      calls += 1;
      return [store("node-1", COPPELL)];
    };
    const result = await syncAreaIfStale(COPPELL, milesToMeters(15), fetcher, db);

    expect(calls).toBe(0);
    expect(result.deferred).toBe(true);
    expect(result.created).toBe(0);
    expect(result.retryAfterMs).toBeGreaterThan(0);
    expect(result.retryAfterMs).toBeLessThanOrEqual(OVERPASS_BUDGET_WINDOW_MS);
  });

  it("does not mark a deferred area as synced", async () => {
    // A deferral fetched nothing, so the next visitor after the refill has to
    // get a real sync rather than a cached answer.
    await budgetRef().set({ windowStart: Timestamp.now(), used: OVERPASS_BUDGET_PER_WINDOW });
    await syncAreaIfStale(COPPELL, milesToMeters(15), async () => [], db);

    const log = await db.collection("syncLog").doc(encodeGeohash(COPPELL, 4)).get();
    expect(log.exists).toBe(false);
  });

  it("refills once the window has passed", async () => {
    await budgetRef().set({
      windowStart: Timestamp.fromMillis(Date.now() - OVERPASS_BUDGET_WINDOW_MS - 1000),
      used: OVERPASS_BUDGET_PER_WINDOW,
    });

    let calls = 0;
    const fetcher = async () => {
      calls += 1;
      return [];
    };
    const result = await syncAreaIfStale(COPPELL, milesToMeters(15), fetcher, db);

    expect(calls).toBe(1);
    expect(result.deferred).toBe(false);
    expect((await budgetRef().get()).data()?.["used"]).toBe(1);
  });

  it("spends budget on real queries only, never on cached answers", async () => {
    const fetcher = async () => [];

    await syncAreaIfStale(COPPELL, milesToMeters(15), fetcher, db);
    await syncAreaIfStale(COPPELL, milesToMeters(15), fetcher, db); // cached
    await syncAreaIfStale(AUSTIN, milesToMeters(15), fetcher, db);

    expect((await budgetRef().get()).data()?.["used"]).toBe(2);
  });
});

describe("index snapshot", () => {
  it("reports honest zeros on an empty database", async () => {
    // A fresh deployment genuinely has no prices. Inventing a headline number
    // here is exactly what the landing page must not do.
    const snapshot = await getIndexSnapshot(db);

    expect(snapshot.trackedStoreCount).toBe(0);
    expect(snapshot.pricedStoreCount).toBe(0);
    expect(snapshot.staleStoreCount).toBe(0);
    expect(snapshot.lowestPriceCents).toBeNull();
    expect(snapshot.highestPriceCents).toBeNull();
    expect(snapshot.spreadCents).toBeNull();
    expect(snapshot.cheapest).toEqual([]);
    expect(snapshot.priciest).toEqual([]);
  });

  it("counts tracked stores separately from priced ones", async () => {
    await upsertStores(
      [store("node-1", COPPELL), store("node-2", IRVING), store("node-3", AUSTIN)],
      db,
    );
    await addSubmission("node-1", 299);
    await addSubmission("node-2", 449);
    await recomputeStoreRollup("node-1", db);
    await recomputeStoreRollup("node-2", db);

    const snapshot = await getIndexSnapshot(db);

    expect(snapshot.trackedStoreCount).toBe(3);
    expect(snapshot.pricedStoreCount).toBe(2);
  });

  it("computes the headline spread between cheapest and priciest median", async () => {
    await upsertStores([store("node-1", COPPELL), store("node-2", IRVING)], db);
    await addSubmission("node-1", 299);
    await addSubmission("node-2", 441);
    await recomputeStoreRollup("node-1", db);
    await recomputeStoreRollup("node-2", db);

    const snapshot = await getIndexSnapshot(db);

    expect(snapshot.lowestPriceCents).toBe(299);
    expect(snapshot.highestPriceCents).toBe(441);
    expect(snapshot.spreadCents).toBe(142);
  });

  it("keeps a stale store out of the headline number", async () => {
    // The whole point of the landing page is that the number can be trusted.
    // A price nobody has confirmed in four months cannot carry that claim, even
    // though it is a perfectly real median and stays visible on the store page.
    await upsertStores(
      [store("node-1", COPPELL), store("node-2", IRVING), store("node-3", AUSTIN)],
      db,
    );
    await addSubmission("node-1", 299);
    await addSubmission("node-2", 441);
    await addSubmission("node-3", 999, { daysAgo: 120 });
    for (const id of ["node-1", "node-2", "node-3"]) {
      await recomputeStoreRollup(id, db);
    }

    const snapshot = await getIndexSnapshot(db);

    expect(snapshot.pricedStoreCount).toBe(2);
    expect(snapshot.staleStoreCount).toBe(1);
    expect(snapshot.highestPriceCents).toBe(441);
    expect(snapshot.spreadCents).toBe(142);
    expect(snapshot.priciest.map((s) => s.id)).not.toContain("node-3");
  });

  it("ranks the leaderboards cheapest-first and priciest-first", async () => {
    await upsertStores(
      [store("node-1", COPPELL), store("node-2", IRVING), store("node-3", COPPELL)],
      db,
    );
    await addSubmission("node-1", 350);
    await addSubmission("node-2", 275);
    await addSubmission("node-3", 425);
    for (const id of ["node-1", "node-2", "node-3"]) {
      await recomputeStoreRollup(id, db);
    }

    const snapshot = await getIndexSnapshot(db, 2);

    expect(snapshot.cheapest.map((s) => s.priceCents)).toEqual([275, 350]);
    expect(snapshot.priciest.map((s) => s.priceCents)).toEqual([425, 350]);
  });
});
