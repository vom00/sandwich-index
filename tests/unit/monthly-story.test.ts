import { describe, expect, it } from "vitest";

import {
  buildMonthlyStory,
  findMovers,
  latestPrices,
  medianCents,
  monthBounds,
  rankStates,
  storyDateSpan,
  storyMonthName,
  type FeedRow,
  type ListedStore,
} from "@/lib/monthly-story";

const store = (n: number, state: string, address = `${n} Main St`): ListedStore => ({
  id: `atp-${n}`,
  address,
  city: "Town",
  state,
});
const row = (n: number, cents: number, observedAt = "2026-11-01T08:00:00.000Z"): FeedRow => ({
  storeId: `atp-${n}`,
  mcchickenCents: cents,
  observedAt,
});

describe("monthBounds", () => {
  it("runs from the first instant of the month to the first of the next, across a year end", () => {
    expect(monthBounds("2026-11")).toEqual({ start: "2026-11-01T00:00:00.000Z", end: "2026-12-01T00:00:00.000Z" });
    expect(monthBounds("2026-12").end).toBe("2027-01-01T00:00:00.000Z");
  });

  it("refuses anything that is not yyyy-mm", () => {
    expect(() => monthBounds("2026-13")).toThrow();
    expect(() => monthBounds("Nov 2026")).toThrow();
  });
});

describe("medianCents", () => {
  it("takes the middle price, rounding a half to the nearest cent", () => {
    expect(medianCents([300, 100, 200])).toBe(200);
    expect(medianCents([199, 200])).toBe(200);
  });
});

describe("latestPrices", () => {
  const listed = new Map([store(1, "TX"), store(2, "TX")].map((s) => [s.id, s]));

  it("keeps listed stores with a price in range, dated inside the month, newest reading first", () => {
    const prices = latestPrices(
      [
        row(1, 189, "2026-11-01T08:00:00.000Z"),
        row(1, 199, "2026-11-15T08:00:00.000Z"),
        row(2, 189, "2026-10-31T08:00:00.000Z"), // before the month
        row(3, 189), // not on the list
      ],
      listed,
      monthBounds("2026-11"),
    );
    expect([...prices]).toEqual([["atp-1", { cents: 199, at: "2026-11-15T08:00:00.000Z" }]]);
  });

  it("leaves out prices outside the landing map's range, as a misread meal would be", () => {
    expect(latestPrices([row(1, 100), row(2, 601)], listed).size).toBe(0);
    expect(latestPrices([row(1, 101), row(2, 600)], listed).size).toBe(2);
  });
});

describe("rankStates", () => {
  const listed = [
    ...Array.from({ length: 3 }, (_, i) => store(i, "TX")),
    ...Array.from({ length: 3 }, (_, i) => store(10 + i, "NH")),
    ...Array.from({ length: 2 }, (_, i) => store(20 + i, "VT")),
    store(30, "AK"),
  ];
  const byId = new Map(listed.map((s) => [s.id, s]));
  const price = (cents: number) => ({ cents });
  const prices = new Map<string, { cents: number }>([
    ["atp-0", price(169)], ["atp-1", price(169)], ["atp-2", price(179)],
    ["atp-10", price(299)], ["atp-11", price(299)], ["atp-12", price(289)],
    ["atp-20", price(299)], ["atp-21", price(299)],
    ["atp-30", price(399)], // AK has too few stores to rank
  ]);

  it("ranks by median, only states with enough stores, and keeps a tie together", () => {
    const states = rankStates(prices, byId, 2)!;
    expect(states.ranked).toBe(3);
    expect(states.cheapest).toEqual({ medianCents: 169, states: [{ state: "TX", stores: 3 }] });
    expect(states.priciest).toEqual({
      medianCents: 299,
      states: [{ state: "NH", stores: 3 }, { state: "VT", stores: 2 }],
    });
  });

  it("gives no ranking when fewer than two states qualify", () => {
    expect(rankStates(prices, byId, 4)).toBeNull();
  });
});

