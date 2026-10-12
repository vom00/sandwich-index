import { describe, expect, it } from "vitest";

import {
  matchFeedRow,
  observationId,
  parseFeedFile,
  pinnedOrMatched,
  storeCity,
  streetNumber,
} from "@/lib/feed-match";

const NOW = new Date("2026-10-11T12:00:00.000Z");

/** Our side of the join, as OSM and the reverse geocoder write it. */
const stores = [
  { id: "way-30288130", address: "813 South MacArthur Boulevard, Coppell, TX 75019", locality: null },
  { id: "node-1", address: "501 East Round Grove Road, Lewisville, TX 75067", locality: null },
  { id: "node-2", address: "2301 South Business 121, Lewisville, TX 75067", locality: null },
  { id: "node-3", address: "8435 North Belt Line Road, Irving, TX 75063", locality: null },
  // No street address: the geocoder could only place the town.
  { id: "node-4", address: null, locality: "Euless, TX 76039" },
];

describe("streetNumber", () => {
  it("takes the leading number", () => {
    expect(streetNumber("8435 N Beltline Road")).toBe("8435");
    expect(streetNumber("  101 E Tx-114")).toBe("101");
  });

  it("is null when the address does not start with one", () => {
    expect(streetNumber("Terminal A, DFW Airport")).toBeNull();
  });
});

describe("storeCity", () => {
  it("reads the second-to-last segment of a full address", () => {
    expect(storeCity(stores[0]!)).toBe("Coppell");
  });

  it("falls back to the locality when there is no street", () => {
    expect(storeCity(stores[4]!)).toBe("Euless");
  });
});

describe("matchFeedRow", () => {
  it("matches across abbreviations by number and city", () => {
    expect(matchFeedRow({ address: "813 Macarthur Blvd", city: "Coppell" }, stores)).toEqual({
      kind: "match",
      storeId: "way-30288130",
    });
  });

  it("matches the street-name aliases that broke every name-based key", () => {
    // OSM says "Round Grove Road" where the feed says "FM 3040", and
    // "South Business 121" where it says "S Hwy 121". The numbers agree.
    expect(matchFeedRow({ address: "501 E Fm 3040", city: "Lewisville" }, stores)).toEqual({
      kind: "match",
      storeId: "node-1",
    });
    expect(matchFeedRow({ address: "2301 S Hwy 121", city: "Lewisville" }, stores)).toEqual({
      kind: "match",
      storeId: "node-2",
    });
  });

  it("ignores case and spacing in the city", () => {
    expect(matchFeedRow({ address: "8435 N Beltline Road", city: "  IRVING " }, stores).kind).toBe(
      "match",
    );
  });

  it("refuses to guess between two stores sharing a number in one city", () => {
    const crowded = [
      ...stores,
      { id: "node-5", address: "813 West Sandy Lake Road, Coppell, TX 75019", locality: null },
    ];
    expect(matchFeedRow({ address: "813 Macarthur Blvd", city: "Coppell" }, crowded)).toEqual({
      kind: "ambiguous",
      storeIds: ["way-30288130", "node-5"],
    });
  });

  it("misses rather than matching a store in another city", () => {
    expect(matchFeedRow({ address: "813 Macarthur Blvd", city: "Irving" }, stores).kind).toBe("miss");
  });

  it("never matches a store with no street address", () => {
    // A town is not a street number. Matching on city alone would attach a
    // price to whichever unaddressed store happened to be there.
    expect(matchFeedRow({ address: "100 Main St", city: "Euless" }, stores).kind).toBe("miss");
  });
});

