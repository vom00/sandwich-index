import { describe, expect, it } from "vitest";

import {
  nearbyQuerySchema,
  radiusMilesSchema,
  storeIdSchema,
  zipSchema,
} from "@/lib/validation";

/**
 * These schemas parse untrusted query strings, so the cases that matter are the
 * ones where a bad input coerces into a *plausible* value rather than failing.
 * A rejected request is self-correcting; a request that quietly becomes a
 * different, valid request is not.
 */
describe("nearbyQuerySchema — absent coordinates", () => {
  // `Number("")`, `Number(" ")` and `Number("\t\n")` are all 0, so every one of
  // these spellings of "absent" once parsed as latitude 0 / longitude 0 and
  // answered 200 with an empty list from the Gulf of Guinea.
  const blanks = [
    ["null", null],
    ["empty string", ""],
    ["one space", " "],
    ["several spaces", "   "],
    ["tab and newline", "\t\n"],
  ] as const;

  for (const [name, blank] of blanks) {
    it(`refuses ${name} rather than reading it as zero`, () => {
      expect(nearbyQuerySchema.safeParse({ lat: blank, lng: -96.99 }).success).toBe(
        false,
      );
      expect(nearbyQuerySchema.safeParse({ lat: 32.95, lng: blank }).success).toBe(
        false,
      );
    });
  }

  it("still accepts a genuine zero coordinate", () => {
    // Null Island is a real point. The guard must reject absence, not the value.
    const result = nearbyQuerySchema.safeParse({ lat: 0, lng: 0 });
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({ lat: 0, lng: 0 });
  });

  it("accepts a numeric string, which is what a query string always gives", () => {
    const result = nearbyQuerySchema.safeParse({ lat: "32.95", lng: "-96.99" });
    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({ lat: 32.95, lng: -96.99 });
  });
});

describe("nearbyQuerySchema — out of range and unparseable", () => {
  it("refuses a latitude past the pole", () => {
    expect(nearbyQuerySchema.safeParse({ lat: 91, lng: 0 }).success).toBe(false);
    expect(nearbyQuerySchema.safeParse({ lat: -91, lng: 0 }).success).toBe(false);
  });

  it("refuses a longitude past the antimeridian", () => {
    expect(nearbyQuerySchema.safeParse({ lat: 0, lng: 181 }).success).toBe(false);
    expect(nearbyQuerySchema.safeParse({ lat: 0, lng: -181 }).success).toBe(false);
  });

  it("refuses text and infinity", () => {
    expect(nearbyQuerySchema.safeParse({ lat: "abc", lng: 0 }).success).toBe(false);
    expect(nearbyQuerySchema.safeParse({ lat: "Infinity", lng: 0 }).success).toBe(
      false,
    );
  });
});

describe("radiusMilesSchema", () => {
  it("defaults when absent, in every spelling of absent", () => {
    for (const blank of [undefined, null, "", "  "]) {
      expect(radiusMilesSchema.parse(blank)).toBe(15);
    }
  });

  it("refuses a radius that is zero or negative", () => {
    expect(radiusMilesSchema.safeParse(0).success).toBe(false);
    expect(radiusMilesSchema.safeParse(-5).success).toBe(false);
  });

  it("caps at the documented ceiling", () => {
    expect(radiusMilesSchema.safeParse(50).success).toBe(true);
    expect(radiusMilesSchema.safeParse(51).success).toBe(false);
  });
});

describe("storeIdSchema", () => {
  it("accepts the three OSM element kinds", () => {
    expect(storeIdSchema.safeParse("node-123").success).toBe(true);
    expect(storeIdSchema.safeParse("way-544670061").success).toBe(true);
    expect(storeIdSchema.safeParse("relation-9").success).toBe(true);
  });

  it("refuses anything that could walk out of the collection", () => {
    for (const bad of ["node-123/../other", "../stores", "node-", "node-abc", ""]) {
      expect(storeIdSchema.safeParse(bad).success).toBe(false);
    }
  });
});

describe("zipSchema", () => {
  it("accepts a five-digit ZIP, with surrounding space trimmed", () => {
    expect(zipSchema.parse("75019")).toBe("75019");
    expect(zipSchema.parse("  75019 ")).toBe("75019");
  });

  it("refuses ZIP+4 and short codes", () => {
    expect(zipSchema.safeParse("75019-1234").success).toBe(false);
    expect(zipSchema.safeParse("7501").success).toBe(false);
  });
});
