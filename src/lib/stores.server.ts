import "server-only";

/**
 * Server-side store reads and writes, all through the Admin SDK.
 *
 * Clients cannot write `stores` — the security rules refuse them — so every
 * mutation to a store document happens here. That is deliberate: the move gate
 * in firestore.rules trusts `priceCents`, and a client-writable price would
 * let anyone set the baseline to match whatever they wanted to submit.
 */

import { Timestamp, type Firestore } from "firebase-admin/firestore";

import {
  OBSERVATIONS_COLLECTION,
  STORES_COLLECTION,
  SUBMISSIONS_COLLECTION,
  getAdminDb,
} from "@/lib/firebase/admin";
import {
  AREA_RADIUS_MILES,
  computeAreaComparison,
  type AreaComparison,
} from "@/lib/comparison";
import {
  cellCoverage,
  encodeGeohash,
  filterByRadius,
  geohashQueryBounds,
  milesToMeters,
  sortByDistance,
  type LatLng,
} from "@/lib/geohash";
import {
  reconcile,
  type ObservedPrice,
  type PriceCandidate,
  type StoreRollup,
} from "@/lib/pricing";
import type { OverpassStore } from "@/lib/overpass";
import { observationId } from "@/lib/feed-match";
import { dropTwinStores } from "@/lib/store-twins";
import type { ResolvedAddress } from "@/lib/reverse-geocode";
import { displayStateFor } from "@/lib/tiers";
import { buildNumberIndex, chooseNumbers, type NumberIndex, type NumberRow } from "@/lib/store-numbers";
import restaurantNumberRows from "@/data/restaurant-numbers.json";
import type { ObservationWithId, Store, StoreWithId, SubmissionWithId } from "@/types";

/** Firestore batches cap at 500 operations. */
const BATCH_LIMIT = 450;

/** Tracks when each geographic cell was last reconciled against OpenStreetMap. */
const SYNC_LOG_COLLECTION = "syncLog";

/**
 * How long an area's OSM data is considered current.
 *
 * Restaurants open and close on a timescale of months, and Overpass is a
 * donated shared resource. Re-querying an area more often than this spends
 * someone else's bandwidth to learn nothing.
 */
const SYNC_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/**
 * The unit of "this area was synced": a precision-4 geohash cell, roughly
 * 20 x 33 km at DFW's latitude.
 *
 * The cell is what gets remembered, not what gets fetched. A cell is smaller
 * than a 15-mile search circle, so fetching around whoever happened to ask
 * first would leave the rest of the cell's visitors with gaps; `cellCoverage`
 * widens each fetch so one sync serves the whole cell.
 */
const SYNC_CELL_PRECISION = 4;

/** One document. Server-only — the rules name no such collection, so clients get nothing. */
const OVERPASS_BUDGET_DOC = "syncBudget/overpass";

/**
 * How many Overpass queries the whole site may make per window.
 *
 * The sync route is unauthenticated, and the freshness gate only stops repeat
 * queries for the *same* cell. Without a site-wide ceiling, anyone could post a
 * fresh cell's coordinates every second and turn this server into an amplifier
 * aimed at donated infrastructure. Real visitors trigger one query per newly
 * visited cell per week, so 60 an hour is far above genuine demand and far
 * below anything Overpass's operators would notice.
 */
export const OVERPASS_BUDGET_PER_WINDOW = 60;
export const OVERPASS_BUDGET_WINDOW_MS = 60 * 60 * 1000;

/**
 * A `stores` document exactly as Firestore holds it.
 *
 * Distinct from the `Store` domain type on purpose: Firestore keeps native
 * `Timestamp` values because security rules compare against `request.time`,
 * while everything above the converter boundary uses ISO strings. Writing this
 * out as a type keeps the two from being quietly swapped.
 */
type StoreDocument = Omit<
  Store,
  "pricedAt" | "lastSyncedAt" | "addressCheckedAt"
> & {
  pricedAt: Timestamp | null;
  lastSyncedAt: Timestamp;
  addressCheckedAt: Timestamp | null;
};

function timestampToIso(value: unknown): string | null {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  return null;
}

