/**
 * How one store's price compares to the area around it.
 *
 * Note what is being taken a median *of*. A store no longer has a median — it
 * has one set price, the newest accepted report (see `lib/pricing`). This takes
 * the median across *stores*: each nearby restaurant contributes its own single
 * price once, and the middle of those is what the area charges. That is a
 * summary of an area, which is a real thing, as opposed to a summary of one
 * restaurant, which was the thing worth getting rid of.
 *
 * Each store counts once regardless of how many people reported it, so one
 * heavily-reported store cannot define the whole area.
 *
 * Pure functions only — the Firestore query that supplies `peerPrices` lives in
 * `stores.server.ts`.
 */

import { percentDelta } from "@/lib/money";

/**
 * Median of a list of integer cents, returned as integer cents.
 *
 * Private to this module now that stores do not have medians. Even-length
 * inputs average the two middle values, which can land on a half cent; that is
 * rounded to a whole cent rather than admitting a fractional one into a
 * codebase whose entire money rule is "integers".
 */
function medianOfCents(values: readonly number[]): number | null {
  if (values.length === 0) return null;

  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);

  if (sorted.length % 2 === 1) {
    return sorted[mid] ?? null;
  }

  const lower = sorted[mid - 1];
  const upper = sorted[mid];
  if (lower === undefined || upper === undefined) return null;

  return Math.round((lower + upper) / 2);
}

/**
 * Narrower than the map's 15-mile search on purpose. Fifteen miles is "stores I
 * could plausibly drive to"; ten is closer to "the same market", which is the
 * only thing a price comparison can honestly claim.
 */
export const AREA_RADIUS_MILES = 10;

/**
 * Below three peers there is no area, only a couple of other stores. Calling
 * the midpoint of two prices "the area median" would dress up a coin flip as a
 * statistic.
 */
export const AREA_MIN_PEERS = 3;

export type AreaComparison =
  | {
      kind: "compared";
      areaMedianCents: number;
      peerCount: number;
      /** Positive means this store is pricier than the area. */
      deltaCents: number;
      percentDelta: number | null;
    }
  | { kind: "store_unpriced"; peerCount: number; areaMedianCents: number }
  | { kind: "too_few_peers"; peerCount: number };

/**
 * @param storePriceCents this store's price, or null if it has none
 * @param peerPrices the single price of each *other* nearby store — the
 *   subject store must already be excluded by the caller, or it would be
 *   compared against itself
 */
export function computeAreaComparison(
  storePriceCents: number | null,
  peerPrices: readonly number[],
): AreaComparison {
  const peerCount = peerPrices.length;
  const areaMedianCents = medianOfCents(peerPrices);

  if (peerCount < AREA_MIN_PEERS || areaMedianCents === null) {
    return { kind: "too_few_peers", peerCount };
  }

  if (storePriceCents === null) {
    return { kind: "store_unpriced", peerCount, areaMedianCents };
  }

  return {
    kind: "compared",
    areaMedianCents,
    peerCount,
    deltaCents: storePriceCents - areaMedianCents,
    percentDelta: percentDelta(storePriceCents, areaMedianCents),
  };
}

export type ComparisonDirection = "cheaper" | "pricier" | "level";

export function directionOf(deltaCents: number): ComparisonDirection {
  if (deltaCents < 0) return "cheaper";
  if (deltaCents > 0) return "pricier";
  return "level";
}

/**
 * Presentation for each direction.
 *
 * Colour is never the only signal — every direction also carries a glyph and a
 * word, so the comparison survives greyscale, colour blindness, and a screen
 * reader that announces none of the styling.
 */
export const DIRECTION_PRESENTATION: Record<
  ComparisonDirection,
  { glyph: string; word: string; colorVar: string }
> = {
  cheaper: { glyph: "▼", word: "cheaper than", colorVar: "var(--color-tier-low)" },
  pricier: { glyph: "▲", word: "pricier than", colorVar: "var(--color-tier-high)" },
  level: { glyph: "●", word: "level with", colorVar: "var(--color-ink-muted)" },
};
