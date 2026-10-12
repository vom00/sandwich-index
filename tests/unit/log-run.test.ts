import { describe, expect, it } from "vitest";

import {
  coverageOf,
  describeRun,
  needFor,
  prioritiseForLogging,
  summarise,
  type RowOutcome,
} from "@/lib/log-run";
import { STALE_AFTER_DAYS, type StoreWithId } from "@/types";

const NOW = new Date("2026-08-10T12:00:00.000Z");

function daysBefore(days: number): string {
  return new Date(NOW.getTime() - days * 24 * 60 * 60 * 1000).toISOString();
}

function store(overrides: Partial<StoreWithId> & { id: string }): StoreWithId {
  return {
    osmId: overrides.id,
    name: "McDonald's",
    // Matchable by default. The unmatchable cases below opt out explicitly, so
    // a test that cares about addresses says so.
    address: "100 Main St",
    locality: null,
    lat: 32.9,
    lng: -97.0,
    geohash: "9vff",
    addressCheckedAt: null,
    reportCount: 0,
    confirmedCount: 0,
    priceCents: null,
    heldPriceCents: null,
    pricedAt: null,
    priceFeed: null,
    lastSyncedAt: NOW.toISOString(),
    ...overrides,
  };
}

const neverLogged = store({ id: "never" });

const current = store({
  id: "current",
  priceCents: 319,
  confirmedCount: 3,
  pricedAt: daysBefore(2),
});

const expired = store({
  id: "expired",
  priceCents: 289,
  confirmedCount: 3,
  pricedAt: daysBefore(STALE_AFTER_DAYS + 1),
});

/** No street address: a town is not a restaurant. */
const noAddress = store({ id: "no-address", address: null, locality: "Euless, TX 76039" });

describe("needFor", () => {
  it("treats a store nobody has priced as never logged", () => {
    expect(needFor(neverLogged, NOW)).toBe("never_logged");
  });

  it("treats a recently confirmed store as up to date", () => {
    expect(needFor(current, NOW)).toBe("current");
  });

  it("treats a price past the staleness window as expired", () => {
    expect(needFor(expired, NOW)).toBe("expired");
  });

  it("does not call a price expired on the boundary day itself", () => {
    const edge = store({
      id: "edge",
      priceCents: 300,
      confirmedCount: 3,
      pricedAt: daysBefore(STALE_AFTER_DAYS - 1),
    });
    expect(needFor(edge, NOW)).toBe("current");
  });
});

describe("prioritiseForLogging", () => {
  it("puts unpriced stores first, then expired, then current", () => {
    const ordered = prioritiseForLogging([current, expired, neverLogged], NOW);
    expect(ordered.map((candidate) => candidate.store.id)).toEqual([
      "never",
      "expired",
      "current",
    ]);
  });

  it("preserves the incoming order within a bucket", () => {
    // Callers hand this the distance-sorted output of getStoresNear, so
    // "unpriced, nearest first" depends on the sort being stable.
    const a = store({ id: "a" });
    const b = store({ id: "b" });
    const c = store({ id: "c" });

    const ordered = prioritiseForLogging([a, b, c, current], NOW);
    expect(ordered.map((candidate) => candidate.store.id)).toEqual([
      "a",
      "b",
      "c",
      "current",
    ]);
  });

  it("returns nothing for no stores rather than throwing", () => {
    expect(prioritiseForLogging([], NOW)).toEqual([]);
  });

  describe("stores with no street address", () => {
    it("marks them unmatchable and everything else matchable", () => {
      const ordered = prioritiseForLogging([neverLogged, noAddress], NOW);
      const byId = new Map(ordered.map((c) => [c.store.id, c.matchable]));

      expect(byId.get("never")).toBe(true);
      expect(byId.get("no-address")).toBe(false);
    });

    it("sinks them below every matchable store, need notwithstanding", () => {
      // The unmatchable store has never been logged and the matchable one is
      // merely current — need alone would put the unmatchable one first.
      const ordered = prioritiseForLogging([noAddress, current], NOW);
      expect(ordered.map((c) => c.store.id)).toEqual(["current", "no-address"]);
    });

    it("still orders unmatchable stores among themselves by need", () => {
      const blankExpired = store({
        id: "blank-expired",
        address: null,
        locality: "Irving, TX",
        priceCents: 300,
        confirmedCount: 3,
        pricedAt: daysBefore(STALE_AFTER_DAYS + 1),
      });

      const ordered = prioritiseForLogging([blankExpired, noAddress], NOW);
      expect(ordered.map((c) => c.store.id)).toEqual(["no-address", "blank-expired"]);
    });

    it("treats a locality as no better than nothing", () => {
      // "Euless, TX 76039" is a town, and a town can hold four restaurants
      // charging four different prices.
      const ordered = prioritiseForLogging([noAddress], NOW);
      expect(ordered[0]?.matchable).toBe(false);
    });
  });
});

