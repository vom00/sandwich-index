"use client";

import dynamic from "next/dynamic";

import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { canSetPrice } from "@/lib/pricing";
import { formatCents } from "@/lib/money";
import type { Submission } from "@/types";

/**
 * The chart section: a figure, a caption that says the same thing in words, and
 * an honest message when there is not enough data to draw anything.
 *
 * The caption is not decoration. A line chart is unreadable to anyone using a
 * screen reader and hard work for anyone with low vision, so the range and span
 * are stated in text for everybody, and the full submission table below carries
 * every individual value.
 *
 * Recharts is loaded only in the browser and only on this route — it is a large
 * dependency and the store page is the one place that needs it. The skeleton
 * reserves the exact final height, so the load costs no layout shift.
 */
const PriceChartCanvas = dynamic(() => import("./PriceChartCanvas"), {
  ssr: false,
  loading: () => (
    <div className="h-56 w-full animate-pulse rounded-md bg-paper-sunken motion-reduce:animate-none sm:h-72">
      <span className="sr-only">Loading price chart</span>
    </div>
  ),
});

const SPAN_DATE = new Intl.DateTimeFormat("en-US", { month: "long", day: "numeric" });

export function PriceHistory({
  submissions,
  priceCents,
}: {
  submissions: readonly Submission[];
  priceCents: number | null;
}) {
  const reducedMotion = usePrefersReducedMotion();

  const counted = submissions
    .filter(canSetPrice)
    .slice()
    .sort((a, b) => a.submittedAt.localeCompare(b.submittedAt));

  if (counted.length === 0) {
    return (
      <p className="text-ink-muted">
        Nothing to chart yet. A price history starts with somebody logging the
        first one.
      </p>
    );
  }

  if (counted.length === 1) {
    const only = counted[0];
    return (
      <p className="text-ink-muted">
        One counted price so far:{" "}
        <span className="tabular text-ink">
          {formatCents(only?.priceCents ?? 0)}
        </span>
        . A trend needs at least two.
      </p>
    );
  }

  const prices = counted.map((submission) => submission.priceCents);
  const low = Math.min(...prices);
  const high = Math.max(...prices);
  const first = counted[0];
  const last = counted[counted.length - 1];

  return (
    <figure className="mt-4">
      <PriceChartCanvas
        submissions={counted}
        priceCents={priceCents}
        reducedMotion={reducedMotion}
      />

      <figcaption className="mt-3 text-sm text-ink-muted">
        {counted.length} counted prices between{" "}
        {SPAN_DATE.format(new Date(first?.submittedAt ?? 0))} and{" "}
        {SPAN_DATE.format(new Date(last?.submittedAt ?? 0))}
        {low === high ? (
          <>
            , every one of them{" "}
            <span className="tabular text-ink">{formatCents(low)}</span>.
          </>
        ) : (
          <>
            , ranging <span className="tabular text-ink">{formatCents(low)}</span> to{" "}
            <span className="tabular text-ink">{formatCents(high)}</span>.
          </>
        )}{" "}
        Delivery prices and submissions held for review are not plotted; they are
        listed below.
      </figcaption>
    </figure>
  );
}
