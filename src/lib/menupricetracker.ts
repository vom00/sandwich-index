/**
 * Reading MenuPriceTracker's public pages, as pure functions.
 *
 * The owner decided on 2026-10-11 to show MenuPriceTracker's per-store
 * McChicken prices while a licensing request is outstanding (see
 * `src/lib/feeds.ts` and research/price-sources.md). This file is the parsing
 * half of `scripts/fetch-menupricetracker.ts`; the network half lives there so
 * nothing here can make a request.
 *
 * Two page types matter:
 *
 * - **City pages** (`/mcdonalds/texas/irving`) list every store in the city as
 *   `.store-row` links with a full address. All rows are in the HTML; the
 *   pagination is client-side. The price beside each row is a Big Mac, so a
 *   city page says *which* stores exist, never what a McChicken costs.
 * - **Store pages** carry schema.org JSON-LD: a `FastFoodRestaurant` with the
 *   address, and an `ItemList` whose entries read "McChicken — $2.49". That
 *   structured data is what gets parsed, because it is the part of the page
 *   least likely to change with a redesign.
 *
 * Neither page states when *this store's* price was observed. The footer's
 * "Last updated" is site-wide, and the store text says only a month ("last
 * verified October 2026"). So an import dates each price by when we read it,
 * and the UI says "checked", not "observed". See `dateVerb` in feeds.ts.
 */

import { parseDollarsToCents } from "@/lib/money";

export const MPT_ORIGIN = "https://menupricetracker.com";

/**
 * The User-Agent for every request. Deliberately carries no contact address:
 * the one in OVERPASS_CONTACT_EMAIL was given for Overpass, not for this site.
 */
export const MPT_USER_AGENT = "sandwich-index/0.1 (+https://github.com/sandwich-index)";

/**
 * The floor between requests, whatever robots.txt says. Their file asks
 * unnamed bots for 10 seconds; if it ever asks for less, we still wait this.
 */
export const MIN_DELAY_SECONDS = 10;

const STATE_NAMES: Readonly<Record<string, string>> = {
  AL: "alabama", AK: "alaska", AZ: "arizona", AR: "arkansas", CA: "california",
  CO: "colorado", CT: "connecticut", DE: "delaware", DC: "district-of-columbia",
  FL: "florida", GA: "georgia", HI: "hawaii", ID: "idaho", IL: "illinois",
  IN: "indiana", IA: "iowa", KS: "kansas", KY: "kentucky", LA: "louisiana",
  ME: "maine", MD: "maryland", MA: "massachusetts", MI: "michigan",
  MN: "minnesota", MS: "mississippi", MO: "missouri", MT: "montana",
  NE: "nebraska", NV: "nevada", NH: "new-hampshire", NJ: "new-jersey",
  NM: "new-mexico", NY: "new-york", NC: "north-carolina", ND: "north-dakota",
  OH: "ohio", OK: "oklahoma", OR: "oregon", PA: "pennsylvania",
  RI: "rhode-island", SC: "south-carolina", SD: "south-dakota",
  TN: "tennessee", TX: "texas", UT: "utah", VT: "vermont", VA: "virginia",
  WA: "washington", WV: "west-virginia", WI: "wisconsin", WY: "wyoming",
};

