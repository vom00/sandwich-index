import { Odometer } from "@/components/ui/Odometer";
import { formatCount } from "@/lib/money";
import type { IndexSnapshot } from "@/lib/stores.server";
import { STALE_AFTER_DAYS } from "@/types";

/**
 * The index in three numbers, each a subset of the one above: every store on
 * file, the ones with a price, and the ones whose price is recent enough to
 * quote.
 *
 * All three come from the landing page's snapshot (`getCachedIndexSnapshot`),
 * the one place the site counts stores, so the two pages can never disagree.
 * "Priced" is every store with a price on file (current plus stale);
 * "confirmed" is the snapshot's own priced count, dated inside the staleness
 * window, by a visitor or a named feed.
 *
 * The figures roll up once on wheels as the page opens (`Odometer`,
 * `roll="load"`); under reduced motion they are simply there. Each bar is its
 * row's share of the stores on file, drawn at its final width.
 */
export function NumbersFunnel({ snapshot }: { snapshot: IndexSnapshot }) {
  const tracked = snapshot.trackedStoreCount;
  const rows = [
    {
      label: "McDonald’s on file",
      note: "Every US location we know of, priced or not.",
      count: tracked,
    },
    {
      label: "Have a price",
      note: "From a visitor or a named price feed, of any age.",
      count: snapshot.pricedStoreCount + snapshot.staleStoreCount,
    },
    {
      label: `Confirmed in the last ${STALE_AFTER_DAYS} days`,
      note: "Recent enough to quote. Anything older is shown as stale.",
      count: snapshot.pricedStoreCount,
    },
  ];

  return (
    <section aria-labelledby="index-in-numbers" className="reveal mt-12 lg:col-start-2" style={{ animationDelay: "180ms" }}>
      {/* An eyebrow, like the store page's, not a heading: the page's own
          headings start with the sections below. */}
      <p id="index-in-numbers" className="font-mono text-xs uppercase tracking-[0.18em] text-ink-subtle">
        The index in three numbers
      </p>
      <ol className="mt-4 border-t border-rule">
        {rows.map((row) => {
          const share = tracked === 0 ? 0 : row.count / tracked;
          return (
            <li key={row.label} className="border-b border-rule py-4 last:border-b-0">
              <div className="flex items-baseline justify-between gap-x-6">
                <div>
                  <p className="text-ink">{row.label}</p>
                  <p className="mt-0.5 text-sm text-ink-subtle">{row.note}</p>
                </div>
                <Odometer roll="load" value={formatCount(row.count)} className="tabular shrink-0 text-3xl font-medium sm:text-4xl" />
              </div>
              <div aria-hidden="true" className="mt-3 h-1 overflow-hidden rounded-full bg-paper-sunken">
                <div className="h-full rounded-full bg-ink" style={{ width: `${(share * 100).toFixed(2)}%` }} />
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
