import { feedAttribution, feedDateVerb } from "@/lib/feeds";
import { loadPriceMap, priceTier, type PriceTier } from "@/lib/landing-map";
import { formatCents } from "@/lib/money";
import { isStale } from "@/lib/pricing";
import { storeLabel } from "@/lib/store-label";
import type { StoreWithId } from "@/types";

/**
 * What a store's till receipt says: the store, its price, where that price
 * sits on the national scale, the day it was checked and where it came from.
 *
 * One builder for every picture of the receipt, so the link-preview card
 * (`app/store/[id]/opengraph-image`) and the animated GIF a visitor saves
 * (`components/store/ShareGifButton`) cannot say different things.
 * Plain data, safe to hand to the browser.
 */
export interface StoreCard {
  /** Upper-cased, as the receipt prints it. */
  store: string;
  qualifier: string | null;
  priced: boolean;
  /** "$4.29", or null with no price. */
  price: string | null;
  tier: Exclude<PriceTier, "none"> | null;
  tierLabel: string | null;
  /** "CHECKED", "REPORTED", or "DATE" with no price. */
  dateLabel: string;
  /** "NOV 24, 2026" with " (OLD)" when stale, or null with no price. */
  date: string | null;
  source: string;
}

/** The landing page's national scale: p10 and below, p90 and above, between. */
export const TIER_LABEL: Record<Exclude<PriceTier, "none">, string> = {
  low: "Cheapest tenth in the US",
  mid: "Middle 80% in the US",
  high: "Dearest tenth in the US",
};

export const RECEIPT_DATE = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

export async function storeCard(store: StoreWithId): Promise<StoreCard> {
  const label = storeLabel(store);
  const priced = store.priceCents !== null && store.pricedAt !== null;
  const tier = priced ? priceTier(store.priceCents ?? 0, (await loadPriceMap()).priceCents) : "none";
  const dateVerb = store.priceFeed !== null ? feedDateVerb(store.priceFeed) : "reported";
  const source = !priced
    ? "Nobody has reported a price for this store yet."
    : store.priceFeed !== null
      ? (feedAttribution(store.priceFeed, store.pricedAt ?? "") ?? "")
      : `From ${store.confirmedCount} confirmed ${store.confirmedCount === 1 ? "report" : "reports"} by visitors.`;
  return {
    store: label.text.toUpperCase(),
    qualifier: label.qualifier === null ? null : label.qualifier.toUpperCase(),
    priced,
    price: priced ? formatCents(store.priceCents ?? 0) : null,
    tier: tier === "none" ? null : tier,
    tierLabel: tier === "none" ? null : TIER_LABEL[tier].toUpperCase(),
    dateLabel: priced ? dateVerb.toUpperCase() : "DATE",
    date: priced
      ? `${RECEIPT_DATE.format(new Date(store.pricedAt ?? 0)).toUpperCase()}${isStale(store.pricedAt) ? " (OLD)" : ""}`
      : null,
    source,
  };
}
