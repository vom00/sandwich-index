import { distanceMeters, type LatLng } from "@/lib/geohash";

/**
 * OpenStreetMap regularly carries one restaurant twice: a node for the
 * amenity POI and a way for the building it sits in. Both arrive from the
 * same Overpass query with different ids, and treating them as two stores
 * splits one restaurant's price history across two map pins — the Irving
 * McDonald's at 5220 N MacArthur existed here as a node with 21 reports and
 * a way with none, one metre apart.
 *
 * Two real McDonald's closer than this do not happen outside a food court,
 * and a food court pair OSM knows about will be two nodes with distinct
 * addresses — which this filter keeps, because twins are decided by
 * distance, not by address equality.
 */
export const TWIN_RADIUS_METERS = 75;

/** The slice of a store this module needs; `OverpassStore` satisfies it. */
export interface TwinCandidate extends LatLng {
  osmId: string;
  address: string | null;
}

/**
 * Which of two co-located OSM elements deserves to be the store.
 *
 * An element with an address beats one without (it carries more information);
 * then a node beats a way, because the point is the amenity and the polygon
 * is the roof. Ties keep the earlier element.
 */
function preferenceRank(candidate: TwinCandidate): number {
  const addressRank = candidate.address === null ? 1 : 0;
  const nodeRank = candidate.osmId.startsWith("node-") ? 0 : 1;
  return addressRank * 2 + nodeRank;
}

/**
 * Drop incoming elements that are almost certainly a twin of an existing
 * store or of a better incoming element.
 *
 * An incoming element whose id matches an existing store is never a twin of
 * it — that is the ordinary update path. Existing stores always win over new
 * incoming ids regardless of preference, because they may already own price
 * history; a merge is a human decision, not a sync side effect.
 *
 * Returns `kept` in the original input order.
 */
export function dropTwinStores<T extends TwinCandidate>(
  incoming: readonly T[],
  existing: readonly Pick<TwinCandidate, "osmId" | "lat" | "lng">[],
): { kept: T[]; droppedIds: string[] } {
  const byPreference = [...incoming].sort(
    (a, b) => preferenceRank(a) - preferenceRank(b),
  );
  const existingIds = new Set(existing.map((store) => store.osmId));

  const keptIds = new Set<string>();
  const droppedIds: string[] = [];

  for (const candidate of byPreference) {
    // A document that already exists takes the update path no matter what
    // sits near it. Dropping its update would not remove the twin from the
    // database — it would only stop the surviving doc from ever refreshing.
    if (existingIds.has(candidate.osmId)) {
      keptIds.add(candidate.osmId);
      continue;
    }

    const twinOfExisting = existing.some(
      (store) =>
        store.osmId !== candidate.osmId &&
        distanceMeters(store, candidate) < TWIN_RADIUS_METERS,
    );
    const twinOfAccepted = byPreference.some(
      (other) =>
        keptIds.has(other.osmId) &&
        other.osmId !== candidate.osmId &&
        distanceMeters(other, candidate) < TWIN_RADIUS_METERS,
    );

    if (twinOfExisting || twinOfAccepted) {
      droppedIds.push(candidate.osmId);
    } else {
      keptIds.add(candidate.osmId);
    }
  }

  return {
    kept: incoming.filter((candidate) => keptIds.has(candidate.osmId)),
    droppedIds,
  };
}
