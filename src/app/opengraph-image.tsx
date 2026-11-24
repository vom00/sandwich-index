import { ImageResponse } from "next/og";

import {
  DashedRule,
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
import { ACTIVE_FEEDS, HAS_ACTIVE_FEED } from "@/lib/feeds";
import { getCachedIndexSnapshot } from "@/lib/index-snapshot.server";
import { formatCents, formatCount } from "@/lib/money";
import { storeLabelText } from "@/lib/store-label";
import type { StoreWithId } from "@/types";

/**
 * The picture the site shows when its own link is shared: the price spread
 * on the same till receipt as a store's card. The cheapest store and its
 * price, the priciest and its, the gap between them, how many stores have a
 * current price, and the day the slip was printed. Pages without a card of
 * their own (the map, the log, about) share this one; store pages have theirs.
 *
 * Every figure is the landing page's: the same cached snapshot, so a shared
 * card never quotes a spread the page does not. Rendered on request rather
 * than at build, because the build has no business reading the database; the
 * snapshot is cached for an hour (`index-snapshot.server`), and so is the
 * picture, by the CDN.
 */
export const dynamic = "force-dynamic";

export const alt =
  "A till receipt showing the cheapest and the priciest McChicken in the Sandwich Index, the gap between them, and the day it was printed.";
export const size = OG_SIZE;
export const contentType = "image/png";

/** Same as the landing page, so the two share one cached snapshot. */
const LEADER_LIMIT = 3;

/**
 * Every group is a column of its own: the renderer lays a fragment's children
 * out in a row. Spread into a fresh object per element, because the renderer
 * changes the style objects it is given, and one object shared between two
 * elements came out as a row on the second.
 */
const COLUMN = { display: "flex", flexDirection: "column" } as const;

function End({ label, tier, store }: { label: string; tier: "low" | "high"; store: StoreWithId }) {
  return (
    <div style={{ ...COLUMN }}>
      <Line label={label}>
        <TierMark tier={tier} />
        <span style={{ color: TIER_COLOR[tier] }}>{formatCents(store.priceCents ?? 0)}</span>
      </Line>
      <span style={{ fontSize: 18, color: INK_SUBTLE, marginTop: 4 }}>
        {clip(storeLabelText(store).toUpperCase(), 48)}
      </span>
    </div>
  );
}

export default async function Image() {
  const snapshot = await getCachedIndexSnapshot(LEADER_LIMIT);
  const cheapest = snapshot.cheapest[0];
  const priciest = snapshot.priciest[0];
  const printed = RECEIPT_DATE.format(new Date()).toUpperCase();
  const source = HAS_ACTIVE_FEED
    ? `Prices from visitors and ${ACTIVE_FEEDS.map((feed) => feed.name).join(", ")}, each store's under its own name and date.`
    : "Every price logged by somebody who saw it.";

  return new ImageResponse(
    (
      <Receipt title="MCCHICKEN PRICE SPREAD">
        {snapshot.spreadCents === null || cheapest === undefined || priciest === undefined ? (
          <span style={{ fontSize: 24, fontWeight: 500, letterSpacing: 1, marginTop: 6 }}>NOTHING TO MEASURE YET</span>
        ) : (
          <div style={{ ...COLUMN }}>
            <End label="CHEAPEST" tier="low" store={cheapest} />
            <div style={{ display: "flex", height: 10 }} />
            <End label="PRICIEST" tier="high" store={priciest} />

            <DashedRule />

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end" }}>
              <span style={{ fontSize: 22, fontWeight: 500, letterSpacing: 2, paddingBottom: 12 }}>SPREAD</span>
              <span style={{ fontSize: 76, fontWeight: 500, lineHeight: 1, letterSpacing: -2 }}>
                {formatCents(snapshot.spreadCents)}
              </span>
            </div>
            <Line label="STORES PRICED">
              <span>{formatCount(snapshot.pricedStoreCount)}</span>
            </Line>
            <Line label="PRINTED">
              <span>{printed}</span>
            </Line>
          </div>
        )}

        <DashedRule />

        <span style={{ fontSize: 15, color: INK_SUBTLE, lineHeight: 1.4 }}>{source}</span>
      </Receipt>
    ),
    {
      ...size,
      fonts: await receiptFonts(),
      // Without this, `ImageResponse` marks the picture immutable for a year,
      // and a shared link would show a spread long since gone. An hour, like
      // the snapshot behind it.
      headers: { "Cache-Control": "public, max-age=3600, s-maxage=3600, stale-while-revalidate=86400" },
    },
  );
}
