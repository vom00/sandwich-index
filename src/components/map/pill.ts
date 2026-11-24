import { formatCents } from "@/lib/money";
import { provenanceSummary } from "@/lib/provenance";
import { storeLabelText } from "@/lib/store-label";
import { TIER_PRESENTATION, type PriceTier, type StoreDisplayState } from "@/lib/tiers";
import type { StoreWithId } from "@/types";

/**
 * A store's price pill, shared by both maps so they can never disagree about
 * what a pill says. The price has to be legible without a click, and the tier
 * readable without relying on colour, so every pill carries a glyph.
 */
export interface PillParts {
  /** The pill itself; the caller wraps it in its own 44px target. */
  html: string;
  /** Everything the pill says, for the target's accessible name. */
  label: string;
  /** Width of the 44px-tall target, wide enough for the pill. */
  width: number;
}

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function pillParts(
  store: StoreWithId,
  tier: PriceTier | null,
  state: StoreDisplayState,
  isSelected: boolean,
): PillParts {
  const priceLabel = store.priceCents === null ? "—" : formatCents(store.priceCents);
  const presentation = tier === null ? null : TIER_PRESENTATION[tier];

  // The glyph is what keeps the tier readable in greyscale and under every
  // form of colour blindness. Colour alone would fail those users entirely.
  const glyph = state === "unmeasured" ? "?" : state === "stale" ? "◷" : presentation?.glyph ?? "●";
  const color = state === "priced" && presentation !== null ? presentation.colorVar : "var(--color-stale)";

  const label = [
    store.name,
    storeLabelText(store),
    state === "unmeasured"
      ? "no prices submitted yet"
      : state === "stale"
        ? `${priceLabel}, price is stale`
        : `${priceLabel}, ${presentation?.label ?? ""}`,
    provenanceSummary(store),
  ].join(", ");

  const html = `<span class="marker-pill${isSelected ? " marker-pill--selected" : ""}${
    state !== "priced" ? " marker-pill--muted" : ""
  }" style="--pill-color:${color}"><span class="marker-glyph" aria-hidden="true">${glyph}</span><span class="marker-price tabular">${escapeHtml(priceLabel)}</span></span>`;

  return { html, label, width: Math.max(64, priceLabel.length * 10 + 34) };
}

export { escapeHtml };
