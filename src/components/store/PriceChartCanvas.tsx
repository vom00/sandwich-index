"use client";

import { useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { canSetPrice } from "@/lib/pricing";
import { formatCents } from "@/lib/money";
import { PRICE_SOURCE_LABELS, type PriceSource, type Submission } from "@/types";

/**
 * Price history for one store.
 *
 * Only counted submissions are plotted. A delivery price sitting a
 * dollar above the counter price would draw a spike that looks like a price
 * rise and is nothing of the sort — the full log below the chart is where every
 * submission, counted or not, is accounted for.
 *
 * Values stay in integer cents the whole way through, including the y-axis
 * domain and the tick values. `formatCents` runs in the tick and tooltip
 * formatters, which is the render layer and the only place a division by 100 is
 * allowed to happen.
 */

interface ChartPoint {
  /** Epoch milliseconds — Recharts needs a number for a time scale. */
  t: number;
  priceCents: number;
  source: PriceSource;
}

const AXIS_DATE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });
const TOOLTIP_DATE = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
});

/** Axis bounds snap to quarters of a dollar so the gridlines read as money. */
const AXIS_STEP_CENTS = 25;

function axisDomain(prices: readonly number[]): [number, number] {
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  // A flat series would otherwise collapse to a zero-height domain and Recharts
  // would draw the line along the frame edge.
  const pad = Math.max(AXIS_STEP_CENTS, Math.round((max - min) * 0.3));
  return [
    Math.max(0, Math.floor((min - pad) / AXIS_STEP_CENTS) * AXIS_STEP_CENTS),
    Math.ceil((max + pad) / AXIS_STEP_CENTS) * AXIS_STEP_CENTS,
  ];
}

interface TooltipRenderProps {
  active?: boolean | undefined;
  payload?: ReadonlyArray<{ payload?: unknown }> | undefined;
}

function ChartTooltip({ active, payload }: TooltipRenderProps) {
  if (active !== true) return null;

  const point = payload?.[0]?.payload as ChartPoint | undefined;
  if (point === undefined) return null;

  return (
    // No animation on the tooltip. It tracks the pointer, and anything that
    // eases into place behind a moving cursor reads as lag.
    <div className="rounded-md border border-rule bg-paper-raised px-3 py-2 text-sm shadow-md">
      <p className="tabular font-medium">{formatCents(point.priceCents)}</p>
      <p className="text-xs text-ink-muted">
        {TOOLTIP_DATE.format(new Date(point.t))} · {PRICE_SOURCE_LABELS[point.source]}
      </p>
    </div>
  );
}

export default function PriceChartCanvas({
  submissions,
  priceCents,
  reducedMotion,
}: {
  submissions: readonly Submission[];
  priceCents: number | null;
  reducedMotion: boolean;
}) {
  /**
   * Animate the line drawing itself in, once.
   *
   * Recharts re-runs its entrance animation on every data change, so after a
   * submission lands and the route refreshes the chart would redraw from zero —
   * a distracting reset of something the reader was already looking at. Latching
   * this after the first run keeps the reveal to the moment it is informative.
   */
  const [hasAnimated, setHasAnimated] = useState(false);
  const animate = !reducedMotion && !hasAnimated;

  const points: ChartPoint[] = submissions
    .filter(canSetPrice)
    .map((submission) => ({
      t: new Date(submission.submittedAt).getTime(),
      priceCents: submission.priceCents,
      source: submission.source,
    }))
    .sort((a, b) => a.t - b.t);

  if (points.length < 2) return null;

  const domain = axisDomain(points.map((point) => point.priceCents));

  return (
    <div className="h-56 w-full sm:h-72">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart
          data={points}
          margin={{ top: 8, right: 16, bottom: 4, left: 0 }}
          // Gives the chart keyboard navigation and per-point announcements.
          // The full table below is still the primary accessible representation.
          accessibilityLayer
        >
          <CartesianGrid
            stroke="var(--color-rule)"
            strokeDasharray="2 4"
            vertical={false}
          />

          <XAxis
            dataKey="t"
            type="number"
            scale="time"
            domain={["dataMin", "dataMax"]}
            tickFormatter={(value: number) => AXIS_DATE.format(new Date(value))}
            tick={{ fill: "var(--color-ink-subtle)", fontSize: 12 }}
            tickLine={false}
            axisLine={{ stroke: "var(--color-rule)" }}
            minTickGap={24}
          />

          <YAxis
            type="number"
            domain={domain}
            tickFormatter={(value: number) => formatCents(value)}
            tick={{ fill: "var(--color-ink-subtle)", fontSize: 12 }}
            tickLine={false}
            axisLine={false}
            width={64}
          />

          {priceCents === null ? null : (
            <ReferenceLine
              y={priceCents}
              stroke="var(--color-ink-subtle)"
              strokeDasharray="5 4"
              ifOverflow="extendDomain"
              label={{
                value: `now ${formatCents(priceCents)}`,
                position: "insideTopLeft",
                fill: "var(--color-ink-subtle)",
                fontSize: 11,
              }}
            />
          )}

          <Tooltip content={<ChartTooltip />} isAnimationActive={false} cursor={false} />

          <Line
            type="monotone"
            dataKey="priceCents"
            stroke="var(--color-accent)"
            strokeWidth={2}
            dot={{ r: 3, fill: "var(--color-accent)", strokeWidth: 0 }}
            activeDot={{ r: 5, fill: "var(--color-accent)", strokeWidth: 0 }}
            isAnimationActive={animate}
            // 600ms is the spec's budget for a data reveal — long enough to read
            // as the series being drawn, short enough not to make the reader wait.
            animationDuration={600}
            // Recharts takes an easing keyword, not a cubic-bezier, so the token
            // `--ease-out-quart` cannot be handed to it. `ease-out` is the
            // nearest available and shares the important property: fast at the
            // start, settling at the end.
            animationEasing="ease-out"
            onAnimationEnd={() => setHasAnimated(true)}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
