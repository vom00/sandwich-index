/**
 * Reading Drive Thru Index (drivethruindex.com) store pages.
 *
 * Drive Thru Index posts each US McDonald's full menu with its pickup and
 * delivery prices from the McDonald's app, checked daily, and says its
 * figures are free to quote with attribution (see `lib/feeds`). Its store
 * URLs end in the McDonald's restaurant number (`mcdonalds-12751` is
 * Restaurant #12751, 478 S Barre Rd, Barre, VT), which is how a page is tied
 * to one of our stores: exactly, with no address matching.
 *
 * Pure parsing only; `scripts/fetch-drivethruindex.ts` does the reading.
 */

import { decodeEntities } from "@/lib/robots";

export const DTI_ORIGIN = "https://drivethruindex.com";

/** No crawl delay is asked for; this is ours, so a full read stays gentle. */
export const DTI_MIN_DELAY_SECONDS = 2;

/** `/restaurants/us/vt/barre/mcdonalds-12751` → `12751`; null for other brands, countries and language copies. */
export function restaurantNumberFromPath(path: string): string | null {
  const number = /^\/restaurants\/us\/[a-z]{2}\/[a-z0-9-]+\/mcdonalds-(\d{1,6})$/.exec(path)?.[1];
  return number === undefined ? null : String(Number(number));
}

export interface DtiStorePage {
  /** "478 S Barre Rd" */
  address: string;
  /** "Barre" */
  city: string;
  /** The plain McChicken's pickup price, or null when the menu has none. */
  priceCents: number | null;
  /** YYYY-MM-DD: the day the page says its prices were checked. */
  checkedOn: string;
}

/** The menu's own names for the sandwich itself, not a meal, patty or the spicy one. */
const MCCHICKEN = /^mcchicken(?: sandwich)?$/i;

function cents(text: string): number | null {
  const match = /^\$(\d{1,2})\.(\d{2})$/.exec(text.trim());
  return match === null ? null : Number(match[1]) * 100 + Number(match[2]);
}

/**
 * The store, its McChicken pickup price and the day it was checked, or null
 * when the page isn't a store page in the shape this expects. The price is
 * read from the menu table (the structured data stops at 200 items), whose
 * first price column is pickup.
 */
export function parseDtiStorePage(html: string): DtiStorePage | null {
  let address: string | null = null;
  let city: string | null = null;
  for (const match of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
    try {
      const block = JSON.parse(match[1] ?? "") as Record<string, unknown>;
      const postal = block["@type"] === "FastFoodRestaurant" ? (block["address"] as Record<string, unknown> | undefined) : undefined;
      if (typeof postal?.["streetAddress"] === "string" && typeof postal["addressLocality"] === "string") {
        address = postal["streetAddress"];
        city = postal["addressLocality"];
      }
    } catch {
      // Not JSON this module needs.
    }
  }

  const checkedOn = /Pickup prices from the McDonald(?:&#x27;|')s app, checked (\d{4}-\d{2}-\d{2})/.exec(html)?.[1];
  if (address === null || city === null || checkedOn === undefined) return null;
  if (!/<th class=num>Pickup<\/th>\s*<th class=num>Delivery<\/th>/.test(html)) return null;

  // About one menu in fifteen lists "McChicken" twice: the sandwich, and a
  // cheaper line that is the sandwich's share of a bundle ($1.00 against
  // $2.79 at Restaurant #25056, Brooklyn). The sandwich is the dearer one.
  let priceCents: number | null = null;
  const row = /<tr><td>(?:<a [^>]*>)?([^<]+)(?:<\/a>)?<\/td><td class="num">([^<]+)<\/td><td class="num">([^<]+)<\/td><\/tr>/g;
  for (const match of html.matchAll(row)) {
    if (!MCCHICKEN.test(decodeEntities(match[1] ?? "").trim())) continue;
    const pickup = cents(match[2] ?? "");
    if (pickup !== null && (priceCents === null || pickup > priceCents)) priceCents = pickup;
  }
  return { address: decodeEntities(address), city: decodeEntities(city), priceCents, checkedOn };
}
