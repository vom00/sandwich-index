import { NextResponse } from "next/server";

import { milesToMeters } from "@/lib/geohash";
import { OverpassError, fetchNearbyStores } from "@/lib/overpass";
import { reverseGeocode } from "@/lib/reverse-geocode";
import { backfillMissingAddresses, syncAreaIfStale } from "@/lib/stores.server";
import { nearbyQuerySchema } from "@/lib/validation";

/**
 * POST /api/stores/sync
 *
 * Reconcile a geographic area against OpenStreetMap, then fill in the addresses
 * OSM did not supply.
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
    const result = await syncAreaIfStale({ lat, lng }, radiusMeters, (center, meters) =>
      fetchNearbyStores(center.lat, center.lng, meters),
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

    // Best effort by design. An address we could not look up is a cosmetic
    // gap; failing the whole sync over it would throw away the store list too.
    let addresses = { attempted: 0, resolved: 0, remaining: 0 };
    try {
      addresses = await backfillMissingAddresses(
        { lat, lng },
        radiusMeters,
        (store) => reverseGeocode(store.lat, store.lng),
      );
    } catch (error) {
      console.error("[api/stores/sync] address backfill failed", error);
    }

    return NextResponse.json({ ...result, addresses });
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