function toStore(id: string, data: FirebaseFirestore.DocumentData): StoreWithId {
  return {
    id,
    osmId: typeof data["osmId"] === "string" ? data["osmId"] : id,
    name: typeof data["name"] === "string" ? data["name"] : "McDonald's",
    address: typeof data["address"] === "string" ? data["address"] : null,
    locality: typeof data["locality"] === "string" ? data["locality"] : null,
    restaurantNumber:
      typeof data["restaurantNumber"] === "string" ? data["restaurantNumber"] : null,
    lat: Number(data["lat"]),
    lng: Number(data["lng"]),
    geohash: typeof data["geohash"] === "string" ? data["geohash"] : "",
    addressCheckedAt: timestampToIso(data["addressCheckedAt"]),
    reportCount: Number(data["reportCount"] ?? 0),
    confirmedCount: Number(data["confirmedCount"] ?? 0),
    priceCents: typeof data["priceCents"] === "number" ? data["priceCents"] : null,
    heldPriceCents:
      typeof data["heldPriceCents"] === "number" ? data["heldPriceCents"] : null,
    pricedAt: timestampToIso(data["pricedAt"]),
    priceFeed: typeof data["priceFeed"] === "string" ? data["priceFeed"] : null,
    lastSyncedAt: timestampToIso(data["lastSyncedAt"]) ?? new Date(0).toISOString(),
  };
}

function toObservation(
  id: string,
  data: FirebaseFirestore.DocumentData,
): ObservationWithId {
  return {
    id,
    storeId: String(data["storeId"]),
    priceCents: Number(data["priceCents"]),
    observedAt: timestampToIso(data["observedAt"]) ?? new Date(0).toISOString(),
    feed: String(data["feed"]),
    sourceUrl: typeof data["sourceUrl"] === "string" ? data["sourceUrl"] : null,
    importedAt: timestampToIso(data["importedAt"]) ?? new Date(0).toISOString(),
  };
}

function toSubmission(
  id: string,
  data: FirebaseFirestore.DocumentData,
): SubmissionWithId {
  return {
    id,
    storeId: String(data["storeId"]),
    priceCents: Number(data["priceCents"]),
    submittedAt: timestampToIso(data["submittedAt"]) ?? new Date(0).toISOString(),
    source: data["source"],
    status: data["status"],
    flagCount: Number(data["flagCount"] ?? 0),
  };
}

/**
 * Insert new stores and refresh the OSM-derived fields of existing ones.
 *
 * Price rollups are never touched on update. A location re-sync must not reset
 * a store's price to zero, so only the fields that actually come from
 * OpenStreetMap are written for a document that already exists.
 *
 * A blank address is not written over a known one either. The weekly OSM
 * refresh runs long after the reverse geocoder has filled in the stores whose
 * tags were empty, and writing `address: null` back over that answer would
 * undo the backfill every seven days — a bug that would only ever be visible
 * as addresses mysteriously coming and going.
 */
export async function upsertStores(
  stores: readonly OverpassStore[],
  db: Firestore = getAdminDb(),
): Promise<{ created: number; updated: number }> {
  if (stores.length === 0) return { created: 0, updated: 0 };

  const collection = db.collection(STORES_COLLECTION);
  const refs = stores.map((store) => collection.doc(store.osmId));
  const existing = await db.getAll(...refs);
  const existingIds = new Set(
    existing.filter((snapshot) => snapshot.exists).map((snapshot) => snapshot.id),
  );

  const now = Timestamp.now();
  let created = 0;
  let updated = 0;

  for (let offset = 0; offset < stores.length; offset += BATCH_LIMIT) {
    const batch = db.batch();

    for (const store of stores.slice(offset, offset + BATCH_LIMIT)) {
      const ref = collection.doc(store.osmId);
      const osmFields = {
        osmId: store.osmId,
        name: store.name,
        lat: store.lat,
        lng: store.lng,
        geohash: store.geohash,
        lastSyncedAt: now,
      };

      if (existingIds.has(store.osmId)) {
        batch.update(ref, {
          ...osmFields,
          ...(store.address === null ? {} : { address: store.address }),
          ...(store.locality === null ? {} : { locality: store.locality }),
        });
        updated += 1;
      } else {
        batch.set(ref, {
          ...osmFields,
          address: store.address,
          locality: store.locality,
          restaurantNumber: null,
          addressCheckedAt: null,
          reportCount: 0,
          confirmedCount: 0,
          priceCents: null,
          heldPriceCents: null,
          pricedAt: null,
          priceFeed: null,
        } satisfies StoreDocument);
        created += 1;
      }
    }

    await batch.commit();
  }

  return { created, updated };
}