function slug(value: string): string {
  return value
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * The city page for one of our stores, from its composed address:
 * "813 South MacArthur Boulevard, Coppell, TX 75019" → "/mcdonalds/texas/coppell".
 * Null when the address doesn't end in a recognisable "City, ST 12345".
 */
export function cityPathForAddress(address: string): string | null {
  const parts = address.split(",").map((part) => part.trim());
  if (parts.length < 3) return null;
  const city = parts[parts.length - 2];
  const stateZip = parts[parts.length - 1];
  const state = /^([A-Z]{2})\b/.exec(stateZip ?? "")?.[1];
  const stateName = state === undefined ? undefined : STATE_NAMES[state];
  if (city === undefined || city === "" || stateName === undefined) return null;
  return `/mcdonalds/${stateName}/${slug(city)}`;
}

const ENTITIES: Readonly<Record<string, string>> = {
  "&amp;": "&",
  "&quot;": '"',
  "&#x27;": "'",
  "&#39;": "'",
  "&apos;": "'",
  "&lt;": "<",
  "&gt;": ">",
  "&nbsp;": " ",
};

export function decodeEntities(value: string): string {
  return value.replace(/&(?:amp|quot|#x27|#39|apos|lt|gt|nbsp);/g, (entity) => ENTITIES[entity] ?? entity);
}

export interface CityPageStore {
  /** Site-relative, e.g. "/mcdonalds/texas/irving/8435-n-beltline-road". */
  path: string;
  /** "8435 N Beltline Road" */
  address: string;
  /** "Irving" */
  city: string;
}

/** Every store row on a city page. Rows without a usable address are dropped. */
export function parseCityPage(html: string): CityPageStore[] {
  const rowPattern =
    /<a href="(\/mcdonalds\/[^"#?]+)" class="menu-row store-row">[\s\S]*?<div class="menu-row-title">([^<]+)<\/div>/g;
  const seen = new Set<string>();
  const stores: CityPageStore[] = [];

  for (const match of html.matchAll(rowPattern)) {
    const path = match[1];
    const title = match[2];
    if (path === undefined || title === undefined || seen.has(path)) continue;
    // "1717 W Mockingbird Ln, Dallas, TX 75038"
    const parts = decodeEntities(title).split(",").map((part) => part.trim());
    const address = parts[0];
    const city = parts[1];
    if (parts.length < 3 || address === undefined || address === "" || city === undefined || city === "") {
      continue;
    }
    seen.add(path);
    stores.push({ path, address, city });
  }
  return stores;
}

export interface StorePage {
  address: string;
  city: string;
  /** Null when the page lists no McChicken; the site shows no number it hasn't verified. */
  priceCents: number | null;
  /** The page's own freshness claim, verbatim, e.g. "last verified October 2026". */
  verifiedLabel: string | null;
}

function jsonLdBlocks(html: string): unknown[] {
  const blocks: unknown[] = [];
  for (const match of html.matchAll(
    /<script[^>]*type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/g,
  )) {
    try {
      blocks.push(JSON.parse(match[1] ?? ""));
    } catch {
      // One malformed block shouldn't hide the others.
    }
  }
  return blocks;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function ofType(blocks: readonly unknown[], type: string): Record<string, unknown> | null {
  for (const block of blocks) {
    if (isRecord(block) && block["@type"] === type) return block;
  }
  return null;
}

/**
 * "McChicken — $2.49" and nothing else. "McChicken Meal" and "Spicy McChicken"
 * are different items, so the name has to match exactly.
 */
const MCCHICKEN_ENTRY = /^McChicken\s+[—–-]\s+(\$\d{1,3}(?:\.\d{1,2})?)$/;

/** The store and its McChicken price, or null if the page isn't a store page. */
export function parseStorePage(html: string): StorePage | null {
  const blocks = jsonLdBlocks(html);

  const restaurant = ofType(blocks, "FastFoodRestaurant");
  const postal = isRecord(restaurant?.["address"]) ? restaurant["address"] : null;
  const street = postal?.["streetAddress"];
  const locality = postal?.["addressLocality"];
  if (typeof street !== "string" || typeof locality !== "string") return null;

  let priceCents: number | null = null;
  const list = ofType(blocks, "ItemList");
  const entries = Array.isArray(list?.["itemListElement"]) ? list["itemListElement"] : [];
  for (const entry of entries) {
    const name = isRecord(entry) ? entry["name"] : undefined;
    if (typeof name !== "string") continue;
    const price = MCCHICKEN_ENTRY.exec(decodeEntities(name).trim())?.[1];
    if (price !== undefined) {
      priceCents = parseDollarsToCents(price);
      break;
    }
  }

  const text = html.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<[^>]+>/g, " ");
  const verified = /last verified [A-Z][a-z]+ \d{4}/.exec(text)?.[0] ?? null;

  return {
    address: decodeEntities(street).trim(),
    city: decodeEntities(locality).trim(),
    priceCents,
    verifiedLabel: verified,
  };
}

export interface RobotsRules {
  disallow: string[];
  crawlDelaySeconds: number | null;
}

/**
 * The rules robots.txt sets for bots it doesn't name (`User-agent: *`). We are
 * not a search engine, so the named groups don't apply to us.
 */
export function parseRobots(text: string): RobotsRules {
  const rules: RobotsRules = { disallow: [], crawlDelaySeconds: null };
  let inStarGroup = false;
  let lastWasAgent = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*$/, "").trim();
    if (line === "") continue;
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    const field = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();

    if (field === "user-agent") {
      // Consecutive User-agent lines share one group.
      inStarGroup = lastWasAgent ? inStarGroup || value === "*" : value === "*";
      lastWasAgent = true;
      continue;
    }
    lastWasAgent = false;
    if (!inStarGroup) continue;

    if (field === "disallow" && value !== "") rules.disallow.push(value);
    if (field === "crawl-delay") {
      const seconds = Number.parseFloat(value);
      if (Number.isFinite(seconds) && seconds >= 0) rules.crawlDelaySeconds = seconds;
    }
  }
  return rules;
}

export function isAllowed(path: string, rules: RobotsRules): boolean {
  return !rules.disallow.some((prefix) => path.startsWith(prefix));
}

export function delaySeconds(rules: RobotsRules): number {
  return Math.max(MIN_DELAY_SECONDS, rules.crawlDelaySeconds ?? 0);
}
