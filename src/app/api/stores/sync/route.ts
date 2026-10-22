import { NextResponse } from "next/server";

import { milesToMeters } from "@/lib/geohash";
import { OverpassError, fetchNearbyStores } from "@/lib/overpass";
import { reverseGeocode } from "@/lib/reverse-geocode";
import {
  backfillFeedObservations,
  backfillMissingAddresses,
  backfillRestaurantNumbers,
  bundledStoresNear,
  getStoresNear,
  syncAreaIfStale,
} from "@/lib/stores.server";
import { nearbyQuerySchema } from "@/lib/validation";

/**
 * POST /api/stores/sync
 *
 * Reconcile a geographic area against the bundled US store list (or, outside
 * it, OpenStreetMap), then fill in the addresses the source did not supply.
 *
 * Separate from /api/stores because it is the expensive, rate-limited half:
 * Overpass is donated infrastructure, and store locations change on the order
 * of months, so this is gated on how recently the area was last synced. Panning
 * a map must never trigger it.
 *
 * The address backfill runs even when the OSM sync was skipped as fresh. The
 * two have different clocks — an area synced last Tuesday can still be full of
 * stores nobody has ever geocoded — and it is capped per call, so an area heals
 * across a handful of visits rather than in one burst.
 */
/** A sync that prices a whole dense area records and recomputes hundreds of stores. */
export const maxDuration = 60;

export async function POST(request: Request): Promise<NextResponse> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body" }, { status: 400 });
  }

  const parsed = nearbyQuerySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid coordinates", detail: parsed.error.issues },
      { status: 400 },
    );
  }

  const { lat, lng, radiusMiles } = parsed.data;
  const radiusMeters = milesToMeters(radiusMiles);

  try {
    // The gate decides what circle to fetch — the whole cell's coverage, not
    // just this caller's — so the fetcher takes its arguments from the gate.
    // Inside the US the bundled store list answers and Overpass is never
    // asked; elsewhere the sync falls back to it.
    const result = await syncAreaIfStale(
      { lat, lng },
      radiusMeters,
      (center, meters) => fetchNearbyStores(center.lat, center.lng, meters),
      undefined,
      bundledStoresNear,
    );

    if (result.deferred) {
      // The site-wide Overpass budget is spent. The geocoder is donated
      // infrastructure too, so the backfill waits as well; the map still has
      // everything already in the database.
      return NextResponse.json(
        { error: "Store sync is rate limited right now", ...result },
        {
          status: 429,
          headers: { "Retry-After": String(Math.ceil((result.retryAfterMs ?? 0) / 1000)) },
        },
      );
    }

    // The backfills below share one read of the area. Each used to make its
    // own (four reads of the area per sync), and on Firestore's free tier
    // (50,000 reads a day) reads per map visit decide how many visitors the
    // site can serve.
    //
    // A sync from the store list has just read its whole area, a circle at
    // least as wide as the caller's, so that is used instead of another read,
    // and the backfills then cover the whole area in one call.
    const { areaStores, ...summary } = result;
    let known: Awaited<ReturnType<typeof getStoresNear>> | undefined = areaStores;
    if (known === undefined) {
      try {
        known = await getStoresNear({ lat, lng }, radiusMeters);
      } catch (error) {
        console.error("[api/stores/sync] area read for backfills failed", error);
      }
    }

    // Best effort by design. An address we could not look up is a cosmetic
    // gap; failing the whole sync over it would throw away the store list too.
    let addresses = { attempted: 0, resolved: 0, remaining: 0 };
    try {
      addresses = await backfillMissingAddresses(
        { lat, lng },
        radiusMeters,
        (store) => reverseGeocode(store.lat, store.lng),
        undefined,
        undefined,
        known,
      );
    } catch (error) {
      console.error("[api/stores/sync] address backfill failed", error);
    }

    // Restaurant numbers, from the bundled table: no network involved, and
    // just as optional. A store without one still works everywhere.
    let numbers = { assigned: 0 };
    try {
      const { assigned, updates } = await backfillRestaurantNumbers({ lat, lng }, radiusMeters, undefined, undefined, known);
      numbers = { assigned };
      // The feed backfill below pins rows by number, so it needs the ones
      // just assigned, or those stores wait a visit for their price.
      if (known !== undefined && updates.length > 0) {
        const assignedTo = new Map(updates.map(({ id, number }) => [id, number]));
        known = known.map((store) => {
          const number = assignedTo.get(store.id);
          return number === undefined ? store : { ...store, restaurantNumber: number };
        });
      }
    } catch (error) {
      console.error("[api/stores/sync] restaurant-number backfill failed", error);
    }

    // Feed prices shipped with the server (lib/feeds, stores.server). Rows
    // match on street number and city, so a store whose address was only
    // just looked up above is matched on the next sync, from the next read.
    let feedPrices = { recorded: 0, recomputed: 0, retired: 0 };
    try {
      feedPrices = await backfillFeedObservations({ lat, lng }, radiusMeters, undefined, undefined, undefined, known);
    } catch (error) {
      console.error("[api/stores/sync] feed backfill failed", error);
    }

    // New stores and feed prices reach the landing page's figures within the
    // hour (`index-snapshot.server`). Dropping that cache here instead made
    // the next landing view re-read about 500 stores, and while the map fills
    // an area, syncs that add something come every few seconds.

    return NextResponse.json({ ...summary, addresses, numbers, feedPrices });
  } catch (error) {
    if (error instanceof OverpassError) {
      // Every mirror failed. This is upstream unavailability, not a bug here,
      // and the map can still render whatever is already in Firestore.
      console.error("[api/stores/sync] Overpass unavailable", error.attempts);
      return NextResponse.json(
        { error: "OpenStreetMap lookup is unavailable right now", attempts: error.attempts },
        { status: 503 },
      );
    }

    console.error("[api/stores/sync] failed", error);
    return NextResponse.json({ error: "Store sync failed" }, { status: 500 });
  }
}
