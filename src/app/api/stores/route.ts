import { NextResponse } from "next/server";

import { milesToMeters } from "@/lib/geohash";
import { getStoresNear } from "@/lib/stores.server";
import { nearbyQuerySchema } from "@/lib/validation";

/**
 * GET /api/stores?lat=&lng=&radiusMiles=
 *
 * Stores near a point, read from Firestore. Deliberately does not touch
 * Overpass — location discovery is a separate, rate-limited concern handled by
 * /api/stores/sync. A map pan should never reach a third-party API.
 */
export async function GET(request: Request): Promise<NextResponse> {
  const { searchParams } = new URL(request.url);

  const parsed = nearbyQuerySchema.safeParse({
    lat: searchParams.get("lat"),
    lng: searchParams.get("lng"),
    radiusMiles: searchParams.get("radiusMiles") ?? undefined,
  });

  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid coordinates", detail: parsed.error.issues },
      { status: 400 },
    );
  }

  const { lat, lng, radiusMiles } = parsed.data;

  try {
    const stores = await getStoresNear({ lat, lng }, milesToMeters(radiusMiles));
    return NextResponse.json({ stores, count: stores.length });
  } catch (error) {
    console.error("[api/stores] lookup failed", error);
    return NextResponse.json({ error: "Store lookup failed" }, { status: 500 });
  }
}
