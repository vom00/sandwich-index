import "server-only";

/**
 * OpenStreetMap store lookup via the Overpass API.
 *
 * Overpass is donated infrastructure with a fair-use policy, not a commercial
 * endpoint. Three rules follow from that, and all three are load-bearing:
 *
 *   1. This module is server-only. Querying Overpass from the browser on every
 *      map pan would issue a request per interaction and get the app blocked.
 *   2. Results are cached and callers gate on `lastSyncedAt`. Store locations
 *      change on the order of months.
 *   3. Requests identify themselves in the User-Agent, as the usage policy asks.
 *
 * Nothing here touches a McDonald's server. OSM is a third-party public map
 * database; the brand tag is just how OSM labels the locations.
 */

import { composeLocality, composeStreetAddress } from "@/lib/address";
import { STORE_GEOHASH_PRECISION, encodeGeohash } from "@/lib/geohash";
import { siteUrl } from "@/lib/site";

/**
 * Wikidata entity for McDonald's. Matching the brand tag rather than the name
 * matters: a name regex catches "McDonald Street" and misses locations whose
 * name field has been localised or misspelt by a contributor.
 */
const MCDONALDS_BRAND_WIKIDATA = "Q38076";

/**
 * Mirrors, tried in order. The main instance is the busiest and the first to
 * shed load, so having somewhere else to go keeps a map load from failing on a
 * transient 429 — or, as observed, on a backend dispatcher fault that made it
 * answer 406, 504 and 429 to identical requests within the same minute.
 *
 * Two rules for anything added here, both learned the hard way.
 *
 * **It must resolve.** `overpass.kumi.systems` sat in this list while its DNS
 * returned nothing, so two thirds of the "fallback" was a pair of 25-second
 * timeouts that turned one broken mirror into a 50-second wait and a
 * misleading "every mirror failed".
 *
 * **It must carry planet-wide data.** `overpass.osm.ch` is a Switzerland-only
 * instance: it answers a Texas query with HTTP 200 and an empty element list,
 * which is not an error anywhere in this file and silently became "there are no
 * McDonald's in Dallas". A mirror that is fast and wrong is worse than one that
 * is down. Verifying a candidate means checking the payload, not the status
 * code — a 200 in one second is exactly what no-coverage looks like.
 */
const OVERPASS_ENDPOINTS = [
  "https://overpass-api.de/api/interpreter",
  "https://overpass.private.coffee/api/interpreter",
  // VK's instance. Verified planet-wide by payload (88 elements for a DFW
  // query), not by status code, per the rule above.
  "https://maps.mail.ru/osm/tools/overpass/api/interpreter",
] as const;

/**
 * The server-side budget, not an estimate of how long the query takes.
 *
 * Overpass allocates against `[timeout:N]` up front and aborts the query when
 * the instance is loaded rather than queueing it. At 25 this query failed with
 * a 504 on every mirror; at 180 the identical query returned 87 stores in 8.6
 * seconds. Raising it does not make anything slower — it makes the server
 * willing to start.
 */
const QUERY_TIMEOUT_SECONDS = 180;

/**
 * Our own wall-clock give-up, deliberately far below the server budget above.
 * A successful run is under ten seconds; this is headroom for a loaded mirror,
 * not permission to hang a background sync for three minutes.
 */
const FETCH_TIMEOUT_MS = 45_000;

export interface OverpassStore {
  /** OSM element id prefixed with its type, e.g. `node-1234567890`. */
  osmId: string;
  name: string;
  /**
   * Null whenever OSM lacks a street tag, which is common. `lib/reverse-geocode`
   * fills those in afterwards; this module reports only what the tags say.
   */
  address: string | null;
  /** "Euless, TX 76039" when the tags name a town but no street. */
  locality: string | null;
  lat: number;
  lng: number;
  geohash: string;
}

interface OverpassElement {
  type: "node" | "way" | "relation";
  id: number;
  lat?: number;
  lon?: number;
  center?: { lat: number; lon: number };
  tags?: Record<string, string>;
}

/**
 * `nwr` rather than `node`: a good share of locations are mapped as building
 * polygons or multipolygon relations. `out center` gives those a single
 * representative coordinate.
 */
