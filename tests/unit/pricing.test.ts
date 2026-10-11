import { describe, expect, it } from "vitest";

import {
  BIG_MOVE_PERCENT,
  canSetPrice,
  computeStoreRollup,
  corroborates,
  isBigMove,
  isStale,
  reconcile,
  statusForSubmission,
  type PriceCandidate,
} from "@/lib/pricing";
import { STALE_AFTER_DAYS } from "@/types";

const T0 = "2026-01-01T00:00:00.000Z";

/** Reports are replayed in submitted order, so time is the important axis. */
function at(minute: number): string {
  return new Date(Date.parse(T0) + minute * 60_000).toISOString();
}

function report(
  priceCents: number,
  minute: number,
  overrides: Partial<PriceCandidate> = {},
): PriceCandidate {
  return {
    priceCents,
    source: "in_store",
    status: "accepted",
    submittedAt: at(minute),
    ...overrides,
  };
}

describe("canSetPrice", () => {
  it("accepts an ordinary accepted report", () => {
    expect(canSetPrice({ source: "in_store", status: "accepted" })).toBe(true);
  });

  it("refuses a held report", () => {
    expect(canSetPrice({ source: "in_store", status: "pending" })).toBe(false);
  });

  it("refuses a rejected report", () => {
    expect(canSetPrice({ source: "in_store", status: "rejected" })).toBe(false);
  });

  it("refuses delivery however accepted it is", () => {
    // Delivery carries the platform's markup, so it describes a different
    // transaction than the one being indexed.
    expect(canSetPrice({ source: "delivery", status: "accepted" })).toBe(false);
  });
});

describe("isBigMove", () => {
  it("is never a big move when there is no price to move", () => {
    expect(isBigMove(1500, null)).toBe(false);
  });

  it("allows a move just under the threshold", () => {
    // 40% of 300 is 120; 419 is 119 away.
    expect(isBigMove(419, 300)).toBe(false);
  });

  it("allows a move landing exactly on the threshold", () => {
    // Strictly greater-than, so exactly 40% is still allowed. This is the
    // boundary the rule and the client must agree on.
    expect(isBigMove(420, 300)).toBe(false);
  });

  it("catches a move one cent past the threshold", () => {
    expect(isBigMove(421, 300)).toBe(true);
  });

  it("is symmetric — a crash counts as much as a spike", () => {
    expect(isBigMove(179, 300)).toBe(true);
    expect(isBigMove(181, 300)).toBe(false);
  });

  it("agrees with the rule where the threshold is not a whole cent", () => {
    // Every case above sits on a base of 300, where 40% is exactly 120 — an
    // integer threshold that a float implementation would get right by luck.
    // 40% of 319 is 127.6, so this is the case that actually distinguishes
    // `delta * 100 > current * 40` from `delta > 0.4 * current`. The same two
    // values are asserted against firestore.rules in tests/rules, which is what
    // makes the two implementations checkable against each other rather than
    // merely both tested.
    expect(isBigMove(319 + 127, 319)).toBe(false);
    expect(isBigMove(319 + 128, 319)).toBe(true);
    expect(isBigMove(319 - 127, 319)).toBe(false);
    expect(isBigMove(319 - 128, 319)).toBe(true);
  });

  it("uses the documented percentage", () => {
    expect(BIG_MOVE_PERCENT).toBe(40);
  });
});

describe("corroborates", () => {
  it("accepts two readings of the same menu board", () => {
    expect(corroborates(319, 319)).toBe(true);
    expect(corroborates(329, 319)).toBe(true);
  });

  it("refuses two reports that merely fail to contradict each other", () => {
    // 30% apart passes the move gate but agrees about nothing.
    expect(corroborates(415, 319)).toBe(false);
  });
});

describe("statusForSubmission", () => {
  it("accepts the first report about a store", () => {
    expect(statusForSubmission(319, null)).toBe("accepted");
  });

  it("accepts a report near the current price", () => {
    expect(statusForSubmission(329, 319)).toBe("accepted");
  });

  it("holds a report that would move the price too far", () => {
    expect(statusForSubmission(899, 319)).toBe("pending");
  });
});

