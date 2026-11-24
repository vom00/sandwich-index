import "server-only";

import type { Firestore } from "firebase-admin/firestore";

import { SUBMISSIONS_COLLECTION } from "@/lib/firebase/admin";
import { monthBounds } from "@/lib/monthly-story";

/** More reports than this in one month and the count is left blank rather than half read. */
export const CONFIRMED_READ_LIMIT = 5000;

export type ConfirmedCount = { count: number; reason?: undefined } | { count: null; reason: string };

/**
 * Visitor reports accepted in a month: reports submitted in the month whose
 * status is now "accepted" (a held report that is later accepted counts).
 *
 * One query on `submittedAt` alone, which the automatic single-field index
 * serves, so it needs no composite index. It costs one read per report
 * submitted in the month, at most CONFIRMED_READ_LIMIT + 1.
 */
export async function countConfirmed(db: Firestore, month: string): Promise<ConfirmedCount> {
  const { start, end } = monthBounds(month);
  const snapshot = await db
    .collection(SUBMISSIONS_COLLECTION)
    .where("submittedAt", ">=", new Date(start))
    .where("submittedAt", "<", new Date(end))
    .select("status")
    .limit(CONFIRMED_READ_LIMIT + 1)
    .get();
  if (snapshot.size > CONFIRMED_READ_LIMIT) {
    return { count: null, reason: `More than ${CONFIRMED_READ_LIMIT} reports this month; the count was not read in full.` };
  }
  return { count: snapshot.docs.filter((doc) => doc.get("status") === "accepted").length };
}
