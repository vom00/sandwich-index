import { ImageResponse } from "next/og";

import {
  DashedRule,
  INK_MUTED,
  INK_SUBTLE,
  Line,
  OG_SIZE,
  RECEIPT_DATE,
  Receipt,
  TIER_COLOR,
  TierMark,
  clip,
  receiptFonts,
} from "@/components/og/receipt";
import { feedAttribution, feedDateVerb } from "@/lib/feeds";
import { loadPriceMap, priceTier, type PriceTier } from "@/lib/landing-map";
import { formatCents } from "@/lib/money";
import { isStale } from "@/lib/pricing";
import { getStore } from "@/lib/stores.server";
import { storeLabel } from "@/lib/store-label";
import { storeIdSchema } from "@/lib/validation";

/**
 * The picture a store page shows when its link is shared: a till receipt in
 * Plex Mono with the store, its price, where that price sits nationally, and
 * the day it was checked. The slip itself is `components/og/receipt`, shared
 * with the price spread's card.
 *
 * Cached for an hour per store. A shared card is looked at long after it is
 * fetched (every platform keeps its own copy for days), so the date printed on
 * it is what keeps it honest, not freshness. One store read per hour per store
 * at most, and a failed read keeps serving the last good card. `force-static`
 * is what lets a dynamic segment be cached at all (each store's card is made
 * on its first request); nothing here reads the request.
 */
export const dynamic = "force-static";
export const revalidate = 3600;

export const alt = "A till receipt showing this McDonald's store's McChicken price, how it compares nationally, and the day it was checked.";
export const size = OG_SIZE;
export const contentType = "image/png";

/** The landing page's national scale: p10 and below, p90 and above, between. */
const TIER_LABEL: Record<Exclude<PriceTier, "none">, string> = {
  low: "Cheapest tenth in the US",
  mid: "Middle 80% in the US",
  high: "Dearest tenth in the US",
};

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = storeIdSchema.safeParse(id);
  const store = parsed.success ? await getStore(parsed.data) : null;
  if (store === null) return new Response("Not found", { status: 404 });

  // A street address already ends in its town; anything less carries a caveat.
  const label = storeLabel(store);
  const priced = store.priceCents !== null && store.pricedAt !== null;
  const tier = priced ? priceTier(store.priceCents ?? 0, (await loadPriceMap()).priceCents) : "none";
  const dateVerb = store.priceFeed !== null ? feedDateVerb(store.priceFeed) : "reported";
  const source =
    !priced
      ? "Nobody has reported a price for this store yet."
      : store.priceFeed !== null
        ? (feedAttribution(store.priceFeed, store.pricedAt ?? "") ?? "")
        : `From ${store.confirmedCount} confirmed ${store.confirmedCount === 1 ? "report" : "reports"} by visitors.`;

  return new ImageResponse(
    (
      <Receipt title="MCCHICKEN PRICE CHECK">
        <span style={{ fontSize: 17, color: INK_SUBTLE, letterSpacing: 2 }}>STORE</span>
        <span style={{ fontSize: 27, fontWeight: 500, lineHeight: 1.25, marginTop: 6 }}>
          {clip(label.text.toUpperCase(), 58)}
        </span>
        {label.qualifier !== null ? (
          <span style={{ fontSize: 20, color: INK_MUTED, marginTop: 4 }}>{`(${label.qualifier.toUpperCase()})`}</span>
        ) : null}

        <DashedRule />

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <span style={{ fontSize: 22, fontWeight: 500, letterSpacing: 2, paddingBottom: priced ? 14 : 2 }}>1 MCCHICKEN</span>
          <span style={{ fontSize: priced ? 84 : 30, fontWeight: 500, lineHeight: 1, letterSpacing: priced ? -2 : 1 }}>
            {priced ? formatCents(store.priceCents ?? 0) : "NO PRICE YET"}
          </span>
        </div>
        <Line label="TIER">
          {tier === "none" ? (
            <span style={{ color: INK_SUBTLE }}>—</span>
          ) : (
            <>
              <TierMark tier={tier} />
              <span style={{ color: TIER_COLOR[tier] }}>{TIER_LABEL[tier].toUpperCase()}</span>
            </>
          )}
        </Line>
        <Line label={priced ? dateVerb.toUpperCase() : "DATE"}>
          {priced ? (
            <span>
              {`${RECEIPT_DATE.format(new Date(store.pricedAt ?? 0)).toUpperCase()}${isStale(store.pricedAt) ? " (OLD)" : ""}`}
            </span>
          ) : (
            <span style={{ color: INK_SUBTLE }}>—</span>
          )}
        </Line>

        <DashedRule />

        <span style={{ fontSize: 15, color: INK_SUBTLE, lineHeight: 1.4 }}>{source}</span>
      </Receipt>
    ),
    { ...size, fonts: await receiptFonts() },
  );
}