/**
 * Stores within `radiusMeters` of a point.
 *
 * Geohash prefix ranges over-select — they cover rectangles, the query is a
 * circle — so results are trimmed by real distance before being returned.
 */
export async function getStoresNear(
  center: LatLng,
  radiusMeters: number,
  db: Firestore = getAdminDb(),
): Promise<StoreWithId[]> {
  const bounds = geohashQueryBounds(center, radiusMeters);

  const snapshots = await Promise.all(
    bounds.map(([start, end]) =>
      db
        .collection(STORES_COLLECTION)
        .orderBy("geohash")
        .startAt(start)
        .endBefore(end)
        .get(),
    ),
  );

  // Ranges can overlap at the edges, so the same store may come back twice.
  const byId = new Map<string, StoreWithId>();
  for (const snapshot of snapshots) {
    for (const document of snapshot.docs) {
      byId.set(document.id, toStore(document.id, document.data()));
    }
  }

  return sortByDistance(filterByRadius([...byId.values()], center, radiusMeters), center);
}

export async function getStore(
  storeId: string,
  db: Firestore = getAdminDb(),
): Promise<StoreWithId | null> {
  const snapshot = await db.collection(STORES_COLLECTION).doc(storeId).get();
  if (!snapshot.exists) return null;
  return toStore(snapshot.id, snapshot.data() ?? {});
}

/**
 * The store with this McDonald's restaurant number, or null. Null too when two
 * stores claim it, which the import refuses to write but an old snapshot
 * could still hold; a wrong store is worse than none.
 */
export async function getStoreByRestaurantNumber(
  restaurantNumber: string,
  db: Firestore = getAdminDb(),
): Promise<StoreWithId | null> {
  const snapshot = await db
    .collection(STORES_COLLECTION)
    .where("restaurantNumber", "==", restaurantNumber)
    .limit(2)
    .get();
  if (snapshot.size !== 1) return null;
  const doc = snapshot.docs[0]!;
  return toStore(doc.id, doc.data());
}

export async function getSubmissionsForStore(
  storeId: string,
  db: Firestore = getAdminDb(),
): Promise<SubmissionWithId[]> {
  const snapshot = await db
    .collection(SUBMISSIONS_COLLECTION)
    .where("storeId", "==", storeId)
    .get();

  return snapshot.docs
    .map((document) => toSubmission(document.id, document.data()))
    .sort((a, b) => b.submittedAt.localeCompare(a.submittedAt));
}

/** Feed observations for one store, newest first. */
export async function getObservationsForStore(
  storeId: string,
  db: Firestore = getAdminDb(),
): Promise<ObservationWithId[]> {
  const snapshot = await db
    .collection(OBSERVATIONS_COLLECTION)
    .where("storeId", "==", storeId)
    .get();

  return snapshot.docs
    .map((document) => toObservation(document.id, document.data()))
    .sort((a, b) => b.observedAt.localeCompare(a.observedAt));
}

/**
 * Compare one store's price against the stores around it.
 *
 * The baseline is a median — the one that survived the move away from them,
 * because it summarises across *restaurants*, where a midpoint fairly
 * describes a market, rather than across reports about one restaurant, where
 * it described a number nobody had been charged.
 *
 * Two exclusions decide whether it means anything:
 *
 *   - **The store itself never contributes to its own baseline.** Including it
 *     drags the comparison toward zero, and the fewer neighbours there are the
 *     harder it drags — exactly the case where the comparison is already
 *     weakest.
 *   - **Stale and unmeasured neighbours are dropped.** A price nobody has
 *     confirmed in three months is not evidence of what the area charges today.
 */
