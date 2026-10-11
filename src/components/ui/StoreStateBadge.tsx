import { Clock, CircleHelp } from "lucide-react";

import { relativeAge, type StoreDisplayState } from "@/lib/tiers";

/**
 * The stale and unmeasured indicators.
 *
 * Both pair a Lucide icon with an actual word. Neither uses colour as the only
 * signal, and neither uses an emoji — an emoji renders differently on every
 * platform and is announced by screen readers as whatever its unicode name
 * happens to be.
 *
 * Stale and unmeasured are separate states on purpose. "We have not checked
 * lately" and "nobody has ever told us" are different claims, and merging them
 * would label every brand-new store as out of date.
 */
export function StoreStateBadge({
  state,
  pricedAt,
}: {
  state: StoreDisplayState;
  pricedAt: string | null;
}) {
  if (state === "priced") return null;

  if (state === "unmeasured") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full border border-rule bg-paper-sunken px-2.5 py-1 text-xs font-medium text-ink-muted">
        <CircleHelp aria-hidden="true" className="size-3.5 shrink-0" />
        No prices yet
      </span>
    );
  }

  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-rule bg-paper-sunken px-2.5 py-1 text-xs font-medium text-stale">
      <Clock aria-hidden="true" className="size-3.5 shrink-0" />
      Stale · last seen {relativeAge(pricedAt)}
    </span>
  );
}
