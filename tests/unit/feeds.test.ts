import { describe, expect, it } from "vitest";

import { ACTIVE_FEEDS, FEEDS, HAS_ACTIVE_FEED, feedAttribution, feedDateVerb, isFeedActive } from "@/lib/feeds";
import { priceAge, provenanceSummary } from "@/lib/provenance";

describe("Drive Thru Index as a feed", () => {
  const feed = FEEDS["drivethruindex"]!;

  it("is in use, under the permission its own site gives", () => {
    expect(feed.licence).not.toBeNull();
    expect(isFeedActive(feed)).toBe(true);
    expect(HAS_ACTIVE_FEED).toBe(true);
  });

  it("carries the credit line it asks for, with the day the price was checked", () => {
    expect(feedAttribution("drivethruindex", "2026-10-21T08:00:00.000Z")).toBe(
      "Source: Drive Thru Index (drivethruindex.com), prices checked 2026-10-21",
    );
    expect(feedAttribution("a-feed-since-removed", "2026-10-21T08:00:00.000Z")).toBeNull();
  });

  it("says checked wherever a store's price came from it", () => {
    const store = { priceFeed: "drivethruindex", confirmedCount: 0, pricedAt: new Date().toISOString() };
    expect(feedDateVerb("drivethruindex")).toBe("checked");
    expect(priceAge(store)).toBe("checked today");
    expect(provenanceSummary(store)).toBe("from Drive Thru Index");
  });

  it("says visitors' prices are on file, not behind the feed's figure", () => {
    const pricedAt = new Date().toISOString();
    expect(provenanceSummary({ priceFeed: "drivethruindex", confirmedCount: 18, pricedAt })).toBe(
      "from Drive Thru Index · 18 visitor prices on file",
    );
    expect(provenanceSummary({ priceFeed: "drivethruindex", confirmedCount: 1, pricedAt })).toBe(
      "from Drive Thru Index · 1 visitor price on file",
    );
  });

  it("leaves a visitor's price with the visitor's verb", () => {
    const store = { priceFeed: null, confirmedCount: 2, pricedAt: new Date().toISOString() };
    expect(priceAge(store)).toBe("last confirmed today");
    expect(feedDateVerb("a-feed-since-removed")).toBe("observed");
  });
});

describe("MenuPriceTracker", () => {
  it("is removed: declared, so its id is never reused, but not shown", () => {
    const feed = FEEDS["menupricetracker"]!;
    expect(isFeedActive(feed)).toBe(false);
    expect(ACTIVE_FEEDS.map((active) => active.id)).toEqual(["drivethruindex"]);
  });
});
