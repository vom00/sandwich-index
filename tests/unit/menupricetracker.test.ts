import { describe, expect, it } from "vitest";

import { matchFeedRow } from "@/lib/feed-match";
import { feedDateVerb, FEEDS, HAS_ACTIVE_FEED, isFeedActive } from "@/lib/feeds";
import {
  cityPathForAddress,
  decodeEntities,
  delaySeconds,
  isAllowed,
  parseCityPage,
  parseRobots,
  parseStorePage,
} from "@/lib/menupricetracker";
import { priceAge, provenanceSummary } from "@/lib/provenance";

/**
 * Trimmed from the real pages read on 2026-10-11, keeping the parts the parser
 * depends on and the near-misses it must ignore.
 */
const CITY_PAGE = `
<div class="menu-row-list" id="stores-list">
  <a href="/mcdonalds/texas/irving/750-w-lbj-fwy" class="menu-row store-row">
    <div class="menu-row-thumb">📍</div>
    <div class="menu-row-body">
      <div class="menu-row-title">750 W Lbj Fwy, Irving, TX 75063</div>
      <div class="menu-row-meta"><span class="store-rating">⭐ 3.6</span> · ZIP 75063</div>
    </div>
    <div class="menu-row-right"><div class="menu-row-price">$5.99</div><div class="menu-row-meta">Big Mac</div></div>
  </a>
  <a href="/mcdonalds/texas/irving/8435-n-beltline-road" class="menu-row store-row">
    <div class="menu-row-body">
      <div class="menu-row-title">8435 N Beltline Road, Irving, TX 75063</div>
    </div>
  </a>
  <a href="/mcdonalds/texas/irving/8435-n-beltline-road" class="menu-row store-row">
    <div class="menu-row-body"><div class="menu-row-title">8435 N Beltline Road, Irving, TX 75063</div></div>
  </a>
  <a href="/mcdonalds/texas/irving/no-address" class="menu-row store-row">
    <div class="menu-row-body"><div class="menu-row-title">Irving</div></div>
  </a>
</div>
<a href="/mcdonalds-menu/mcchicken" class="menu-row">McChicken</a>
`;

function ld(value: unknown): string {
  return `<script type="application/ld+json">${JSON.stringify(value)}</script>`;
}

function storePage(items: string[], extra = ""): string {
  return [
    ld({ "@context": "https://schema.org", "@type": "WebSite", name: "MenuPriceTracker" }),
    ld({
      "@type": "FastFoodRestaurant",
      name: "McDonald's - 8435 N Beltline Road",
      address: {
        "@type": "PostalAddress",
        streetAddress: "8435 N Beltline Road",
        addressLocality: "Irving",
        addressRegion: "TX",
        postalCode: "75063",
      },
    }),
    ld({
      "@type": "ItemList",
      itemListElement: items.map((name, index) => ({ "@type": "ListItem", position: index + 1, name })),
    }),
    `<p>Prices for this store were last verified October 2026.</p>`,
    extra,
    `<p class="footer-brand-desc">Last updated: October 5, 2026</p>`,
  ].join("\n");
}

describe("parseCityPage", () => {
  it("reads every store row's path and address, once each", () => {
    expect(parseCityPage(CITY_PAGE)).toEqual([
      { path: "/mcdonalds/texas/irving/750-w-lbj-fwy", address: "750 W Lbj Fwy", city: "Irving" },
      {
        path: "/mcdonalds/texas/irving/8435-n-beltline-road",
        address: "8435 N Beltline Road",
        city: "Irving",
      },
    ]);
  });

  it("finds nothing on a page with no store rows", () => {
    expect(parseCityPage("<html><body>Not found</body></html>")).toEqual([]);
  });

  it("produces rows the store matcher can join on", () => {
    const ours = [{ id: "node-3", address: "8435 North Belt Line Road, Irving, TX 75063", locality: null }];
    const [, beltline] = parseCityPage(CITY_PAGE);
    expect(beltline).toBeDefined();
    expect(matchFeedRow(beltline!, ours)).toEqual({ kind: "match", storeId: "node-3" });
  });
});

describe("parseStorePage", () => {
  it("takes the address from the structured data and the McChicken from the item list", () => {
    const page = parseStorePage(
      storePage(["Big Mac — $5.89", "McChicken Meal — $6.49", "McChicken — $2.49", "Spicy McChicken — $2.99"]),
    );
    expect(page).toEqual({
      address: "8435 N Beltline Road",
      city: "Irving",
      priceCents: 249,
      verifiedLabel: "last verified October 2026",
    });
  });

  it("matches the item name exactly, so a meal or a variant is never the price", () => {
    const page = parseStorePage(storePage(["McChicken Meal — $6.49", "Spicy McChicken — $2.99"]));
    expect(page?.priceCents).toBeNull();
  });

  it("accepts a whole-dollar price and an en dash", () => {
    expect(parseStorePage(storePage(["McChicken – $2"]))?.priceCents).toBe(200);
  });

  it("is null for a page without a restaurant in its structured data", () => {
    expect(parseStorePage(`<html>${ld({ "@type": "WebSite" })}</html>`)).toBeNull();
  });

  it("survives a malformed JSON-LD block next to good ones", () => {
    const page = parseStorePage(
      storePage(["McChicken — $1.99"], '<script type="application/ld+json">{not json</script>'),
    );
    expect(page?.priceCents).toBe(199);
  });

  it("never takes the site-wide footer date as the store's date", () => {
    const page = parseStorePage(storePage(["McChicken — $1.99"]).replace("last verified October 2026", ""));
    expect(page?.verifiedLabel).toBeNull();
  });
});

