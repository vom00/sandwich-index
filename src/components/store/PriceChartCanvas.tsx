"use client";

import { useState } from "react";
import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  ResponsiveContainer,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import { feedName } from "@/lib/feeds";
import { canSetPrice } from "@/lib/pricing";
import { formatCents } from "@/lib/money";
import { PRICE_SOURCE_LABELS, type Observation, type Submission } from "@/types";

/**
 * Price history for one store.
 *
 * Only counted submissions make the line. A delivery price sitting a
 * dollar above the counter price would draw a spike that looks like a price
 * rise and is nothing of the sort — the full log below the chart is where every
 * submission, counted or not, is accounted for.
 *
 * Price feeds' observations are drawn as hollow squares, off the line. When a
 * feed set the current price, the "now" line would otherwise point at a value
 * nothing on the chart explains.
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
  /** "Mobile app", or the feed's name. */
  label: string;
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
        {TOOLTIP_DATE.format(new Date(point.t))} · {point.label}
      </p>
    </div>
  );
}

export default function PriceChartCanvas({
  submissions,
  observations,
  priceCents,
  reducedMotion,
}: {
  submissions: readonly Submission[];
  observations: readonly Observation[];
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
      label: PRICE_SOURCE_LABELS[submission.source],
    }))
    .sort((a, b) => a.t - b.t);

  const feedPoints: ChartPoint[] = observations.map((observation) => ({
    t: new Date(observation.observedAt).getTime(),
    priceCents: observation.priceCents,
    label: feedName(observation.feed),
  }));

  if (points.length < 2) return null;

  // Everything drawn, plus the current price, gets the same padding, so the
  // "now" label never sits on the axis.
  const domain = axisDomain([
    ...points.map((point) => point.priceCents),
    ...feedPoints.map((point) => point.priceCents),
    ...(priceCents === null ? [] : [priceCents]),
  ]);

  return (
    <div className="h-56 w-full sm:h-72">
      <ResponsiveContainer width="100%" height="100%">
        <ComposedChart
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

          {feedPoints.length === 0 ? null : (
            <Scatter
              data={feedPoints}
              dataKey="priceCents"
              shape="square"
              fill="var(--color-paper)"
              stroke="var(--color-ink)"
              strokeWidth={1.5}
              isAnimationActive={false}
            />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