describe("parseFeedFile", () => {
  it("reads the shape of research/tracker-samples.json", () => {
    const { rows, problems } = parseFeedFile(
      {
        verifiedAt: "2026-08-03",
        rows: [
          {
            address: "813 Macarthur Blvd",
            city: "Coppell",
            zip: "75019",
            mcchickenCents: 249,
            url: "https://menupricetracker.com/mcdonalds/texas/coppell/813-macarthur-blvd",
          },
          { address: "501 E Fm 3040", city: "Lewisville", zip: "75028", mcchickenCents: null, url: "https://example.com/x" },
        ],
      },
      NOW,
    );

    expect(problems).toEqual([]);
    expect(rows).toEqual([
      {
        address: "813 Macarthur Blvd",
        city: "Coppell",
        priceCents: 249,
        observedAt: "2026-08-03T00:00:00.000Z",
        sourceUrl: "https://menupricetracker.com/mcdonalds/texas/coppell/813-macarthur-blvd",
        storeId: null,
      },
      {
        address: "501 E Fm 3040",
        city: "Lewisville",
        priceCents: null,
        observedAt: "2026-08-03T00:00:00.000Z",
        sourceUrl: "https://example.com/x",
        storeId: null,
      },
    ]);
  });

  it("prefers a row's own date over the file's", () => {
    const { rows } = parseFeedFile(
      {
        observedAt: "2026-08-03",
        rows: [{ address: "1 A St", city: "Coppell", priceCents: 249, observedAt: "2026-09-01" }],
      },
      NOW,
    );
    expect(rows[0]?.observedAt).toBe("2026-09-01T00:00:00.000Z");
  });

  it("rejects a row with no date anywhere", () => {
    // An undated price cannot be shown honestly or aged out. It is the one
    // thing a feed must never supply.
    const { rows, problems } = parseFeedFile(
      { rows: [{ address: "1 A St", city: "Coppell", priceCents: 249 }] },
      NOW,
    );
    expect(rows).toEqual([]);
    expect(problems[0]).toMatch(/no observation date/);
  });

  it("rejects an observation dated in the future", () => {
    const { rows, problems } = parseFeedFile(
      { rows: [{ address: "1 A St", city: "Coppell", priceCents: 249, observedAt: "2026-11-30" }] },
      NOW,
    );
    expect(rows).toEqual([]);
    expect(problems[0]).toMatch(/in the future/);
  });

  it("allows a day of clock skew", () => {
    const { rows } = parseFeedFile(
      { rows: [{ address: "1 A St", city: "Coppell", priceCents: 249, observedAt: "2026-10-12" }] },
      NOW,
    );
    expect(rows).toHaveLength(1);
  });

  it("rejects prices the app itself would refuse", () => {
    // Same range as a visitor's report. A feed is not exempt from plausibility.
    const { rows, problems } = parseFeedFile(
      {
        observedAt: "2026-08-03",
        rows: [
          { address: "1 A St", city: "Coppell", priceCents: 50 },
          { address: "2 B St", city: "Coppell", priceCents: 249.5 },
          { address: "3 C St", city: "Coppell", priceCents: 9999 },
        ],
      },
      NOW,
    );
    expect(rows).toEqual([]);
    expect(problems).toHaveLength(3);
  });

  it("reports a malformed file instead of throwing", () => {
    const { rows, problems } = parseFeedFile({ stores: [] }, NOW);
    expect(rows).toEqual([]);
    expect(problems[0]).toMatch(/^file:/);
  });
});

describe("pinnedOrMatched", () => {
  const row = { address: "190 Shiloh Rd", city: "Garland" };

  it("sends a pinned row to its store even when the street numbers disagree", () => {
    expect(pinnedOrMatched({ ...row, storeId: "node-3" }, stores)).toEqual({ kind: "match", storeId: "node-3" });
  });

  it("misses when the pinned store isn't on file, rather than guessing by address", () => {
    const sameAddress = { address: "813 S MacArthur Blvd", city: "Coppell", storeId: "way-gone" };
    expect(pinnedOrMatched(sameAddress, stores)).toEqual({ kind: "miss" });
  });

  it("matches an unpinned row by city and street number, as before", () => {
    expect(pinnedOrMatched({ address: "813 S MacArthur Blvd", city: "Coppell", storeId: null }, stores)).toEqual({
      kind: "match",
      storeId: "way-30288130",
    });
  });

  it("keeps a row's pin through parsing", () => {
    const parsed = parseFeedFile(
      { rows: [{ ...row, mcchickenCents: 189, observedAt: "2026-10-11T00:00:00.000Z", storeId: "node-3" }] },
      NOW,
    );
    expect(parsed.rows[0]?.storeId).toBe("node-3");
  });
});

describe("observationId", () => {
  it("is one id per feed, store and day", () => {
    // Re-importing the same file must find its observations already on file.
    expect(observationId("menupricetracker", "way-1", "2026-08-03T00:00:00.000Z")).toBe(
      observationId("menupricetracker", "way-1", "2026-08-03T17:45:00.000Z"),
    );
    expect(observationId("menupricetracker", "way-1", "2026-08-03T00:00:00.000Z")).not.toBe(
      observationId("menupricetracker", "way-1", "2026-09-03T00:00:00.000Z"),
    );
  });
});
