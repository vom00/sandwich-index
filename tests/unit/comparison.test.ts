import { describe, expect, it } from "vitest";

import {
  AREA_MIN_PEERS,
  computeAreaComparison,
  directionOf,
  DIRECTION_PRESENTATION,
} from "@/lib/comparison";

describe("computeAreaComparison", () => {
  describe("when there is not enough to compare against", () => {
    it("refuses with no peers at all", () => {
      expect(computeAreaComparison(319, [])).toEqual({
        kind: "too_few_peers",
        peerCount: 0,
      });
    });

    it("refuses with one peer, which is a store and not an area", () => {
      expect(computeAreaComparison(319, [299])).toEqual({
        kind: "too_few_peers",
        peerCount: 1,
      });
    });

    it("refuses one short of the threshold", () => {
      const peers = Array.from({ length: AREA_MIN_PEERS - 1 }, () => 300);
      const result = computeAreaComparison(319, peers);
      expect(result.kind).toBe("too_few_peers");
    });

    it("compares at exactly the threshold", () => {
      const peers = Array.from({ length: AREA_MIN_PEERS }, () => 300);
      const result = computeAreaComparison(319, peers);
      expect(result.kind).toBe("compared");
    });
  });

  describe("when the store itself has no price", () => {
    it("still reports what the area charges", () => {
      expect(computeAreaComparison(null, [299, 319, 349])).toEqual({
        kind: "store_unpriced",
        peerCount: 3,
        areaMedianCents: 319,
      });
    });

    it("says nothing when the area is also unknown", () => {
      expect(computeAreaComparison(null, [299]).kind).toBe("too_few_peers");
    });
  });

  describe("direction and magnitude", () => {
    it("reports a cheaper store as a negative delta", () => {
      const result = computeAreaComparison(289, [319, 329, 339]);
      expect(result).toMatchObject({
        kind: "compared",
        areaMedianCents: 329,
        deltaCents: -40,
        peerCount: 3,
      });
      expect(directionOf(-40)).toBe("cheaper");
    });

    it("reports a pricier store as a positive delta", () => {
      const result = computeAreaComparison(379, [319, 329, 339]);
      expect(result).toMatchObject({ deltaCents: 50 });
      expect(directionOf(50)).toBe("pricier");
    });

    it("reports an exact match as level, not as a rounding artefact", () => {
      const result = computeAreaComparison(329, [319, 329, 339]);
      expect(result).toMatchObject({ deltaCents: 0, percentDelta: 0 });
      expect(directionOf(0)).toBe("level");
    });

    it("computes the percentage against the area, not the store", () => {
      // 359 against a 329 baseline is +9.1%, not +8.4%.
      const result = computeAreaComparison(359, [319, 329, 339]);
      expect(result).toMatchObject({ percentDelta: 9.1 });
    });
  });

  describe("integer cents", () => {
    it("keeps an even-length peer median whole", () => {
      // (319 + 330) / 2 = 324.5, which must not survive as a fraction.
      const result = computeAreaComparison(300, [309, 319, 330, 340]);
      expect(result).toMatchObject({ areaMedianCents: 325, deltaCents: -25 });
      if (result.kind !== "compared") throw new Error("expected a comparison");
      expect(Number.isInteger(result.areaMedianCents)).toBe(true);
      expect(Number.isInteger(result.deltaCents)).toBe(true);
    });

    it("is unmoved by a single extreme peer, which is the point of a median", () => {
      const sane = computeAreaComparison(319, [309, 319, 329]);
      const withTroll = computeAreaComparison(319, [309, 319, 329, 1499]);
      // Adding a $14.99 outlier shifts the baseline by 5 cents. A mean would
      // have moved it by nearly three dollars.
      expect(sane).toMatchObject({ areaMedianCents: 319 });
      expect(withTroll).toMatchObject({ areaMedianCents: 324 });
    });
  });
});

describe("DIRECTION_PRESENTATION", () => {
  it("gives every direction a glyph and a word, never colour alone", () => {
    for (const direction of ["cheaper", "pricier", "level"] as const) {
      const presentation = DIRECTION_PRESENTATION[direction];
      expect(presentation.glyph.length).toBeGreaterThan(0);
      expect(presentation.word.length).toBeGreaterThan(0);
      expect(presentation.colorVar).toMatch(/^var\(--color-/);
    }
  });

  it("uses distinct glyphs so the three states survive greyscale", () => {
    const glyphs = new Set(
      Object.values(DIRECTION_PRESENTATION).map((entry) => entry.glyph),
    );
    expect(glyphs.size).toBe(3);
  });
});
