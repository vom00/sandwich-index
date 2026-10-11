import { canSetPrice } from "@/lib/pricing";
import { formatCents } from "@/lib/money";
import { relativeAge } from "@/lib/tiers";
import { PRICE_SOURCE_LABELS, type SubmissionWithId } from "@/types";

/**
 * Every submission this store has ever received, newest first.
 *
 * Published in full, including the ones that do not count. The entire case for
 * trusting a crowdsourced price is that the reader can look at where it came
 * from — hiding the excluded rows would leave it unfalsifiable and turn
 * "8 prices" into a number nobody can check. That matters more under
 * set-price than it did under a median: one report decides what the store
 * shows, so the reader deserves to see which one, and what was set aside.
 *
 * A table rather than a list because this is genuinely tabular: four fields per
 * row, compared down columns. Screen reader users get row and column context
 * for free from the header cells, which a stack of list items cannot give them.
 */

const EXACT_DATE = new Intl.DateTimeFormat("en-US", {
  year: "numeric",
  month: "short",
  day: "numeric",
});

/** Why a submission can or cannot set the price, in the reader's words. */
function countedLabel(submission: SubmissionWithId): string {
  if (canSetPrice(submission)) return "Counted";
  if (submission.status === "pending") return "Held for review";
  if (submission.status === "rejected") return "Rejected";
  if (submission.source === "delivery") return "Delivery — excluded";
  return "Not counted";
}

export function SubmissionLog({ submissions }: { submissions: readonly SubmissionWithId[] }) {
  if (submissions.length === 0) {
    return (
      <p className="mt-4 text-ink-muted">
        No submissions yet. If you have bought one here, you know something this
        page does not.
      </p>
    );
  }

  const countedCount = submissions.filter(canSetPrice).length;
  const excluded = submissions.length - countedCount;

  return (
    <>
      <p className="mt-2 text-sm text-ink-muted">
        {submissions.length} {submissions.length === 1 ? "report" : "reports"} in
        total
        {excluded > 0
          ? `, of which ${countedCount} can set the price and ${excluded} cannot.`
          : ", all of them counted."}
      </p>

      {/* Four narrow columns fit a 360px screen, but a long source label plus a
          long exclusion reason can still overflow — scrolling the table is
          better than truncating the reason. */}
      <div className="mt-4 overflow-x-auto">
        <table className="w-full min-w-[22rem] border-collapse text-left">
          <caption className="sr-only">
            Every price reported for this store, newest first
          </caption>
          <thead>
            <tr className="border-b border-rule-strong">
              <th scope="col" className="py-2 pr-4 text-sm font-medium">
                Price
              </th>
              <th scope="col" className="py-2 pr-4 text-sm font-medium">
                Source
              </th>
              <th scope="col" className="py-2 pr-4 text-sm font-medium">
                Reported
              </th>
              <th scope="col" className="py-2 text-sm font-medium">
                Counted
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-rule">
            {submissions.map((submission) => {
              const counted = canSetPrice(submission);
              return (
                <tr key={submission.id}>
                  <td className="tabular py-3 pr-4 text-base">
                    {formatCents(submission.priceCents)}
                  </td>
                  <td className="py-3 pr-4 text-sm text-ink-muted">
                    {PRICE_SOURCE_LABELS[submission.source]}
                  </td>
                  <td className="py-3 pr-4 text-sm text-ink-muted">
                    <time dateTime={submission.submittedAt}>
                      {relativeAge(submission.submittedAt)}
                    </time>
                    <span className="block text-xs text-ink-subtle">
                      {EXACT_DATE.format(new Date(submission.submittedAt))}
                    </span>
                  </td>
                  <td
                    className={`py-3 text-sm ${counted ? "text-ink-muted" : "text-ink-subtle"}`}
                  >
                    {countedLabel(submission)}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </>
  );
}
