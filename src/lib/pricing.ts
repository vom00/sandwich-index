/**
 * What a store charges: one number, not a distribution.
 *
 * This replaces the median model. The difference is not cosmetic — it changes
 * what the site claims. A median said "across everything anyone reported, the
 * middle value is $3.19", which is a summary of reports. A set price says "this
 * restaurant charges $3.19", which is a statement about the restaurant. The
 * second is what somebody standing in a car park wants to know, and it is the
 * only one that can be right or wrong in a way a contributor can correct.
 *
 * The rule: **a store's price is its most recent accepted report.** Prices are
 * replaced, never averaged.
 *
 * What stops one bad report from becoming the price is the same gate as before,
 * repointed: a report that moves the price by more than `BIG_MOVE_PERCENT` is
 * held rather than applied, and a held report does not change anything until a
 * second report corroborates it. See `reconcile` — that promotion is what keeps
 * a genuine price rise from being permanently rejected, and it is also what
 * rescues a store whose very first report was wrong.
 *
 * Pure functions only, no Firestore imports: the recompute route, the seed
 * script and the client's optimistic status prediction all share this.
 */

import {
  PRICE_EXCLUDED_SOURCES,
  STALE_AFTER_DAYS,
  type PriceSource,
  type SubmissionStatus,
} from "@/types";

/** The subset of a submission that pricing cares about. */
export interface PriceCandidate {
  priceCents: number;
  source: PriceSource;
  status: SubmissionStatus;
  /** ISO 8601. */
  submittedAt: string;
}

/**
 * A report can set the price only if it describes the same product. Delivery
 * platforms apply their own markup, so those reports are kept and displayed but
 * never allowed to become the store's price.
 */
export function canSetPrice(
  candidate: Pick<PriceCandidate, "source" | "status">,
): boolean {
  return (
    candidate.status === "accepted" && !PRICE_EXCLUDED_SOURCES.includes(candidate.source)
  );
}

/**
 * How far a new report may move the price before it needs corroboration.
 *
 * Mirrored exactly in firestore.rules, which is the authoritative copy. Integer
 * arithmetic on both sides — `delta * 100 > current * 40` rather than
 * `delta > 0.4 * current` — so the client and the rule cannot disagree about a
 * rounding edge and produce a write the rule then rejects.
 */
export const BIG_MOVE_PERCENT = 40;

/**
 * How close two reports must be for the second to corroborate the first.
 *
 * Tighter than `BIG_MOVE_PERCENT` on purpose. Agreeing is a stronger claim than
 * not-disagreeing: two people who independently report within 5% of each other
 * have almost certainly read the same menu board, whereas two reports 39% apart
 * agree about nothing and should not between them be able to move a price.
 */
export const CORROBORATION_PERCENT = 5;

function movesMoreThan(percent: number, priceCents: number, baselineCents: number): boolean {
  return Math.abs(priceCents - baselineCents) * 100 > baselineCents * percent;
}

/** True when this report would move the price further than the gate allows. */
export function isBigMove(priceCents: number, currentCents: number | null): boolean {
  if (currentCents === null) return false;
  return movesMoreThan(BIG_MOVE_PERCENT, priceCents, currentCents);
}

export function corroborates(priceCents: number, heldCents: number): boolean {
  return !movesMoreThan(CORROBORATION_PERCENT, priceCents, heldCents);
}

/**
 * The status a write should carry, predicted client-side.
 *
 * The rule decides for real. This exists so a contributor is told "this is held
 * for a second report" at the moment they submit, rather than discovering it
 * from a status field that mysteriously says `pending`.
 *
 * Note there is no minimum-sample condition, unlike the median model — with a
 * set price there is exactly one baseline and it is either there or it is not.
 */
export function statusForSubmission(
  priceCents: number,
  currentCents: number | null,
): SubmissionStatus {
  return isBigMove(priceCents, currentCents) ? "pending" : "accepted";
}

/** The denormalized pricing fields a store document carries. */
export interface StoreRollup {
  /** Every report ever made about this store, whatever its source or status. */
  reportCount: number;
  /** Reports that were eligible to set the price. The confidence signal. */
  confirmedCount: number;
  /** What the store charges. Null when nobody has established it. */
  priceCents: number | null;
  /** ISO 8601. When the price above was reported. Null when there is none. */
  pricedAt: string | null;
  /**
   * A report waiting on corroboration, if there is one outstanding.
   *
   * Surfaced rather than hidden: "someone says this is now $4.29, waiting on a
   * second opinion" is more honest than either silently ignoring it or letting
   * it overwrite a price three other people confirmed.
   */
  heldPriceCents: number | null;
}