export async function getAreaComparison(
  store: StoreWithId,
  db: Firestore = getAdminDb(),
  now: Date = new Date(),
): Promise<AreaComparison> {
  const neighbours = await getStoresNear(
    { lat: store.lat, lng: store.lng },
    milesToMeters(AREA_RADIUS_MILES),
    db,
  );

  const peerPrices = neighbours
    .filter((peer) => peer.id !== store.id && displayStateFor(peer, now) === "priced")
    .map((peer) => peer.priceCents)
    .filter((cents): cents is number => cents !== null);

  return computeAreaComparison(store.priceCents, peerPrices);
}

/**
 * Recompute a store's denormalized price rollup from its submissions.
 *
 * Derived rather than incremental, which is what makes it safe to retry: run
 * it twice on the same data and the answer is identical. The submission write
 * path calls this after committing, and it can also be called to reconcile a
 * store whose rollup drifted because a previous call failed.
 */
export async function recomputeStoreRollup(
  storeId: string,
  db: Firestore = getAdminDb(),
): Promise<StoreRollup | null> {
  const storeRef = db.collection(STORES_COLLECTION).doc(storeId);
  const storeSnapshot = await storeRef.get();
  if (!storeSnapshot.exists) return null;

  const [submissions, observations] = await Promise.all([
    getSubmissionsForStore(storeId, db),
    getObservationsForStore(storeId, db),
  ]);
  const candidates: PriceCandidate[] = submissions.map((submission) => ({
    priceCents: submission.priceCents,
    source: submission.source,
    status: submission.status,
    submittedAt: submission.submittedAt,
  }));
  const observed: ObservedPrice[] = observations.map((observation) => ({
    priceCents: observation.priceCents,
    observedAt: observation.observedAt,
    feed: observation.feed,
  }));

  const { rollup, changed } = reconcile(candidates, observed);

  /*
   * Status corrections and the rollup go in one batch.
   *
   * The replay can decide that a report held earlier has since been
   * corroborated and belongs in the price. That is a change to the submission's
   * own `status`, and it has to land together with the price it produced —
   * committing the store's new price while leaving the submission marked
   * `pending` would make the next replay compute a different answer from the
   * same data, and the whole reason this is derived rather than incremental is
   * that it must not do that.
   *
   * Clients cannot write `status`; the rules refuse them. Promotion is a
   * server-side judgement about the history as a whole, which is exactly the
   * kind of thing a client should not be trusted with.
   */
  /*
   * A recompute that changes nothing writes nothing.
   *
   * This endpoint is deliberately unauthenticated — it takes only a store id
   * and cannot corrupt anything, since the answer is derived from the
   * submissions that already exist. But "cannot corrupt" is not "is free":
   * every call reads the store plus all its submissions, and this used to
   * commit a write unconditionally. Against a billed Firestore that made a
   * public URL into a way to spend somebody else's money, one guaranteed
   * write at a time.
   *
   * Comparing first makes the repeat case cost reads only. It also matches
   * what the function already claims about itself: running it twice on the
   * same data produces the same answer, so the second run has nothing to say.
   */
  const stored = toStore(storeSnapshot.id, storeSnapshot.data() ?? {});
  const unchanged =
    changed.length === 0 &&
    stored.reportCount === rollup.reportCount &&
    stored.confirmedCount === rollup.confirmedCount &&
    stored.priceCents === rollup.priceCents &&
    stored.heldPriceCents === rollup.heldPriceCents &&
    stored.pricedAt === rollup.pricedAt &&
    stored.priceFeed === rollup.priceFeed;

  if (unchanged) return rollup;

  const batch = db.batch();

  for (const { index, status } of changed) {
    const submission = submissions[index];
    if (submission === undefined) continue;
    batch.update(db.collection(SUBMISSIONS_COLLECTION).doc(submission.id), { status });
  }

  batch.update(storeRef, {
    reportCount: rollup.reportCount,
    confirmedCount: rollup.confirmedCount,
    priceCents: rollup.priceCents,
    heldPriceCents: rollup.heldPriceCents,
    pricedAt:
      rollup.pricedAt === null ? null : Timestamp.fromDate(new Date(rollup.pricedAt)),
    priceFeed: rollup.priceFeed,
  });

  await batch.commit();

  return rollup;
}

/** One feed observation to record, already matched to a store. */
export interface ObservationInput {
  storeId: string;
  priceCents: number;
  /** ISO 8601. */
  observedAt: string;
  feed: string;
  sourceUrl: string | null;
}

