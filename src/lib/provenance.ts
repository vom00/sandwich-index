/**
 * Where a store's price came from, in words.
 *
 * One place for this so every surface says the same thing. A store page that
 * says "from MenuPriceTracker" while the map marker beside it says "0 prices"
 * would be two contradictory claims about the same number, and the cheaper of
 * the two to make is the wrong one.
 */

import { feedDateVerb, feedName } from "@/lib/feeds";
import { relativeAge } from "@/lib/tiers";
import type { Store } from "@/types";

type Provenanced = Pick<Store, "priceFeed" | "confirmedCount" | "pricedAt">;

/**
 * Visitors' counted prices at a store whose current price came from a feed.
 * "On file" because they are not behind the number beside them: "from
 * MenuPriceTracker · 18 visitor prices" read as if 18 people backed the feed's
 * figure.
 */
export function visitorPrices(count: number): string {
  return count === 1 ? "1 visitor price on file" : `${count} visitor prices on file`;
}

/**
 * The short form, for lists and labels: "from MenuPriceTracker",
 * "from MenuPriceTracker · 2 visitor prices on file", "3 prices", "1 price".
 *
 * Visitor-set prices keep their original wording. "3 prices" has always meant
 * three people's receipts, and changing it everywhere to say so would be noise.
 */
export function provenanceSummary(store: Provenanced): string {
  if (store.priceFeed !== null) {
    const from = `from ${feedName(store.priceFeed)}`;
    return store.confirmedCount > 0 ? `${from} · ${visitorPrices(store.confirmedCount)}` : from;
  }
  return store.confirmedCount === 1 ? "1 price" : `${store.confirmedCount} prices`;
}

/**
 * How old the price is, with the right verb. A feed *observed* a price, or was
 * *checked* on a day when it gives none of its own; a visitor *confirmed* one.
 * The difference is the difference between somebody else's record and somebody
 * standing at the counter.
 */
export function priceAge(store: Provenanced, visitorVerb = "last confirmed"): string {
  const verb = store.priceFeed !== null ? feedDateVerb(store.priceFeed) : visitorVerb;
  return `${verb} ${relativeAge(store.pricedAt)}`;
}
