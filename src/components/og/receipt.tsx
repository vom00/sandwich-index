import { readFile } from "node:fs/promises";
import { join } from "node:path";

import type { ReactNode } from "react";

import type { PriceTier } from "@/lib/landing-map";
import { siteUrl } from "@/lib/site";

/**
 * The till receipt every share card is printed on: a white slip with torn
 * edges on sunken paper, set in Plex Mono, with dashed rules between its
 * parts. A store's card (`app/store/[id]/opengraph-image`) and the price
 * spread's (`app/opengraph-image`) are both laid out with these, so the two
 * cannot drift apart.
 *
 * For `next/og` only: everything is inline styles, because the renderer reads
 * no stylesheet and no CSS variables.
 */

export const OG_SIZE = { width: 1200, height: 630 };

// The renderer reads TrueType, not the woff2 the pages use, so the two weights
// are bundled (SIL Open Font License, assets/fonts/ibm-plex-mono/OFL.txt).
const FONT_DIR = join(process.cwd(), "assets/fonts/ibm-plex-mono");
const fontFiles = Promise.all([
  readFile(join(FONT_DIR, "IBMPlexMono-Regular.ttf")),
  readFile(join(FONT_DIR, "IBMPlexMono-Medium.ttf")),
]);

/** The two Plex Mono weights, in the shape `ImageResponse` wants. */
export async function receiptFonts() {
  const [regular, medium] = await fontFiles;
  return [
    { name: "Plex Mono", data: regular, weight: 400 as const, style: "normal" as const },
    { name: "Plex Mono", data: medium, weight: 500 as const, style: "normal" as const },
  ];
}

// The site's tokens (globals.css).
export const PAPER_SUNKEN = "#f2efe8";
export const RECEIPT = "#ffffff";
export const INK = "#15140f";
export const INK_MUTED = "#524f45";
export const INK_SUBTLE = "#6b675b";
export const TIER_COLOR: Record<Exclude<PriceTier, "none">, string> = {
  low: "#0f5c55",
  mid: "#8a5a12",
  high: "#7b2d3b",
};

const RECEIPT_WIDTH = 600;
const TOOTH = 15;

export const RECEIPT_DATE = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});

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

export function DashedRule() {
  return <div style={{ display: "flex", width: "100%", borderTop: `2px dashed ${INK_SUBTLE}`, margin: "18px 0" }} />;
}

/** A label on the left, its value on the right, like a line on a receipt. */
export function Line({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 10 }}>
      <span style={{ fontSize: 20, color: INK_SUBTLE, letterSpacing: 1 }}>{label}</span>
      <div style={{ display: "flex", alignItems: "center", fontSize: 22, fontWeight: 500 }}>{children}</div>
    </div>
  );
}

/** The tier's shape, drawn rather than typed so it never depends on a glyph. Down means cheaper. */
export function TierMark({ tier }: { tier: Exclude<PriceTier, "none"> }) {
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

export function clip(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/**
 * The slip itself: the masthead, whatever the card prints, and the site's
 * address at the foot.
 */
export function Receipt({ title, children }: { title: string; children: ReactNode }) {
  return (
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
            <span style={{ fontSize: 17, color: INK_SUBTLE, letterSpacing: 3, marginTop: 4 }}>{title}</span>
          </div>

          <DashedRule />

          {children}

          <span style={{ fontSize: 15, color: INK_SUBTLE, marginTop: 10, alignSelf: "center", letterSpacing: 1 }}>
            {new URL(siteUrl()).host}
          </span>
        </div>
        <TornEdge side="bottom" />
      </div>
    </div>
  );
}
