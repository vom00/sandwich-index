/**
 * Price tiers for map markers and list rows.
 *
 * Two rules govern this file, both of them accessibility rather than aesthetics:
 *
 * 1. **Tiers are computed over the loaded result set, not the visible viewport.**
 *    Viewport-relative buckets would recolour markers as the user pans, with no
 *    underlying price change. That reads as a bug, not as information.
 *
 * 2. **Every tier carries a text label and a glyph, never colour alone.**
 *    `PriceTier` is only half the answer; `TIER_PRESENTATION` is the other half,
 *    and any component rendering a tier must use both.
 */

import { isStale } from "@/lib/pricing";
import type { StoreWithId } from "@/types";

export type PriceTier = "low" | "mid" | "high";

export interface TierPresentation {
  /** Shown in list rows and used in marker aria-labels. */
  label: string;
  /**
   * Geometric glyph carried inside the marker so the tier survives greyscale
   * and every form of colour blindness. Down means cheaper.
   */
  glyph: string;
  /** CSS variable name — components must not reference raw hex. */
  colorVar: string;
}

export const TIER_PRESENTATION: Record<PriceTier, TierPresentation> = {
  low: { label: "Cheapest third", glyph: "▼", colorVar: "var(--color-tier-low)" },
  mid: { label: "Middle third", glyph: "●", colorVar: "var(--color-tier-mid)" },
  high: { label: "Priciest third", glyph: "▲", colorVar: "var(--color-tier-high)" },
};

/**
 * How a store should be presented, accounting for the three states a store can
 * be in. These are genuinely different things and must not be collapsed:
 *
 * - `priced`     — has a usable price.
 * - `stale`      — has a price, but nothing recent enough to trust.
 * - `unmeasured` — nobody has ever submitted a price. Not the same as stale.
 */
export type StoreDisplayState = "priced" | "stale" | "unmeasured";

export interface StorePresentation {
  state: StoreDisplayState;
  tier: PriceTier | null;
  /** Complete, self-contained description for screen readers. */
  ariaLabel: string;
}

export function displayStateFor(store: StoreWithId, now: Date = new Date()): StoreDisplayState {
  if (store.priceCents === null) return "unmeasured";
  if (isStale(store.pricedAt, now)) return "stale";
  return "priced";
}

/**
 * Bucket priced stores into terciles by price.
 *
 * Stale stores keep a tier — their price is old, not wrong, and showing it as
 * cheap or pricey is still useful. They are excluded from *rankings* elsewhere,
 * which is a separate concern from colouring.
 *
 * Terciles are assigned by rank rather than by value range, so a single
 * expensive outlier cannot push every other store into the "cheapest" bucket.
 */
export function assignTiers(stores: readonly StoreWithId[]): Map<string, PriceTier> {
  const priced = stores
    .filter((store) => store.priceCents !== null)
    .sort((a, b) => (a.priceCents ?? 0) - (b.priceCents ?? 0));

  const tiers = new Map<string, PriceTier>();
  if (priced.length === 0) return tiers;

  // With one or two stores, terciles are meaningless — calling a store "the
  // priciest third" of two is noise dressed up as analysis.
  if (priced.length < 3) {
    for (const store of priced) tiers.set(store.id, "mid");
    return tiers;
  }

  const cut = priced.length / 3;
  priced.forEach((store, index) => {
    const tier: PriceTier = index < cut ? "low" : index < cut * 2 ? "mid" : "high";
    tiers.set(store.id, tier);
  });

  return tiers;
}

/**
 * Stores eligible for a "cheapest near you" ranking.
 *
 * Stale and unmeasured stores are excluded — recommending a store on a price
 * nobody has confirmed in three months is how this kind of site loses trust.
 */
export function rankableStores(
  stores: readonly StoreWithId[],
  now: Date = new Date(),
): StoreWithId[] {
  return stores
    .filter((store) => displayStateFor(store, now) === "priced")
    .sort((a, b) => (a.priceCents ?? 0) - (b.priceCents ?? 0));
}

/**
 * The side panel is ordered by distance, not by price — see `sortByDistance` in
 * `lib/geohash`, which is what `StoreList` calls.
 *
 * This started out as a price sort, and it read badly: the row at the top of
 * the list was a store twelve miles away, while the McDonald's across the road
 * sat somewhere below the fold. The list answers "what is near me"; the tier
 * badge on each row, the marker colours, and the cheapest-nearby figure in the
 * header answer "what is cheap". Ordering by distance lets a reader scan
 * outward from where they are and see the price fall out against it.
 */

/** Relative age in plain words. Precision beyond this is false confidence. */
export function relativeAge(iso: string | null, now: Date = new Date()): string {
  if (iso === null) return "never";

  const days = Math.floor((now.getTime() - new Date(iso).getTime()) / (24 * 60 * 60 * 1000));

  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 30) return `${days} days ago`;

  const months = Math.floor(days / 30);
  if (months === 1) return "a month ago";
  if (months < 12) return `${months} months ago`;

  const years = Math.floor(months / 12);
  return years === 1 ? "a year ago" : `${years} years ago`;
}
