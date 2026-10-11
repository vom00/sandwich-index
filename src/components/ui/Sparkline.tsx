import { canSetPrice } from "@/lib/pricing";
import { formatCents } from "@/lib/money";
import type { Submission } from "@/types";

/**
 * A price trend at a glance.
 *
 * Only counted submissions are plotted. Charting a delivery price
 * alongside counter prices would draw a spike that looks like a price rise and
 * is nothing of the sort.
 *
 * Presentational only — `aria-hidden`, with the same information given as text
 * beside it. A sparkline is decoration for anyone who cannot see it.
 */
export function Sparkline({
  submissions,
  width = 160,
  height = 36,
}: {
  submissions: readonly Submission[];
  width?: number;
  height?: number;
}) {
  const points = submissions
    .filter(canSetPrice)
    .slice()
    .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));

  if (points.length < 2) {
    return (
      <span className="text-xs text-ink-subtle">
        {points.length === 0 ? "no history yet" : "one price so far"}
      </span>
    );
  }

  const prices = points.map((point) => point.priceCents);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const span = max - min || 1;

  const padding = 3;
  const usableHeight = height - padding * 2;

  const coords = points.map((point, index) => {
    const x = (index / (points.length - 1)) * width;
    const y = padding + usableHeight - ((point.priceCents - min) / span) * usableHeight;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  });

  const last = prices[prices.length - 1] ?? 0;
  const first = prices[0] ?? 0;
  const rising = last >= first;

  return (
    <span className="inline-flex items-center gap-2">
      <svg
        // Dimensions reserved so the surrounding layout never shifts.
        width={width}
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        aria-hidden="true"
        focusable="false"
        className="overflow-visible"
      >
        <polyline
          points={coords.join(" ")}
          fill="none"
          stroke={rising ? "var(--color-tier-high)" : "var(--color-tier-low)"}
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle
          cx={width}
          cy={padding + usableHeight - ((last - min) / span) * usableHeight}
          r="2.5"
          fill={rising ? "var(--color-tier-high)" : "var(--color-tier-low)"}
        />
      </svg>
      <span className="text-xs text-ink-subtle">
        {formatCents(first)} → {formatCents(last)}
      </span>
    </span>
  );
}