describe("cityPathForAddress", () => {
  it("builds the city page from one of our composed addresses", () => {
    expect(cityPathForAddress("813 South MacArthur Boulevard, Coppell, TX 75019")).toBe(
      "/mcdonalds/texas/coppell",
    );
    expect(cityPathForAddress("2109 Long Prairie Road, Flower Mound, TX 75022")).toBe(
      "/mcdonalds/texas/flower-mound",
    );
  });

  it("is null when there is no state to go on", () => {
    expect(cityPathForAddress("Terminal A, Dfw Airport")).toBeNull();
    expect(cityPathForAddress("1 Main St, Springfield, ZZ 00000")).toBeNull();
  });
});

describe("decodeEntities", () => {
  it("turns the entities their pages use back into characters", () => {
    expect(decodeEntities("McDonald&#x27;s &amp; Co")).toBe("McDonald's & Co");
  });
});

describe("robots.txt", () => {
  // Their file as of 2026-10-11, shortened: named crawlers get no delay, the
  // rest of us get ten seconds and a few disallowed prefixes.
  const ROBOTS = `
User-agent: Googlebot
Allow: /
Disallow: /internal
Crawl-delay: 0

# All other bots — slow crawl, block internals
User-agent: *
Crawl-delay: 10
Disallow: /api/
Disallow: /search?
Disallow: /internal/
`;

  it("applies the rules for unnamed bots, not Googlebot's", () => {
    const rules = parseRobots(ROBOTS);
    expect(rules.crawlDelaySeconds).toBe(10);
    expect(rules.disallow).toEqual(["/api/", "/search?", "/internal/"]);
  });

  it("allows store and city pages and refuses the disallowed prefixes", () => {
    const rules = parseRobots(ROBOTS);
    expect(isAllowed("/mcdonalds/texas/irving/8435-n-beltline-road", rules)).toBe(true);
    expect(isAllowed("/api/prices", rules)).toBe(false);
    expect(isAllowed("/search?q=irving", rules)).toBe(false);
  });

  it("never waits less than ten seconds, whatever the file says", () => {
    expect(delaySeconds(parseRobots("User-agent: *\nCrawl-delay: 2"))).toBe(10);
    expect(delaySeconds(parseRobots("User-agent: *\nCrawl-delay: 30"))).toBe(30);
    expect(delaySeconds(parseRobots(""))).toBe(10);
  });

  it("treats consecutive User-agent lines as one group", () => {
    const rules = parseRobots("User-agent: Foo\nUser-agent: *\nDisallow: /private");
    expect(rules.disallow).toEqual(["/private"]);
  });
});

describe("MenuPriceTracker as a feed", () => {
  const feed = FEEDS["menupricetracker"]!;

  it("is in use by the owner's dated decision, with no licence claimed", () => {
    expect(feed.licence).toBeNull();
    expect(feed.unlicensedUse?.decidedOn).toBe("2026-10-11");
    expect(isFeedActive(feed)).toBe(true);
    expect(HAS_ACTIVE_FEED).toBe(true);
  });

  it("dates its prices as checked, because its pages give no day", () => {
    expect(feedDateVerb("menupricetracker")).toBe("checked");
    expect(feedDateVerb("a-feed-since-removed")).toBe("observed");
  });

  it("says checked wherever a store's price came from it", () => {
    const store = { priceFeed: "menupricetracker", confirmedCount: 0, pricedAt: new Date().toISOString() };
    expect(priceAge(store)).toBe("checked today");
    expect(provenanceSummary(store)).toBe("from MenuPriceTracker");
  });

  it("says visitors' prices are on file, not behind the feed's figure", () => {
    const pricedAt = new Date().toISOString();
    expect(provenanceSummary({ priceFeed: "menupricetracker", confirmedCount: 18, pricedAt })).toBe(
      "from MenuPriceTracker · 18 visitor prices on file",
    );
    expect(provenanceSummary({ priceFeed: "menupricetracker", confirmedCount: 1, pricedAt })).toBe(
      "from MenuPriceTracker · 1 visitor price on file",
    );
  });

  it("leaves a visitor's price with the visitor's verb", () => {
    const store = { priceFeed: null, confirmedCount: 2, pricedAt: new Date().toISOString() };
    expect(priceAge(store)).toBe("last confirmed today");
  });
});
