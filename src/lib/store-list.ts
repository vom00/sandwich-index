/**
 * The US store list shipped with the server (`src/data/us-stores.json`, built
 * by `npm run build:store-list` from All The Places, CC0).
 *
 * Every US McDonald's is in it, with a street address and, almost always, a
 * restaurant number. An area sync inside the list reads it instead of asking
 * Overpass (`stores.server` `syncAreaIfStale`), which is what lets the map
 * cover the whole country: no third-party query per new area, no hourly
 * budget, no store waiting on an OSM mapper to add its street.
 *
 * Stores first seen this way get ids like `atp-1844` (the restaurant number).
 * Stores that came from OpenStreetMap before keep their `node-…`/`way-…` ids
 * and their history; `dropListedDuplicates` keeps the list from adding a
 * second pin next to one of them.
 */

import { composeLocality, composeStreetAddress } from "@/lib/address";
import { STORE_GEOHASH_PRECISION, distanceMeters, encodeGeohash, type LatLng } from "@/lib/geohash";
import type { OverpassStore } from "@/lib/overpass";

/** One store as the build script writes it: `[ref, lat, lng, street, city, state, postcode]`. */
export type ListedRow = readonly [
  ref: string,
  lat: number,
  lng: number,
  street: string | null,
  city: string | null,
  state: string | null,
  postcode: string | null,
];

/** A store from the list, in the shape the sync writes. */
export interface ListedStore extends OverpassStore {
  restaurantNumber: string | null;
}

export const LISTED_ID_PREFIX = "atp-";

/**
 * How far from every listed store a point can be and still count as inside
 * the list. Past this the sync falls back to Overpass, which is how a map
 * opened in Canada or Mexico still finds stores. Rural gaps between US
 * McDonald's are well under this.
 */
export const LIST_REACH_METERS = 100_000;

/**
 * An existing store this close to a listed one is the same restaurant. Wider
 * than `store-twins`' 75 m because the two sources place a pin differently:
 * OSM on the building, the locator often on the lot or the road.
 */
export const LISTED_DUPLICATE_METERS = 150;

const RESTAURANT_NUMBER = /^\d{3,5}$/;

/** Where a store's location came from, by its id, for the credit on its page. */
export function locationSource(storeId: string): "All The Places" | "OpenStreetMap" {
  return storeId.startsWith(LISTED_ID_PREFIX) ? "All The Places" : "OpenStreetMap";
}

export function toListedStore(row: ListedRow): ListedStore {
  const [ref, lat, lng, street, city, state, postcode] = row;
  const parts = {
    street: street ?? undefined,
    city: city ?? undefined,
    state: state ?? undefined,
    postcode: postcode ?? undefined,
  };
  return {
    osmId: `${LISTED_ID_PREFIX}${ref}`,
    name: "McDonald's",
    address: composeStreetAddress(parts),
    locality: composeLocality(parts),
    lat,
    lng,
    geohash: encodeGeohash({ lat, lng }, STORE_GEOHASH_PRECISION),
    restaurantNumber: RESTAURANT_NUMBER.test(ref) ? ref : null,
  };
}

/**
 * The listed stores within `radiusMeters` of `center`, or null when the point
 * is outside the list altogether (no listed store within `LIST_REACH_METERS`
 * of the circle), in which case the caller should ask Overpass instead.
 */
export function listedStoresNear(
  rows: readonly ListedRow[],
  center: LatLng,
  radiusMeters: number,
): ListedStore[] | null {
  const inside: ListedRow[] = [];
  let nearest = Number.POSITIVE_INFINITY;
  for (const row of rows) {
    // Cheap reject first: a degree of latitude is 111 km everywhere.
    if (Math.abs(row[1] - center.lat) * 111_000 > radiusMeters + LIST_REACH_METERS) continue;
    const distance = distanceMeters(center, { lat: row[1], lng: row[2] });
    if (distance < nearest) nearest = distance;
    if (distance <= radiusMeters) inside.push(row);
  }
  if (nearest > radiusMeters + LIST_REACH_METERS) return null;
  return inside.map(toListedStore);
}

/** The slice of a stored store the duplicate check needs. */
export interface KnownStore extends LatLng {
  id: string;
  restaurantNumber: string | null;
}

/**
 * Drop listed stores that are already on file under another id: one holding
 * the same restaurant number, or one within `LISTED_DUPLICATE_METERS`. A
 * listed store whose own id is on file is kept; that is the ordinary update.
 *
 * Existing stores always win, as in `store-twins`, because they may own
 * price history.
 */
export function dropListedDuplicates<T extends ListedStore>(
  incoming: readonly T[],
  known: readonly KnownStore[],
): { kept: T[]; droppedIds: string[] } {
  const knownIds = new Set(known.map((store) => store.id));
  const kept: T[] = [];
  const droppedIds: string[] = [];

  for (const store of incoming) {
    if (knownIds.has(store.osmId)) {
      kept.push(store);
      continue;
    }
    const duplicate = known.some(
      (other) =>
        (store.restaurantNumber !== null && other.restaurantNumber === store.restaurantNumber) ||
        distanceMeters(other, store) < LISTED_DUPLICATE_METERS,
    );
    if (duplicate) droppedIds.push(store.osmId);
    else kept.push(store);
  }
  return { kept, droppedIds };
}
