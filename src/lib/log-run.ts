/**
 * Ordering and accounting for a logging run.
 *
 * A "run" is one sitting in which somebody checks a batch of stores and types
 * what each one charges. The scarce resource is the person's patience, so the
 * ordering question is not "which store is nearest" but "which store does this
 * index learn the most from". Those are different, and the second one wins.
 *
 * Pure on purpose — no Firestore, no React. The ranking is the part most likely
 * to be argued with later, and it should be arguable against a test rather than
 * against a browser.
 */

import { displayStateFor } from "@/lib/tiers";
import type { StoreWithId } from "@/types";

/**
 * Why a store is worth checking, in descending order of value.
 *
 * `never_logged` and `expired` are kept apart rather than merged into "needs a
 * price" because they are different failures. A store nobody has ever priced is
 * a hole in the map; a store whose price expired is a number that has quietly
 * stopped being true. The second is arguably more dangerous — it still renders
 * as data — but the first is worth more per visit, because it turns a blank
 * into a signal.
 */
export type LogNeed = "never_logged" | "expired" | "current";

export interface LogCandidate {
  store: StoreWithId;
  need: LogNeed;
  /**
   * Whether this row can honestly be priced.
   *
   * A logging run works by finding the same restaurant in the McDonald's app
   * and reading its menu. That match is made on the street address — it is the
   * only thing the two systems share. A store OpenStreetMap gave us without one
   * cannot be matched: "Euless, TX 76039" identifies a town, and a town can hold
   * four restaurants charging four different prices.
   *
   * Accepting a price for such a row would produce data that looks exactly like
   * the good rows and is quietly attached to a store nobody can confirm it came
   * from. That is worse than a gap, because a gap is visibly a gap.
   */
  matchable: boolean;
}

/** The address is the join key between our data and what a person can see. */
export function isMatchable(store: StoreWithId): boolean {
  return store.address !== null;
}

const NEED_ORDER: Record<LogNeed, number> = {
  never_logged: 0,
  expired: 1,
  current: 2,
};

export const NEED_LABELS: Record<LogNeed, string> = {
  never_logged: "Never logged",
  expired: "Price expired",
  current: "Up to date",
};

export function needFor(store: StoreWithId, now: Date = new Date()): LogNeed {
  switch (displayStateFor(store, now)) {
    case "unmeasured":
      return "never_logged";
    case "stale":
      return "expired";
    case "priced":
      return "current";
  }
}

/**
 * Highest-value stores first.
 *
 * Two keys, in this order:
 *
 *   1. **Matchable before unmatchable.** A row nobody can verify belongs to a
 *      particular restaurant is not worth a contributor's attention no matter
 *      how badly it needs a price, so those sink regardless of need. This is
 *      deliberately the outer key — an unmatchable store that has never been
 *      logged still sorts below a matchable one that is merely stale.
 *   2. **Need.** Never logged, then expired, then current.
 *
 * Within a bucket the incoming order is preserved, which matters: callers hand
 * this the output of `getStoresNear`, already sorted by distance. Array sort has
 * been stable by specification since ES2019, so "unpriced, nearest first" falls
 * out without a third sort key — but it falls out *because* of that guarantee,
 * not by luck, which is why this comment exists.
 */
export function prioritiseForLogging(
  stores: readonly StoreWithId[],
  now: Date = new Date(),
): LogCandidate[] {
  return stores
    .map((store) => ({
      store,
      need: needFor(store, now),
      matchable: isMatchable(store),
    }))
    .sort((a, b) => {
      if (a.matchable !== b.matchable) return a.matchable ? -1 : 1;
      return NEED_ORDER[a.need] - NEED_ORDER[b.need];
    });
}

export interface LogRunCoverage {
  total: number;
  /**
   * The three need counts partition every row — they sum to `total`. Keeping
   * that true is what lets the header be read as an account of the whole list
   * rather than three unrelated figures.
   */
  neverLogged: number;
  expired: number;
  current: number;
  /**
   * Cuts across the three above rather than joining them: an unmatchable store
   * is also counted in whichever need bucket it belongs to. Presented as a
   * caveat under the counters, never as a fourth counter beside them.
   */
  unmatchable: number;
}

export function coverageOf(
  candidates: readonly LogCandidate[],
): LogRunCoverage {
  const coverage: LogRunCoverage = {
    total: candidates.length,
    neverLogged: 0,
    expired: 0,
    current: 0,
    unmatchable: 0,
  };

  for (const { need, matchable } of candidates) {
    if (need === "never_logged") coverage.neverLogged += 1;
    else if (need === "expired") coverage.expired += 1;
    else coverage.current += 1;

    if (!matchable) coverage.unmatchable += 1;
  }

  return coverage;
}

/** What happened to a single row once the run finished. */
export type RowOutcome =
  | { kind: "idle" }
  | { kind: "saving" }
  /** Became the store price straight away. */
  | { kind: "saved"; cents: number }
  /** Written, but far enough from the store's baseline to need a second report. */
  | { kind: "held"; cents: number }
  | { kind: "failed"; message: string };

export interface RunSummary {
  saved: number;
  held: number;
  failed: number;
}

export function summarise(outcomes: Iterable<RowOutcome>): RunSummary {
  const summary: RunSummary = { saved: 0, held: 0, failed: 0 };

  for (const outcome of outcomes) {
    if (outcome.kind === "saved") summary.saved += 1;
    else if (outcome.kind === "held") summary.held += 1;
    else if (outcome.kind === "failed") summary.failed += 1;
  }

  return summary;
}

/**
 * One sentence describing how the run went.
 *
 * Written out here rather than assembled in JSX because it is announced to a
 * live region, and a live region needs one coherent string — screen readers
 * read the whole node, so building it from three conditional spans produces
 * something that reads correctly and announces as fragments.
 */
export function describeRun(summary: RunSummary): string {
  const parts: string[] = [];

  if (summary.saved > 0) {
    parts.push(`${summary.saved} price${summary.saved === 1 ? "" : "s"} logged`);
  }
  if (summary.held > 0) {
    parts.push(`${summary.held} held for a second report`);
  }
  if (summary.failed > 0) {
    parts.push(`${summary.failed} could not be saved`);
  }

  if (parts.length === 0) return "Nothing to save — no prices were entered.";
  if (parts.length === 1) return `${parts[0]}.`;

  const last = parts[parts.length - 1];
  return `${parts.slice(0, -1).join(", ")} and ${last}.`;
}