export interface RecordObservationsResult {
  /** Observations that did not exist before this call. */
  written: number;
  /** Observations already on file — the same feed, store and day. */
  alreadyRecorded: number;
  /** Stores whose rollup was recomputed because something new arrived. */
  recomputed: number;
}

/**
 * Write feed observations, then recompute the stores they touch.
 *
 * Idempotent by construction: an observation's id is its feed, store and day,
 * so importing the same file twice finds everything already on file and writes
 * nothing. An observation that already exists is left exactly as it is,
 * `importedAt` included — re-running an import must not make old data look
 * newly arrived.
 *
 * Callers are responsible for licensing. This trusts that the feed may be
 * written here; `scripts/import-observations.ts` is where that is checked.
 */
export async function recordObservations(
  inputs: readonly ObservationInput[],
  db: Firestore = getAdminDb(),
): Promise<RecordObservationsResult> {
  if (inputs.length === 0) return { written: 0, alreadyRecorded: 0, recomputed: 0 };

  const collection = db.collection(OBSERVATIONS_COLLECTION);
  const refs = inputs.map((input) =>
    collection.doc(observationId(input.feed, input.storeId, input.observedAt)),
  );
  const existing = await db.getAll(...refs);
  const onFile = new Set(existing.filter((snap) => snap.exists).map((snap) => snap.id));

  const fresh = inputs.filter((_, index) => !onFile.has(refs[index]?.id ?? ""));
  const importedAt = Timestamp.now();

  for (let offset = 0; offset < fresh.length; offset += BATCH_LIMIT) {
    const batch = db.batch();
    for (const input of fresh.slice(offset, offset + BATCH_LIMIT)) {
      batch.set(collection.doc(observationId(input.feed, input.storeId, input.observedAt)), {
        storeId: input.storeId,
        priceCents: input.priceCents,
        observedAt: Timestamp.fromDate(new Date(input.observedAt)),
        feed: input.feed,
        sourceUrl: input.sourceUrl,
        importedAt,
      });
    }
    await batch.commit();
  }

  const touched = [...new Set(fresh.map((input) => input.storeId))];
  for (const storeId of touched) {
    await recomputeStoreRollup(storeId, db);
  }

  return {
    written: fresh.length,
    alreadyRecorded: inputs.length - fresh.length,
    recomputed: touched.length,
  };
}

export interface SyncResult {
  /** True when the area was already fresh and Overpass was not contacted. */
  cached: boolean;
  /**
   * True when the area needed a sync but the site-wide Overpass budget was
   * spent. Nothing was fetched; what the database already holds is all there is.
   */
  deferred: boolean;
  /** Milliseconds until the budget refills. Present only when `deferred`. */
  retryAfterMs?: number;
  /**
   * Stores in the area this call answered for: the caller's circle when cached
   * or deferred, the whole fetched cell coverage after a real sync.
   */
  found: number;
  created: number;
  updated: number;
  /** ISO 8601, or null when the cell has never been synced. */
  lastSyncedAt: string | null;
}

/** Fetches every store within a circle. In production, Overpass. */
export type StoreFetcher = (
  center: LatLng,
  radiusMeters: number,
) => Promise<readonly OverpassStore[]>;

/**
 * Spend one query from the site-wide Overpass budget, or report that none is
 * left. Transactional, so two syncs racing for the last query cannot both win.
 *
 * A query is spent whether or not Overpass then answers — a failed request
 * still landed on someone else's server.
 */
async function reserveOverpassQuery(
  db: Firestore,
  now: number = Date.now(),
): Promise<{ allowed: true } | { allowed: false; retryAfterMs: number }> {
  const ref = db.doc(OVERPASS_BUDGET_DOC);

  return db.runTransaction(async (transaction) => {
    const data = (await transaction.get(ref)).data();
    const windowStart =
      data?.["windowStart"] instanceof Timestamp ? data["windowStart"].toMillis() : 0;
    const used = typeof data?.["used"] === "number" ? data["used"] : 0;

    if (now - windowStart >= OVERPASS_BUDGET_WINDOW_MS) {
      transaction.set(ref, { windowStart: Timestamp.fromMillis(now), used: 1 });
      return { allowed: true } as const;
    }

    if (used < OVERPASS_BUDGET_PER_WINDOW) {
      transaction.set(ref, { windowStart: Timestamp.fromMillis(windowStart), used: used + 1 });
      return { allowed: true } as const;
    }

    return {
      allowed: false,
      retryAfterMs: windowStart + OVERPASS_BUDGET_WINDOW_MS - now,
    } as const;
  });
}