export interface ReconciledSubmission {
  /** Index into the input array, so callers can map back to document ids. */
  index: number;
  status: SubmissionStatus;
}

export interface Reconciliation {
  rollup: StoreRollup;
  /**
   * Submissions whose status the replay disagrees with. Empty in the ordinary
   * case; non-empty when a held report has since been corroborated and should
   * be promoted to `accepted`.
   */
  changed: ReconciledSubmission[];
}

/**
 * Replay a store's whole report history to work out what it charges now.
 *
 * Derived rather than incremental, which is what makes it safe to retry: run it
 * twice on the same data and the answer is identical, so a recompute that fails
 * half way can simply be run again.
 *
 * The replay walks reports oldest-first and maintains one price:
 *
 *   - No price yet? The report sets it. The first report about a store is taken
 *     on trust, because there is nothing to check it against.
 *   - Within the gate? The report replaces the price. Newest wins — this is the
 *     whole point of the model, and it is what lets a real price change take
 *     effect the same day somebody notices it.
 *   - Beyond the gate? Held. It does not touch the price. If a later report
 *     corroborates the held one, both are accepted and the price moves to the
 *     newer of them.
 *
 * That last clause is what rescues a store whose first-ever report was a typo:
 * the wrong price cannot be beaten by one correction, but two corrections that
 * agree with each other will always win, no matter how wrong the original was.
 */
export function reconcile(submissions: readonly PriceCandidate[]): Reconciliation {
  // Oldest first. Ties broken by input order, which is stable.
  const ordered = submissions
    .map((submission, index) => ({ submission, index }))
    .filter(({ submission }) => !PRICE_EXCLUDED_SOURCES.includes(submission.source))
    .sort((a, b) => a.submission.submittedAt.localeCompare(b.submission.submittedAt));

  let priceCents: number | null = null;
  let pricedAt: string | null = null;
  let confirmedCount = 0;

  /** The outstanding report waiting for a second opinion, if any. */
  let held: { priceCents: number; index: number } | null = null;

  const changed: ReconciledSubmission[] = [];
  const settle = (index: number, status: SubmissionStatus, was: SubmissionStatus) => {
    if (status !== was) changed.push({ index, status });
  };

  for (const { submission, index } of ordered) {
    const { priceCents: reported, status: storedStatus } = submission;

    if (priceCents === null || !isBigMove(reported, priceCents)) {
      priceCents = reported;
      pricedAt = submission.submittedAt;
      confirmedCount += 1;
      settle(index, "accepted", storedStatus);
      // Anything held is now stale gossip — the price moved for other reasons.
      held = null;
      continue;
    }

    if (held !== null && corroborates(reported, held.priceCents)) {
      // Two independent reports agree the price moved. Promote both.
      settle(held.index, "accepted", "pending");
      settle(index, "accepted", storedStatus);
      priceCents = reported;
      pricedAt = submission.submittedAt;
      confirmedCount += 2;
      held = null;
      continue;
    }

    held = { priceCents: reported, index };
    settle(index, "pending", storedStatus);
  }

  return {
    rollup: {
      reportCount: submissions.length,
      confirmedCount,
      priceCents,
      pricedAt,
      heldPriceCents: held?.priceCents ?? null,
    },
    changed,
  };
}

/** The rollup alone, for callers that do not care about status corrections. */
export function computeStoreRollup(
  submissions: readonly PriceCandidate[],
): StoreRollup {
  return reconcile(submissions).rollup;
}

/**
 * A store with no price at all is not "stale" — it is unpriced, which is a
 * different thing and gets different treatment in the UI. Callers must keep the
 * two apart; this returns false for the unpriced case.
 */
export function isStale(pricedAt: string | null, now: Date = new Date()): boolean {
  if (pricedAt === null) return false;
  const ageMs = now.getTime() - new Date(pricedAt).getTime();
  return ageMs > STALE_AFTER_DAYS * 24 * 60 * 60 * 1000;
}
