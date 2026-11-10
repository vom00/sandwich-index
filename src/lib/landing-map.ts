/**
 * Types and helpers for the landing page's dot map
 * (`src/data/landing/price-map.json`, built by `npm run build:landing-map`).
 * Dependency-free and safe to import from a client component.
 */

/** One dot: `[x, y, cents, count]`. cents is 0 when no store in the cell is priced. */
export type PriceMapPoint = readonly [x: number, y: number, cents: number, count: number];

export interface PriceMapScale {
  min: number;
  p10: number;
  median: number;
  p90: number;
  max: number;
}

export interface PriceMap {
  width: number;
  height: number;
  generatedFrom: {
    stores: number;
    priced: number;
    newestObservedAt: string;
    oldestObservedAt: string;
  };
  priceCents: PriceMapScale;
  points: PriceMapPoint[];
}

export type PriceTier = "none" | "low" | "mid" | "high";

/**
 * Thresholds: cents <= 0 is "none" (unpriced cell); cents <= p10 is "low"
 * (cheapest tenth); cents >= p90 is "high" (dearest tenth); everything
 * between is "mid". p10 and p90 are taken from the file's own `priceCents`.
 */
export function priceTier(cents: number, scale: Pick<PriceMapScale, "p10" | "p90">): PriceTier {
  if (!(cents > 0)) return "none";
  if (cents <= scale.p10) return "low";
  if (cents >= scale.p90) return "high";
  return "mid";
}

/** Loads the map on demand so the JSON is a separate chunk, not in every bundle. */
export async function loadPriceMap(): Promise<PriceMap> {
  const mod = await import("@/data/landing/price-map.json");
  return mod.default as unknown as PriceMap;
}