/**
 * Reconcile an area against OpenStreetMap, but only if it is stale.
 *
 * Freshness is tracked per geohash cell, and a cell only counts as fresh if
 * its last sync reached at least as far as this request needs. That second
 * condition is not pedantry: without it, one request with a tiny radius would
 * mark a whole 20 x 33 km cell as synced for a week while fetching almost
 * nothing. A log entry written before coverage was recorded says nothing about
 * how far it reached, so it counts as covering nothing and re-syncs once.
 *
 * The fetcher is injected rather than imported so this stays testable without
 * reaching the network, and so the Overpass dependency lives at the route
 * boundary where the fair-use obligation is visible.
 */
export async function syncAreaIfStale(
  center: LatLng,
  radiusMeters: number,
  fetcher: StoreFetcher,
  db: Firestore = getAdminDb(),
): Promise<SyncResult> {
  const cellKey = encodeGeohash(center, SYNC_CELL_PRECISION);
  const coverage = cellCoverage(cellKey, radiusMeters);
  const syncRef = db.collection(SYNC_LOG_COLLECTION).doc(cellKey);
  const existing = (await syncRef.get()).data();

  const lastSynced = existing ? timestampToIso(existing["lastSyncedAt"]) : null;
  const coveredMeters =
    typeof existing?.["coverageMeters"] === "number" ? existing["coverageMeters"] : 0;
  const fresh =
    lastSynced !== null && Date.now() - new Date(lastSynced).getTime() < SYNC_TTL_MS;

  if (fresh && coveredMeters >= coverage.radiusMeters) {
    const knownStores = await getStoresNear(center, radiusMeters, db);
    return {
      cached: true,
      deferred: false,
      found: knownStores.length,
      created: 0,
      updated: 0,
      lastSyncedAt: lastSynced,
    };
  }

  const budget = await reserveOverpassQuery(db);
  if (!budget.allowed) {
    const knownStores = await getStoresNear(center, radiusMeters, db);
    return {
      cached: false,
      deferred: true,
      retryAfterMs: budget.retryAfterMs,
      found: knownStores.length,
      created: 0,
      updated: 0,
      lastSyncedAt: lastSynced,
    };
  }

  const stores = await fetcher(coverage.center, coverage.radiusMeters);

  // OSM often maps one restaurant as both a node and a way. Twins are
  // filtered against what this area already holds, so a re-mapped location
  // upstream cannot arrive as a second store next to the first.
  const known = await getStoresNear(coverage.center, coverage.radiusMeters, db);
  const { kept, droppedIds } = dropTwinStores(stores, known);
  if (droppedIds.length > 0) {
    console.warn("[stores.sync] dropped OSM twin(s):", droppedIds.join(", "));
  }

  const { created, updated } = await upsertStores(kept, db);

  const now = Timestamp.now();
  await syncRef.set({
    cellKey,
    lastSyncedAt: now,
    storeCount: kept.length,
    coverageMeters: coverage.radiusMeters,
  });

  return {
    cached: false,
    deferred: false,
    found: kept.length,
    created,
    updated,
    lastSyncedAt: now.toDate().toISOString(),
  };
}

/**
 * How long a fruitless address lookup is respected before trying again.
 *
 * A store the geocoder cannot place is usually one OSM has no address data for
 * at all, and that does not change by tomorrow. Without this the same handful
 * of stores would be looked up on every sync forever, which is precisely the
 * pattern a donated geocoder is entitled to block us for.
 */
const ADDRESS_RETRY_TTL_MS = 30 * 24 * 60 * 60 * 1000;

/** Lookups per sync call. Keeps one map load from becoming a burst. */
const ADDRESS_BACKFILL_LIMIT = 15;

/** Concurrent lookups within that cap. Polite, and still finishes in seconds. */
const ADDRESS_BACKFILL_CONCURRENCY = 3;

