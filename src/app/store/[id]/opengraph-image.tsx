import { ImageResponse } from "next/og";

import {
  DashedRule,
  INK_MUTED,
  INK_SUBTLE,
  Line,
  OG_SIZE,
  Receipt,
  TIER_COLOR,
  TierMark,
  clip,
  receiptFonts,
} from "@/components/og/receipt";
import { storeCard } from "@/lib/store-card";
import { getStore } from "@/lib/stores.server";
import { storeIdSchema } from "@/lib/validation";

/**
 * The picture a store page shows when its link is shared: a till receipt in
 * Plex Mono with the store, its price, where that price sits nationally, and
 * the day it was checked. The slip itself is `components/og/receipt`, shared
 * with the price spread's card; what it says is `lib/store-card`, shared with
 * the GIF a visitor can save from the page.
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

export default async function Image({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = storeIdSchema.safeParse(id);
  const store = parsed.success ? await getStore(parsed.data) : null;
  if (store === null) return new Response("Not found", { status: 404 });

  const card = await storeCard(store);

  return new ImageResponse(
    (
      <Receipt title="MCCHICKEN PRICE CHECK">
        <span style={{ fontSize: 17, color: INK_SUBTLE, letterSpacing: 2 }}>STORE</span>
        <span style={{ fontSize: 27, fontWeight: 500, lineHeight: 1.25, marginTop: 6 }}>{clip(card.store, 58)}</span>
        {card.qualifier !== null ? (
          <span style={{ fontSize: 20, color: INK_MUTED, marginTop: 4 }}>{`(${card.qualifier})`}</span>
        ) : null}

        <DashedRule />

        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
          <span style={{ fontSize: 22, fontWeight: 500, letterSpacing: 2, paddingBottom: card.priced ? 14 : 2 }}>1 MCCHICKEN</span>
          <span style={{ fontSize: card.priced ? 84 : 30, fontWeight: 500, lineHeight: 1, letterSpacing: card.priced ? -2 : 1 }}>
            {card.price ?? "NO PRICE YET"}
          </span>
        </div>
        <Line label="TIER">
          {card.tier === null ? (
            <span style={{ color: INK_SUBTLE }}>—</span>
          ) : (
            <>
              <TierMark tier={card.tier} />
              <span style={{ color: TIER_COLOR[card.tier] }}>{card.tierLabel}</span>
            </>
          )}
        </Line>
        <Line label={card.dateLabel}>
          {card.date !== null ? <span>{card.date}</span> : <span style={{ color: INK_SUBTLE }}>—</span>}
        </Line>

        <DashedRule />

        <span style={{ fontSize: 15, color: INK_SUBTLE, lineHeight: 1.4 }}>{card.source}</span>
      </Receipt>
    ),
    { ...size, fonts: await receiptFonts() },
  );
}
