import "server-only";

/**
 * Filling in the addresses OpenStreetMap's own tags leave blank.
 *
 * Roughly one store in nine comes back from Overpass with no `addr:*` tags at
 * all, even where the surrounding data knows perfectly well what street the
 * building is on. Those stores used to render as "no address on file", which is
 * accurate about our record and useless to somebody trying to decide which
 * McDonald's to walk to.
 *
 * Photon — Komoot's OpenStreetMap-backed geocoder, already the fallback behind
 * the ZIP lookup — answers the reverse question from the same OSM corpus, so
 * the address stays OSM-derived and the ODbL attribution in the footer still
 * covers it. In practice it resolves the very same OSM element the store record
 * came from, which is why the identity check below usually passes.
 *
 * Three rules, all of them the same fair-use obligation Overpass carries:
 *
 *   1. Server-only. A lookup per store per browser would be indefensible.
 *   2. Called from the sync path, never from a render, and capped per call by
 *      `backfillMissingAddresses`.
 *   3. Requests identify themselves in the User-Agent, and results are cached
 *      for a month — a building does not move.
 */

import { composeLocality, composeStreetAddress } from "@/lib/address";
import { distanceMeters } from "@/lib/geohash";
import { siteUrl } from "@/lib/site";

const FETCH_TIMEOUT_MS = 8_000;
const CACHE_SECONDS = 60 * 60 * 24 * 30;

/**
 * How far the geocoder's answer may sit from the store before it is discarded.
 *
 * Reverse geocoding returns the nearest addressable feature, and "nearest"
 * across a car park or a freeway is a different building with a different
 * street. 150m is generous enough for a store mapped as a node in the middle of
 * a large lot and tight enough to exclude the neighbours.
 */
const MAX_MATCH_DISTANCE_M = 150;

export interface ResolvedAddress {
  /** Street-level, or null when even the geocoder has no street here. */
  address: string | null;
  /** "Euless, TX 76039", or null. Populated even when `address` is not. */
  locality: string | null;
}

interface PhotonProperties {
  osm_type?: string;
  osm_id?: number;
  housenumber?: string;
  street?: string;
  name?: string;
  city?: string;
  district?: string;
  state?: string;
  postcode?: string;
  countrycode?: string;
}

interface PhotonFeature {
  geometry?: { coordinates?: [number, number] };
  properties?: PhotonProperties;
}

function userAgent(): string {
  // The site's own address identifies us; a contact address is added when set.
  const contact = process.env.OVERPASS_CONTACT_EMAIL;
  return `sandwich-index/0.1 (+${siteUrl()}${contact ? `; ${contact}` : ""})`;
}

/**
 * The address at a point, as far as OpenStreetMap knows it.
 *
 * Returns null when the geocoder cannot be reached or has nothing usable there
 * — distinct from `{ address: null, locality: "…" }`, which is a real answer
 * that happens to lack a street. Callers treat the two differently: only the
 * second is worth recording.
 */
export async function reverseGeocode(
  lat: number,
  lng: number,
): Promise<ResolvedAddress | null> {
  const url = new URL("https://photon.komoot.io/reverse");
  url.searchParams.set("lat", String(lat));
  url.searchParams.set("lon", String(lng));
  url.searchParams.set("limit", "1");

  const response = await fetch(url, {
    headers: { "User-Agent": userAgent() },
    signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    next: { revalidate: CACHE_SECONDS },
  });

  if (!response.ok) return null;

  const body = (await response.json()) as { features?: PhotonFeature[] };
  const feature = body.features?.[0];
  const properties = feature?.properties;
  if (properties === undefined) return null;

  // Photon will happily answer with whatever it can find, so the answer only
  // counts if it is actually *here*. Same discipline as the ZIP lookup, which
  // returns a residential street in Minnesota when asked for a bogus postcode.
  const coordinates = feature?.geometry?.coordinates;
  if (coordinates !== undefined) {
    const [featureLng, featureLat] = coordinates;
    if (distanceMeters({ lat, lng }, { lat: featureLat, lng: featureLng }) > MAX_MATCH_DISTANCE_M) {
      return null;
    }
  }

  const parts = {
    houseNumber: properties.housenumber,
    street: properties.street,
    city: properties.city ?? properties.district,
    state: properties.state,
    postcode: properties.postcode,
  };

  const address = composeStreetAddress(parts);
  const locality = composeLocality(parts);

  return address === null && locality === null ? null : { address, locality };
}
