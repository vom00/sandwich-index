/**
 * Geohash helpers for proximity queries.
 *
 * Firestore has no native geo index, and its `in` operator caps at 30 values,
 * so fetching "every store within 15 miles" by document id does not scale past
 * a couple of metro areas. The standard workaround is a geohash prefix range:
 * nearby points share a leading substring, and a string range query on that
 * prefix is something Firestore indexes natively.
 *
 * A prefix range over-selects — the cells are rectangles and the query is a
 * circle — so callers must filter the results by real distance afterwards.
 * `filterByRadius` does that.
 */

import ngeohash from "ngeohash";

export interface LatLng {
  lat: number;
  lng: number;
}

/** Precision used when storing a store's geohash. ~4.8m cells; plenty. */
export const STORE_GEOHASH_PRECISION = 9;

const EARTH_RADIUS_M = 6_371_000;
const METERS_PER_DEGREE_LAT = 111_320;

/**
 * Firestore string ranges need an exclusive upper bound. Geohashes are base32
 * and entirely ASCII, so any character above the ASCII range sorts after every
 * possible hash.
 */
const RANGE_END_SENTINEL = "";

/** Cap on how many range queries one lookup may fan out into. */
const MAX_QUERY_CELLS = 24;

export function encodeGeohash(
  point: LatLng,
  precision: number = STORE_GEOHASH_PRECISION,
): string {
  return ngeohash.encode(point.lat, point.lng, precision);
}

export function milesToMeters(miles: number): number {
  return miles * 1609.344;
}

/**
 * Great-circle distance in metres. Used to trim the over-selected results of a
 * prefix query down to an actual radius.
 */
export function distanceMeters(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;

  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);

  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(lat1) * Math.cos(lat2);

  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Bounding box that fully contains the circle, as [minLat, minLng, maxLat, maxLng]. */
export function boundingBox(
  center: LatLng,
  radiusMeters: number,
): [number, number, number, number] {
  const latDelta = radiusMeters / METERS_PER_DEGREE_LAT;

  // Longitude degrees shrink toward the poles. Clamped so a near-polar centre
  // cannot divide by ~0 and produce an infinite span.
  const cosLat = Math.max(Math.cos((center.lat * Math.PI) / 180), 0.01);
  const lngDelta = radiusMeters / (METERS_PER_DEGREE_LAT * cosLat);

  return [
    Math.max(center.lat - latDelta, -90),
    Math.max(center.lng - lngDelta, -180),
    Math.min(center.lat + latDelta, 90),
    Math.min(center.lng + lngDelta, 180),
  ];
}

/**
 * Prefix ranges covering the circle, as `[startInclusive, endExclusive]` pairs.
 *
 * Precision is chosen by trying the finest option first and coarsening until
 * the cell count is manageable. Finer precision means less over-selection but
 * more queries; this trades a little wasted read for a bounded fan-out.
 */
export function geohashQueryBounds(
  center: LatLng,
  radiusMeters: number,
): Array<[string, string]> {
  const [minLat, minLng, maxLat, maxLng] = boundingBox(center, radiusMeters);

  for (const precision of [6, 5, 4, 3, 2, 1]) {
    const cells = ngeohash.bboxes(minLat, minLng, maxLat, maxLng, precision);
    if (cells.length <= MAX_QUERY_CELLS) {
      return mergeToRanges(cells);
    }
  }

  // Radius large enough that even single-character cells overflow the cap:
  // scan everything and let the distance filter do the work.
  return [["", RANGE_END_SENTINEL]];
}

/**
 * Collapse cells that share a parent into one range where possible, so a block
 * of adjacent hashes costs one query instead of several.
 */
function mergeToRanges(cells: readonly string[]): Array<[string, string]> {
  const sorted = [...cells].sort();
  const ranges: Array<[string, string]> = [];

  for (const cell of sorted) {
    const previous = ranges[ranges.length - 1];

    // If this cell starts with the previous range's prefix it is already
    // covered by that range's scan.
    if (previous !== undefined && cell.startsWith(previous[0])) continue;

    ranges.push([cell, cell + RANGE_END_SENTINEL]);
  }

  return ranges;
}

/** Trim prefix-query results down to the true radius. */
export function filterByRadius<T extends LatLng>(
  items: readonly T[],
  center: LatLng,
  radiusMeters: number,
): T[] {
  return items.filter((item) => distanceMeters(center, item) <= radiusMeters);
}

/** Ascending by distance from `center`. */
export function sortByDistance<T extends LatLng>(items: readonly T[], center: LatLng): T[] {
  return [...items].sort(
    (a, b) => distanceMeters(center, a) - distanceMeters(center, b),
  );
}
