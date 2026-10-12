import { feedById } from "@/lib/feeds";
import { formatCents } from "@/lib/money";
import { relativeAge } from "@/lib/tiers";
import type { ObservationWithId } from "@/types";

/**
 * Every price a feed has listed for this store, newest first.
 *
 * Its own table, not rows mixed into the visitor log, for the same reason the
 * data is kept apart: a feed's figure is somebody else's dated record of the
 * menu, and a reader weighing it needs to know whose. Each row names the feed,
 * says how it gets its numbers, and links to the feed's own page so the claim
 * can be checked at the source.
 */

const EXACT_DATE = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

export function ObservationLog({
  observations,
}: {
  observations: readonly ObservationWithId[];
}) {
  const feeds = [...new Set(observations.map((observation) => observation.feed))]
    .map((id) => feedById(id))
    .filter((feed) => feed !== null);
  // "Checked" when every feed here dates by when we read it, "Observed" when
  // every one says when it saw the price; "Date" for a mix.
  const verbs = [...new Set(feeds.map((feed) => feed.dateVerb))];
  const dateHeading =
    verbs.length === 1 && verbs[0] !== undefined
      ? verbs[0].charAt(0).toUpperCase() + verbs[0].slice(1)
      : "Date";

  return (
    <>
      <p className="mt-2 text-sm text-ink-muted">
        Prices listed by{" "}
        {feeds.length === 0
          ? "an outside price feed"
          : feeds.map((feed) => `${feed.name}, ${feed.method}`).join(", and by ")}
        . They are never counted as visitors&rsquo; reports, and a price a
        visitor logs after them replaces them.
      </p>

      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[22rem] border-collapse text-left">
          <caption className="sr-only">
            Every price an outside feed listed for this store, newest first
          </caption>
          <thead>
            <tr className="border-b border-rule-strong">
              <th scope="col" className="py-2 pr-4 text-sm font-medium">
                Price
              </th>
              <th scope="col" className="py-2 pr-4 text-sm font-medium">
                Feed
              </th>
              <th scope="col" className="py-2 pr-4 text-sm font-medium">
                {dateHeading}
              </th>
              <th scope="col" className="py-2 text-sm font-medium">
                Source
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rule">
            {observations.map((observation) => (
              <tr key={observation.id}>
                <td className="tabular py-3 pr-4 text-base">
                  {formatCents(observation.priceCents)}
                </td>
                <td className="py-3 pr-4 text-sm text-ink-muted">
                  {feedById(observation.feed)?.name ?? observation.feed}
                </td>
                <td className="py-3 pr-4 text-sm text-ink-muted">
                  <time dateTime={observation.observedAt}>
                    {relativeAge(observation.observedAt)}
                  </time>
                  {/* UTC on purpose: feeds date their observations by day, and a
                      local zone would show 3 August as 2 August west of Greenwich. */}
                  <span className="block text-xs text-ink-subtle">
                    {EXACT_DATE.format(new Date(observation.observedAt))}
                  </span>
                </td>
                <td className="py-3 text-sm">
                  {observation.sourceUrl === null ? (
                    <span className="text-ink-subtle">—</span>
                  ) : (
                    <a
                      href={observation.sourceUrl}
                      target="_blank"
                      rel="noreferrer noopener"
                      className="hover-accent inline-flex min-h-11 items-center underline decoration-rule underline-offset-2"
                    >
                      Their page
                      <span className="sr-only">
                        {" "}
                        on {feedById(observation.feed)?.name ?? "the feed"} (opens in a new tab)
                      </span>
                    </a>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