describe("reconcile — the set price", () => {
  it("has no price for a store nobody has reported", () => {
    expect(computeStoreRollup([])).toEqual({
      reportCount: 0,
      confirmedCount: 0,
      priceCents: null,
      pricedAt: null,
      heldPriceCents: null,
    });
  });

  it("takes the first report on trust", () => {
    const rollup = computeStoreRollup([report(319, 0)]);
    expect(rollup.priceCents).toBe(319);
    expect(rollup.confirmedCount).toBe(1);
  });

  it("replaces rather than averages", () => {
    // The whole point. A median would have said 324 — a number neither
    // contributor saw and no visit could confirm.
    const rollup = computeStoreRollup([report(319, 0), report(329, 1)]);
    expect(rollup.priceCents).toBe(329);
  });

  it("takes the newest report regardless of the order it is handed", () => {
    const rollup = computeStoreRollup([report(329, 5), report(319, 1)]);
    expect(rollup.priceCents).toBe(329);
    expect(rollup.pricedAt).toBe(at(5));
  });

  it("ignores delivery reports entirely", () => {
    const rollup = computeStoreRollup([
      report(319, 0),
      report(899, 1, { source: "delivery" }),
    ]);
    expect(rollup.priceCents).toBe(319);
    // Counted as a report, just never as the price.
    expect(rollup.reportCount).toBe(2);
    expect(rollup.confirmedCount).toBe(1);
  });

  it("counts every report, priced or not", () => {
    const rollup = computeStoreRollup([
      report(319, 0),
      report(325, 1),
      report(899, 2, { source: "delivery" }),
    ]);
    expect(rollup.reportCount).toBe(3);
  });

  it("is idempotent — the reason the recompute is safe to retry", () => {
    const reports = [report(319, 0), report(329, 1), report(899, 2)];
    expect(computeStoreRollup(reports)).toEqual(computeStoreRollup(reports));
  });
});

describe("reconcile — holding and corroboration", () => {
  it("holds a lone report that moves the price too far", () => {
    const { rollup } = reconcile([report(319, 0), report(899, 1)]);

    expect(rollup.priceCents).toBe(319);
    expect(rollup.heldPriceCents).toBe(899);
  });

  it("marks the held report pending rather than accepted", () => {
    const { changed } = reconcile([report(319, 0), report(899, 1)]);
    expect(changed).toEqual([{ index: 1, status: "pending" }]);
  });

  it("promotes a held report once a second one agrees with it", () => {
    const { rollup, changed } = reconcile([
      report(319, 0),
      report(899, 1, { status: "pending" }),
      report(905, 2, { status: "pending" }),
    ]);

    expect(rollup.priceCents).toBe(905);
    expect(rollup.heldPriceCents).toBeNull();
    // Both the held report and the corroborating one become accepted.
    expect(changed).toEqual([
      { index: 1, status: "accepted" },
      { index: 2, status: "accepted" },
    ]);
  });

  it("does not promote on a second report that disagrees with the first", () => {
    const { rollup } = reconcile([
      report(319, 0),
      report(899, 1, { status: "pending" }),
      report(1400, 2, { status: "pending" }),
    ]);

    expect(rollup.priceCents).toBe(319);
    // The newest outstanding claim is what is surfaced as held.
    expect(rollup.heldPriceCents).toBe(1400);
  });

  it("rescues a store whose very first report was wrong", () => {
    // The failure mode the median model handled and a naive latest-wins model
    // does not: one typo becomes the price and every correction looks like an
    // outlier against it. Two corrections that agree must be able to win.
    const { rollup } = reconcile([
      report(150, 0), // typo, taken on trust
      report(319, 1, { status: "pending" }),
      report(319, 2, { status: "pending" }),
    ]);

    expect(rollup.priceCents).toBe(319);
    expect(rollup.heldPriceCents).toBeNull();
  });

  it("clears a stale held claim when the price moves for other reasons", () => {
    const { rollup } = reconcile([
      report(319, 0),
      report(899, 1, { status: "pending" }), // held
      report(340, 2), // ordinary move, accepted
    ]);

    expect(rollup.priceCents).toBe(340);
    expect(rollup.heldPriceCents).toBeNull();
  });

  it("reports no disagreement when the stored statuses already match", () => {
    // The ordinary case: nothing to write back, so the recompute batch carries
    // only the store document.
    const { changed } = reconcile([report(319, 0), report(329, 1)]);
    expect(changed).toEqual([]);
  });
});

describe("isStale", () => {
  const now = new Date("2026-06-01T00:00:00.000Z");

  it("is false for a store with no price — unpriced is not stale", () => {
    expect(isStale(null, now)).toBe(false);
  });

  it("is false for a price inside the window", () => {
    const recent = new Date(now.getTime() - 5 * 24 * 60 * 60 * 1000).toISOString();
    expect(isStale(recent, now)).toBe(false);
  });

  it("is true for a price past the window", () => {
    const old = new Date(
      now.getTime() - (STALE_AFTER_DAYS + 1) * 24 * 60 * 60 * 1000,
    ).toISOString();
    expect(isStale(old, now)).toBe(true);
  });

  it("is false exactly on the boundary", () => {
    const edge = new Date(
      now.getTime() - STALE_AFTER_DAYS * 24 * 60 * 60 * 1000,
    ).toISOString();
    expect(isStale(edge, now)).toBe(false);
  });
});