let numberIndex: NumberIndex | null = null;

/** Built on first use: 13,600 rows, so not on every cold start that never syncs. */
function restaurantNumberIndex(): NumberIndex {
  numberIndex ??= buildNumberIndex(restaurantNumberRows as unknown as NumberRow[]);
  return numberIndex;
}

/**
 * Give the stores around a point their McDonald's restaurant numbers, where
 * the match is unambiguous (`lib/store-numbers`). Runs on every sync, like
 * the address backfill, so a store gets its number the first time anyone
 * looks at its area, and production needs no import run against it.
 *
 * Only fills gaps: a number already recorded is never changed here, and a
 * number another store nearby already holds is not handed out again.
 */
export async function backfillRestaurantNumbers(
  center: LatLng,
  radiusMeters: number,
  db: Firestore = getAdminDb(),
  index: NumberIndex = restaurantNumberIndex(),
): Promise<{ assigned: number }> {
  const nearby = await getStoresNear(center, radiusMeters, db);
  const held = new Set(nearby.map((store) => store.restaurantNumber).filter((n) => n !== null));
  const picks = chooseNumbers(nearby, index);

  const updates = nearby.flatMap((store) => {
    const number = picks.get(store.id);
    return store.restaurantNumber === null && number !== undefined && !held.has(number)
      ? [{ id: store.id, number }]
      : [];
  });

  for (let offset = 0; offset < updates.length; offset += BATCH_LIMIT) {
    const batch = db.batch();
    for (const { id, number } of updates.slice(offset, offset + BATCH_LIMIT)) {
      batch.update(db.collection(STORES_COLLECTION).doc(id), { restaurantNumber: number });
    }
    await batch.commit();
  }
  return { assigned: updates.length };
}

export interface AddressBackfillResult {
  attempted: number;
  /** Lookups that produced an address or at least a locality. */
  resolved: number;
  /** Still missing an address and not yet attempted — picked up next sync. */
  remaining: number;
}

/**
 * Fill in addresses for nearby stores that have none.
 *
 * Runs after the OSM sync rather than inside it, and against what is already in
 * Firestore rather than against what Overpass just returned, because the stores
 * that need this were mostly written months ago. Every area heals itself over
 * a few visits and then stops asking.
 *
 * The resolver is injected for the same reason the Overpass fetcher is: it
 * keeps the third-party fair-use dependency visible at the route boundary, and
 * it keeps this function testable without the network.
 */
export async function backfillMissingAddresses(
  center: LatLng,
  radiusMeters: number,
  resolve: (store: StoreWithId) => Promise<ResolvedAddress | null>,
  db: Firestore = getAdminDb(),
  now: Date = new Date(),
): Promise<AddressBackfillResult> {
  const nearby = await getStoresNear(center, radiusMeters, db);

  const candidates = nearby.filter((store) => {
    if (store.address !== null) return false;
    if (store.addressCheckedAt === null) return true;
    return now.getTime() - new Date(store.addressCheckedAt).getTime() > ADDRESS_RETRY_TTL_MS;
  });

  const batch = candidates.slice(0, ADDRESS_BACKFILL_LIMIT);
  let resolved = 0;

  for (let offset = 0; offset < batch.length; offset += ADDRESS_BACKFILL_CONCURRENCY) {
    const slice = batch.slice(offset, offset + ADDRESS_BACKFILL_CONCURRENCY);

    await Promise.all(
      slice.map(async (store) => {
        let answer: ResolvedAddress | null;
        try {
          answer = await resolve(store);
        } catch (error) {
          // The geocoder being down is not evidence about this store, so the
          // attempt is not recorded and the store stays in the queue.
          console.error(`[stores] address lookup failed for ${store.id}`, error);
          return;
        }

        // Stamped even on a null answer. That is the whole point of the field:
        // "asked, nothing there" has to be distinguishable from "never asked".
        const update: Record<string, unknown> = { addressCheckedAt: Timestamp.now() };

        if (answer !== null) {
          if (answer.address !== null) update["address"] = answer.address;
          if (answer.locality !== null) update["locality"] = answer.locality;
          if (answer.address !== null || store.locality === null) resolved += 1;
        }

        await db.collection(STORES_COLLECTION).doc(store.id).update(update);
      }),
    );
  }

  return {
    attempted: batch.length,
    resolved,
    remaining: candidates.length - batch.length,
  };
}