describe("coverageOf", () => {
  it("counts each bucket", () => {
    const candidates = prioritiseForLogging(
      [neverLogged, expired, current, store({ id: "never2" })],
      NOW,
    );

    expect(coverageOf(candidates)).toEqual({
      total: 4,
      neverLogged: 2,
      expired: 1,
      current: 1,
      unmatchable: 0,
    });
  });

  it("is all zeros for an empty run", () => {
    expect(coverageOf([])).toEqual({
      total: 0,
      neverLogged: 0,
      expired: 0,
      current: 0,
      unmatchable: 0,
    });
  });

  it("counts unmatchable stores without removing them from their need bucket", () => {
    // The three need counts must keep partitioning the list — the header reads
    // as an account of the whole run only if they still sum to `total`.
    const coverage = coverageOf(
      prioritiseForLogging([neverLogged, noAddress, current], NOW),
    );

    expect(coverage.total).toBe(3);
    expect(coverage.neverLogged + coverage.expired + coverage.current).toBe(3);
    expect(coverage.neverLogged).toBe(2);
    expect(coverage.unmatchable).toBe(1);
  });
});

describe("summarise", () => {
  it("counts saved, held and failed separately", () => {
    const outcomes: RowOutcome[] = [
      { kind: "saved", cents: 319 },
      { kind: "saved", cents: 289 },
      { kind: "held", cents: 999 },
      { kind: "failed", message: "nope" },
      { kind: "idle" },
      { kind: "saving" },
    ];

    expect(summarise(outcomes)).toEqual({ saved: 2, held: 1, failed: 1 });
  });

  it("does not count rows that never ran", () => {
    expect(summarise([{ kind: "idle" }, { kind: "saving" }])).toEqual({
      saved: 0,
      held: 0,
      failed: 0,
    });
  });
});

describe("describeRun", () => {
  it("says so plainly when nothing was entered", () => {
    expect(describeRun({ saved: 0, held: 0, failed: 0 })).toBe(
      "Nothing to save: no prices were entered.",
    );
  });

  it("uses the singular for one price", () => {
    expect(describeRun({ saved: 1, held: 0, failed: 0 })).toBe("1 price logged.");
  });

  it("uses the plural beyond one", () => {
    expect(describeRun({ saved: 4, held: 0, failed: 0 })).toBe("4 prices logged.");
  });

  it("joins two clauses with 'and', not a comma", () => {
    expect(describeRun({ saved: 3, held: 1, failed: 0 })).toBe(
      "3 prices logged and 1 held for a second report.",
    );
  });

  it("joins three clauses with commas and a final 'and'", () => {
    expect(describeRun({ saved: 3, held: 1, failed: 2 })).toBe(
      "3 prices logged, 1 held for a second report and 2 could not be saved.",
    );
  });

  it("omits the buckets that are empty", () => {
    expect(describeRun({ saved: 0, held: 0, failed: 2 })).toBe(
      "2 could not be saved.",
    );
  });
});
