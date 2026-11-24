import { SettleOnView } from "@/components/ui/SettleOnView";
import strip from "@/data/landing/price-strip.json";
import { feedName } from "@/lib/feeds";
import { formatCents, formatCount } from "@/lib/money";

/**
 * "Your store vs the country": every priced McDonald's in the national feed
 * as a strip of dots by price, ten cents to a column, with this store's price
 * ringed where it falls. Beside the area comparison, which answers the same
 * question for the stores nearby.
 *
 * Every position is worked out ahead by `scripts/build-price-strip.ts`; this
 * only draws them. The shares in the sentence come from the exact count of
 * stores at every cent, not from the dots. The dots settle once, column by
 * column, the first time the strip scrolls into view (`SettleOnView`).
 */

const SHORT = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
const YEAR = new Intl.DateTimeFormat("en-US", { year: "numeric", timeZone: "UTC" });

const DOT_R = 4.6;
const AXIS_LABELS = [150, 200, 250, 300, 350];

/** Stores priced below and above `cents` nationally. */
function rank(cents: number): { below: number; above: number; total: number } {
  let below = 0;
  let above = 0;
  strip.atCent.forEach((count, i) => {
    const at = strip.minCents + i;
    if (at < cents) below += count;
    else if (at > cents) above += count;
  });
  return { below, above, total: strip.source.stores };
}

function share(part: number, total: number): string {
  const percent = (part / total) * 100;
  if (part === 0) return "none";
  if (percent < 1) return "fewer than 1%";
  if (percent > 99) return "more than 99%";
  return `${Math.round(percent)}%`;
}

const xOf = (cents: number) =>
  strip.left + ((Math.min(Math.max(cents, strip.minCents), strip.axisMaxCents) - strip.minCents) / (strip.axisMaxCents - strip.minCents)) * (strip.right - strip.left);
const pct = (x: number) => `${(x / strip.width) * 100}%`;

export function PriceStrip({ priceCents }: { priceCents: number }) {
  const { below, above, total } = rank(priceCents);
  // The ring sits on top of this store's column, as one more dot.
  const bucket = Math.min(strip.capCents, Math.floor(priceCents / strip.bucketCents) * strip.bucketCents);
  const column = strip.columns.find((c) => c.cents === bucket);
  const ringX = column?.x ?? xOf(priceCents);
  const ringY = strip.axisY - 8 - (column?.dots ?? 0) * 11;
  const from = SHORT.format(new Date(strip.source.oldestObservedAt));
  const to = `${SHORT.format(new Date(strip.source.newestObservedAt))}, ${YEAR.format(new Date(strip.source.newestObservedAt))}`;

  return (
    <section aria-labelledby="against-country" className="mt-5 rounded-2xl border border-rule px-5 py-6 sm:px-7">
      <p id="against-country" className="font-mono text-xs uppercase tracking-[0.18em] text-ink-subtle">
        Against the country
      </p>
      <p className="mt-2 text-ink-muted">
        At <span className="tabular font-medium text-ink">{formatCents(priceCents)}</span>, this store is cheaper than{" "}
        <span className="font-medium text-ink">{share(above, total)}</span> of the {formatCount(total)} stores priced
        nationally, and pricier than <span className="font-medium text-ink">{share(below, total)}</span>.
      </p>

      <SettleOnView className="mt-5">
        <div className="relative" style={{ aspectRatio: `${strip.width} / ${strip.height}` }}>
        <svg
          viewBox={`0 0 ${strip.width} ${strip.height}`}
          className="absolute inset-0 block h-full w-full overflow-visible"
          role="img"
          aria-label={`A dot for every ${strip.dotStores} stores, by price from ${formatCents(strip.minCents)} to ${formatCents(strip.capCents)} and up. The national median is ${formatCents(strip.medianCents)}; this store's ${formatCents(priceCents)} is ringed.`}
        >
          <line x1={strip.left} x2={strip.right} y1={strip.axisY} y2={strip.axisY} stroke="var(--color-rule)" strokeWidth={1.5} />
          <line
            x1={xOf(strip.medianCents)}
            x2={xOf(strip.medianCents)}
            y1={strip.axisY - 150}
            y2={strip.axisY + 6}
            stroke="var(--color-ink-subtle)"
            strokeWidth={1}
            strokeDasharray="3 3"
          />
          {strip.dots.map(([x, y, scale], i) => (
            <circle
              key={i}
              className="strip-dot"
              cx={x}
              cy={y}
              r={DOT_R * (scale ?? 1)}
              fill={column !== undefined && x === column.x ? "var(--color-ink)" : "var(--color-ink-subtle)"}
              fillOpacity={column !== undefined && x === column.x ? 0.9 : 0.42}
              style={{ "--c": strip.columns.findIndex((c) => c.x === x) } as React.CSSProperties}
            />
          ))}
          <circle
            className="strip-ring"
            cx={ringX}
            cy={ringY}
            r={DOT_R + 2.4}
            fill="none"
            stroke="var(--color-accent)"
            strokeWidth={2}
            pathLength={1}
          />
        </svg>
        <span
          aria-hidden="true"
          className="strip-label absolute -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-full bg-accent px-2 py-0.5 font-mono text-[11px] text-accent-ink"
          style={{ left: pct(ringX), top: `${((ringY - DOT_R - 6) / strip.height) * 100}%` }}
        >
          This store
        </span>
        </div>
        {/* Labels in HTML, so they stay readable at any width the picture is drawn. */}
        <div aria-hidden="true" className="relative mt-1 h-4 font-mono text-[11px] text-ink-subtle">
          {AXIS_LABELS.map((cents) => (
            <span key={cents} className="absolute -translate-x-1/2" style={{ left: pct(xOf(cents)) }}>
              {formatCents(cents)}
            </span>
          ))}
          <span className="absolute -translate-x-full" style={{ left: pct(strip.right) }}>
            {formatCents(strip.capCents)}+
          </span>
        </div>
      </SettleOnView>

      <p className="mt-3 text-xs leading-relaxed text-ink-subtle">
        Each dot is {strip.dotStores} stores; the smaller ones are fewer. Dashed line: the national median,{" "}
        {formatCents(strip.medianCents)}. Prices from {feedName(strip.source.feed)}, checked {from} to {to}.
      </p>
    </section>
  );
}