export interface IndexSnapshot {
  /** Every store on file, priced or not. */
  trackedStoreCount: number;
  /** Stores with a price recent enough to quote. */
  pricedStoreCount: number;
  /** Has a price, but nothing confirmed inside the staleness window. */
  staleStoreCount: number;
  lowestPriceCents: number | null;
  highestPriceCents: number | null;
  /** The headline number: gap between the cheapest and priciest current price. */
  spreadCents: number | null;
  /** Cheapest first. Never more than `leaderLimit` entries. */
  cheapest: StoreWithId[];
  /**
   * Priciest first. Overlaps `cheapest` when fewer than `leaderLimit * 2`
   * stores have a current price — callers rendering both must check
   * `pricedStoreCount` before showing them as two separate lists.
   */
  priciest: StoreWithId[];
}

/**
 * How many priced stores the snapshot reads before summarising.
 *
 * Staleness cannot be filtered in the query — `pricedAt` is an inequality
 * on a different field than the `orderBy`, which Firestore will not accept — so
 * the cut happens in memory and this caps how much is pulled to do it.
 *
 * Read from both ends (see `getIndexSnapshot`), so the cheapest and priciest
 * figures stay correct however large the index grows. What the cap still
 * bounds is the *counts*: past 500 priced stores, `pricedStoreCount` and
 * `staleStoreCount` describe the two windows rather than the whole set, and a
 * maintained aggregate document is the answer at that point.
 */
const SNAPSHOT_LIMIT = 250;

/**
 * Dataset-wide figures for the landing page.
 *
 * Stale stores are counted but excluded from the headline spread and the
 * leaderboards. A four-month-old price presented as "the cheapest McChicken in
 * the metro" is a claim this site cannot stand behind, and the landing page is
 * the last place to start overstating things.
 *
 * Returns honest zeros and nulls on an empty database rather than inventing
 * anything. A fresh deployment genuinely has no prices.
 */
export async function getIndexSnapshot(
  db: Firestore = getAdminDb(),
  leaderLimit = 3,
  now: Date = new Date(),
): Promise<IndexSnapshot> {
  const collection = db.collection(STORES_COLLECTION);

  // Both ends of the range, read separately.
  //
  // One ascending window silently lies as soon as the index outgrows it: the
  // 250 cheapest stores are read, the most expensive of *those* is presented
  // as the priciest McChicken on the site, and the headline spread — the
  // single largest claim on the landing page — shrinks without anything
  // looking wrong. Reading from both ends keeps the endpoints true at any
  // size. The windows overlap harmlessly below the cap; the map dedupes.
  const [trackedCount, cheapestSnapshot, priciestSnapshot] = await Promise.all([
    collection.count().get(),
    collection
      .where("priceCents", ">", 0)
      .orderBy("priceCents", "asc")
      .limit(SNAPSHOT_LIMIT)
      .get(),
    collection
      .where("priceCents", ">", 0)
      .orderBy("priceCents", "desc")
      .limit(SNAPSHOT_LIMIT)
      .get(),
  ]);

  const byId = new Map<string, StoreWithId>();
  for (const document of [...cheapestSnapshot.docs, ...priciestSnapshot.docs]) {
    byId.set(document.id, toStore(document.id, document.data()));
  }
  const priced = [...byId.values()].sort((a, b) => (a.priceCents ?? 0) - (b.priceCents ?? 0));

  const current = priced.filter((store) => displayStateFor(store, now) === "priced");

  const lowestPriceCents = current[0]?.priceCents ?? null;
  const highestPriceCents = current[current.length - 1]?.priceCents ?? null;

  return {
    trackedStoreCount: trackedCount.data().count,
    pricedStoreCount: current.length,
    staleStoreCount: priced.length - current.length,
    lowestPriceCents,
    highestPriceCents,
    spreadCents:
      lowestPriceCents !== null && highestPriceCents !== null
        ? highestPriceCents - lowestPriceCents
        : null,
    cheapest: current.slice(0, leaderLimit),
    priciest: current.slice(-leaderLimit).reverse(),
  };
}
