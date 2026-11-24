import { readFile } from "node:fs/promises";
import { join } from "node:path";

import { ImageResponse } from "next/og";

import { feedAttribution, feedDateVerb } from "@/lib/feeds";
import { loadPriceMap, priceTier, type PriceTier } from "@/lib/landing-map";
import { formatCents } from "@/lib/money";
import { isStale } from "@/lib/pricing";
import { siteUrl } from "@/lib/site";
import { getStore } from "@/lib/stores.server";
import { storeLabel } from "@/lib/store-label";
import { storeIdSchema } from "@/lib/validation";

/**
 * The picture a store page shows when its link is shared: a till receipt in
 * Plex Mono with the store, its price, where that price sits nationally, and
 * the day it was checked.
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
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// The renderer reads TrueType, not the woff2 the pages use, so the two weights
// are bundled (SIL Open Font License, assets/fonts/ibm-plex-mono/OFL.txt).
const FONT_DIR = join(process.cwd(), "assets/fonts/ibm-plex-mono");
const [plexRegular, plexMedium] = await Promise.all([
  readFile(join(FONT_DIR, "IBMPlexMono-Regular.ttf")),
  readFile(join(FONT_DIR, "IBMPlexMono-Medium.ttf")),
]);

// The site's tokens (globals.css). The renderer cannot read CSS variables.
const PAPER_SUNKEN = "#f2efe8";
const RECEIPT = "#ffffff";
const INK = "#15140f";
const INK_MUTED = "#524f45";
const INK_SUBTLE = "#6b675b";
const TIER_COLOR: Record<Exclude<PriceTier, "none">, string> = {
  low: "#0f5c55",
  mid: "#8a5a12",
  high: "#7b2d3b",
};

/** The landing page's national scale: p10 and below, p90 and above, between. */
const TIER_LABEL: Record<Exclude<PriceTier, "none">, string> = {
  low: "Cheapest tenth in the US",
  mid: "Middle 80% in the US",
  high: "Dearest tenth in the US",
};

const RECEIPT_WIDTH = 600;
const TOOTH = 15;

const DATE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

/** A torn till-roll edge: teeth pointing up (top of the slip) or down (bottom). */
function TornEdge({ side }: { side: "top" | "bottom" }) {
  const teeth = RECEIPT_WIDTH / TOOTH;
  const base = side === "top" ? 10 : 0;
  const tip = side === "top" ? 0 : 10;
  let path = `M0 ${base}`;
  for (let i = 0; i < teeth; i++) path += ` L${i * TOOTH + TOOTH / 2} ${tip} L${(i + 1) * TOOTH} ${base}`;
  return (
    <svg width={RECEIPT_WIDTH} height={10} viewBox={`0 0 ${RECEIPT_WIDTH} 10`}>
      <path d={`${path} Z`} fill={RECEIPT} />
    </svg>
  );
}

function DashedRule() {
  return <div style={{ display: "flex", width: "100%", borderTop: `2px dashed ${INK_SUBTLE}`, margin: "18px 0" }} />;
}

/** A label on the left, its value on the right, like a line on a receipt. */
function Line({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10 }}>
      <span style={{ fontSize: 20, color: INK_SUBTLE, letterSpacing: 1 }}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", fontSize: 22, fontWeight: 500 }}>{children}</div>
    </div>
  );
}

/** The tier's shape, drawn rather than typed so it never depends on a glyph. Down means cheaper. */
function TierMark({ tier }: { tier: Exclude<PriceTier, "none"> }) {
  const color = TIER_COLOR[tier];
  return (
    <svg width={16} height={16} viewBox="0 0 16 16" style={{ marginRight: 10, marginTop: 3 }}>
      {tier === "mid" ? (
        <circle cx={8} cy={8} r={6} fill={color} />
      ) : (
        <path d={tier === "low" ? "M1 3 L15 3 L8 14 Z" : "M1 13 L15 13 L8 2 Z"} fill={color} />
      )}
    </svg>
  );
}

function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

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
      <div
        style={{
          display: "flex",
          width: "100%",
          height: "100%",
          alignItems: "center",
          justifyContent: "center",
          background: PAPER_SUNKEN,
          fontFamily: "Plex Mono",
          color: INK,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", width: RECEIPT_WIDTH }}>
          <TornEdge side="top" />
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              background: RECEIPT,
              padding: "26px 44px 22px",
              boxShadow: "0 18px 40px -24px rgba(21, 20, 15, 0.45)",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <span style={{ fontSize: 28, fontWeight: 500, letterSpacing: 6 }}>SANDWICH INDEX</span>
              <span style={{ fontSize: 17, color: INK_SUBTLE, letterSpacing: 3, marginTop: 4 }}>MCCHICKEN PRICE CHECK</span>
            </div>

            <DashedRule />

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
                  {`${DATE.format(new Date(store.pricedAt ?? 0)).toUpperCase()}${isStale(store.pricedAt) ? " (OLD)" : ""}`}
                </span>
              ) : (
                <span style={{ color: INK_SUBTLE }}>—</span>
              )}
            </Line>

            <DashedRule />

            <span style={{ fontSize: 15, color: INK_SUBTLE, lineHeight: 1.4 }}>{source}</span>
            <span style={{ fontSize: 15, color: INK_SUBTLE, marginTop: 10, alignSelf: "center", letterSpacing: 1 }}>
              {new URL(siteUrl()).host}
            </span>
          </div>
          <TornEdge side="bottom" />
        </div>
      </div>
    ),
    {
      ...size,
      fonts: [
        { name: "Plex Mono", data: plexRegular, weight: 400, style: "normal" },
        { name: "Plex Mono", data: plexMedium, weight: 500, style: "normal" },
      ],
    },
  );
}
