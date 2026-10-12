import ngeohash from "ngeohash";
import { describe, expect, it } from "vitest";

import { cellCoverage, distanceMeters, encodeGeohash, milesToMeters } from "@/lib/geohash";

/** Deterministic, so a failure reproduces. Same generator the seed uses. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

describe("cellCoverage", () => {
  // Longitude degrees shrink toward the poles, so the corners of a cell are not
  // equidistant from its centre. Anchorage and Ushuaia are where getting that
  // wrong would show.
  const places = {
    Coppell: { lat: 32.9546, lng: -96.99 },
    Anchorage: { lat: 61.2181, lng: -149.9003 },
    Quito: { lat: -0.1807, lng: -78.4678 },
    Ushuaia: { lat: -54.8019, lng: -68.303 },
  };

  for (const [name, place] of Object.entries(places)) {
    it(`gives every point in the ${name} cell its whole search circle`, () => {
      const cell = encodeGeohash(place, 4);
      const [minLat, minLng, maxLat, maxLng] = ngeohash.decode_bbox(cell);
      const radius = milesToMeters(15);
      const coverage = cellCoverage(cell, radius);
      const random = mulberry32(cell.charCodeAt(0) * 31 + cell.charCodeAt(3));

      // The corners are the worst case; random interior points check nothing
      // stranger is going on between them.
      const points = [
        { lat: minLat, lng: minLng },
        { lat: minLat, lng: maxLng },
        { lat: maxLat, lng: minLng },
        { lat: maxLat, lng: maxLng },
        ...Array.from({ length: 500 }, () => ({
          lat: minLat + random() * (maxLat - minLat),
          lng: minLng + random() * (maxLng - minLng),
        })),
      ];

      for (const point of points) {
        // Triangle inequality: a circle of `radius` around the point fits
        // inside the coverage circle iff this holds.
        expect(distanceMeters(point, coverage.center) + radius).toBeLessThanOrEqual(
          coverage.radiusMeters + 1e-6,
        );
      }
    });
  }

  it("adds no more than the cell's own half-diagonal", () => {
    // Coverage must be sufficient, but not wildly larger than necessary —
    // every extra kilometre is extra load on Overpass.
    const cell = encodeGeohash(places.Coppell, 4);
    const radius = milesToMeters(15);
    const { radiusMeters } = cellCoverage(cell, radius);

    // A precision-4 cell at DFW is ~19.5 x 32.8 km, so the half-diagonal is ~19 km.
    expect(radiusMeters - radius).toBeGreaterThan(18_000);
    expect(radiusMeters - radius).toBeLessThan(20_000);
  });

  it("is a pure function of the cell and the radius", () => {
    // The sync gate compares a stored coverage against a freshly computed
    // one. If the same inputs could give different answers, a fresh area
    // could look under-covered and re-sync for no reason.
    const cell = encodeGeohash(places.Coppell, 4);
    expect(cellCoverage(cell, 24_140)).toEqual(cellCoverage(cell, 24_140));
  });
});