describe("findMovers", () => {
  const listed = new Map([1, 2, 3, 4, 5].map((n) => [`atp-${n}`, store(n, "TX")]));
  const at = (cents: number, date: string) => ({ cents, at: date });
  const before = new Map([
    ["atp-1", at(219, "2026-10-22T08:00:00.000Z")],
    ["atp-2", at(199, "2026-10-22T08:00:00.000Z")],
    ["atp-3", at(299, "2026-10-30T08:00:00.000Z")],
    ["atp-4", at(250, "2026-10-22T08:00:00.000Z")],
    ["atp-5", at(200, "2026-10-22T08:00:00.000Z")],
  ]);
  const now = new Map([
    ["atp-1", at(299, "2026-11-01T08:00:00.000Z")], // +80, 36.5%
    ["atp-2", at(279, "2026-11-01T08:00:00.000Z")], // +80, 40.2%
    ["atp-3", at(379, "2026-11-01T08:00:00.000Z")], // +80, 26.8%
    ["atp-4", at(240, "2026-11-01T08:00:00.000Z")], // -10
    ["atp-5", at(200, "2026-11-01T08:00:00.000Z")], // unchanged
    ["atp-6", at(200, "2026-11-01T08:00:00.000Z")], // no earlier price
  ]);

  it("counts every store priced in both readings and which way each moved", () => {
    const movers = findMovers(now, before, listed);
    expect(movers).toMatchObject({ compared: 5, up: 3, down: 1, tiedAtTop: 3 });
    expect(movers.previous).toEqual({ from: "2026-10-22T08:00:00.000Z", to: "2026-10-30T08:00:00.000Z" });
  });

  it("orders by cents changed, then share of the old price, then restaurant number", () => {
    const top = findMovers(now, before, listed, 2).top;
    expect(top.map((m) => m.storeId)).toEqual(["atp-2", "atp-1"]);
    expect(top[0]).toMatchObject({ label: "2 Main St, Town, TX", fromCents: 199, toCents: 279 });
  });
});

describe("buildMonthlyStory", () => {
  const listed = [store(1, "TX"), store(2, "TX"), store(3, "NH"), store(4, "NH")];

  it("names every figure it cannot count, with why, and leaves it null", () => {
    const story = buildMonthlyStory({
      month: "2026-12",
      generatedAt: "2026-12-02T00:00:00.000Z",
      listed,
      current: [row(1, 189)], // November: nothing inside December
      previous: null,
      confirmed: null,
    });
    expect(story).toMatchObject({ feed: null, states: null, movers: null, confirmed: null, listedStores: 4 });
    expect(story.missing.map((m) => m.field)).toEqual(["feed", "states", "movers", "confirmed"]);
    expect(story.missing.every((m) => m.reason.length > 0)).toBe(true);
  });

  it("counts what the readings support and nothing else", () => {
    const story = buildMonthlyStory({
      month: "2026-11",
      generatedAt: "2026-11-24T00:00:00.000Z",
      listed,
      current: [row(1, 169), row(2, 179), row(3, 299), row(4, 289)],
      previous: [row(1, 169, "2026-10-22T08:00:00.000Z"), row(3, 279, "2026-10-22T08:00:00.000Z")],
      confirmed: 12,
    });
    expect(story.feed).toEqual({
      id: "drivethruindex",
      from: "2026-11-01T08:00:00.000Z",
      to: "2026-11-01T08:00:00.000Z",
      stores: 4,
    });
    // Two stores a state is below the real threshold of 20, so no ranking.
    expect(story.states).toBeNull();
    expect(story.movers).toMatchObject({ compared: 2, up: 1, down: 0 });
    expect(story.confirmed).toEqual({ count: 12 });
    expect(story.missing.map((m) => m.field)).toEqual(["states"]);
  });
});

describe("wording helpers", () => {
  it("names the month and spans of days", () => {
    expect(storyMonthName("2026-11")).toBe("November 2026");
    expect(storyDateSpan("2026-11-01T08:00:00.000Z", "2026-11-01T09:00:00.000Z")).toBe("Nov 1");
    expect(storyDateSpan("2026-10-22T08:00:00.000Z", "2026-10-31T08:00:00.000Z")).toBe("Oct 22 to 31");
    expect(storyDateSpan("2026-10-22T08:00:00.000Z", "2026-11-01T08:00:00.000Z")).toBe("Oct 22 to Nov 1");
  });
});