function buildQuery(lat: number, lng: number, radiusMeters: number): string {
  const radius = Math.round(radiusMeters);
  return [
    `[out:json][timeout:${QUERY_TIMEOUT_SECONDS}];`,
    `nwr["brand:wikidata"="${MCDONALDS_BRAND_WIKIDATA}"](around:${radius},${lat},${lng});`,
    "out center tags;",
  ].join("");
}

function userAgent(): string {
  // The site's own address identifies us; a contact address is added when set.
  const contact = process.env.OVERPASS_CONTACT_EMAIL;
  return `sandwich-index/0.1 (+${siteUrl()}${contact ? `; ${contact}` : ""})`;
}

/**
 * The `addr:*` tags, in the shape `lib/address` composes from.
 *
 * Airport terminals are the classic partial case: a city and a postcode, no
 * street. Those become a locality rather than an address, which is why both
 * fields are read out of the same tags here.
 */
function addressParts(tags: Record<string, string>) {
  return {
    houseNumber: tags["addr:housenumber"],
    street: tags["addr:street"],
    city: tags["addr:city"],
    state: tags["addr:state"],
    postcode: tags["addr:postcode"],
  };
}

function toStore(element: OverpassElement): OverpassStore | null {
  const lat = element.lat ?? element.center?.lat;
  const lng = element.lon ?? element.center?.lon;

  // A way or relation with no resolvable centre is unusable on a map.
  if (lat === undefined || lng === undefined) return null;

  const tags = element.tags ?? {};
  const parts = addressParts(tags);

  return {
    osmId: `${element.type}-${element.id}`,
    name: tags["name"] ?? "McDonald's",
    address: composeStreetAddress(parts),
    locality: composeLocality(parts),
    lat,
    lng,
    geohash: encodeGeohash({ lat, lng }, STORE_GEOHASH_PRECISION),
  };
}

export class OverpassError extends Error {
  constructor(
    message: string,
    readonly attempts: readonly string[],
  ) {
    super(message);
    this.name = "OverpassError";
  }
}

/**
 * Fetch McDonald's locations within `radiusMeters` of a point.
 *
 * Falls through the mirror list on failure. Next's fetch cache holds the
 * response for a day, which absorbs repeated identical lookups; the durable
 * gate is the caller's `lastSyncedAt` check.
 */
export async function fetchNearbyStores(
  lat: number,
  lng: number,
  radiusMeters: number,
): Promise<OverpassStore[]> {
  const query = buildQuery(lat, lng, radiusMeters);
  const failures: string[] = [];
  /** Mirrors that answered cleanly and said the area holds nothing. */
  let emptyAnswers = 0;

  for (const endpoint of OVERPASS_ENDPOINTS) {
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/x-www-form-urlencoded",
          "User-Agent": userAgent(),
        },
        body: new URLSearchParams({ data: query }),
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
        next: { revalidate: 60 * 60 * 24 },
      });

      if (!response.ok) {
        failures.push(`${endpoint} — HTTP ${response.status}`);
        continue;
      }

      const payload = (await response.json()) as { elements?: OverpassElement[] };
      const elements = payload.elements ?? [];

      // An empty answer is not trusted from a single mirror.
      //
      // "No results" and "I do not hold data for this part of the world" are
      // the same HTTP 200 with the same empty array, and the second one is how
      // a regional instance quietly wipes a city off the map. Falling through
      // costs one extra request in the genuinely-empty case — a rural area with
      // no McDonald's — and in exchange no single mirror can assert emptiness
      // on its own. If every mirror agrees, the area really is empty.
      if (elements.length === 0) {
        emptyAnswers += 1;
        failures.push(`${endpoint} — HTTP 200 but no elements`);
        continue;
      }

      return elements
        .map(toStore)
        .filter((store): store is OverpassStore => store !== null);
    } catch (error) {
      failures.push(
        `${endpoint} — ${error instanceof Error ? error.message : "unknown error"}`,
      );
    }
  }

  // Genuinely empty, not unknown: every mirror answered and every one of them
  // said there is nothing here. Rural areas really do have no McDonald's, and
  // that is an answer rather than a failure. One mirror erroring is enough to
  // make this unknown instead, which is why the count has to reach all of them.
  if (emptyAnswers === OVERPASS_ENDPOINTS.length) return [];

  throw new OverpassError("Every Overpass mirror failed", failures);
}
