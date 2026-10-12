"use client";

/**
 * The client submission write path.
 *
 * Writes go direct from the browser to Firestore rather than through a server
 * route, which means the security rules are doing the enforcement rather than
 * merely agreeing with a server that already decided. The cost is that the
 * price recompute is a separate call that can fail after the write commits;
 * see `recomputeAfterSubmit` for how that is made recoverable.
 */

import {
  Timestamp,
  collection,
  doc,
  getDoc,
  serverTimestamp,
  writeBatch,
} from "firebase/firestore";

import { ensureAnonymousUser, getDb } from "@/lib/firebase/client";
import { statusForSubmission } from "@/lib/pricing";
import { isValidPriceCents } from "@/lib/money";
import type { PriceSource, SubmissionStatus } from "@/types";

const RATE_LIMIT_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface SubmitPriceInput {
  storeId: string;
  priceCents: number;
  source: PriceSource;
}

export type SubmitFailureReason =
  | "invalid_price"
  | "store_not_found"
  | "rate_limited"
  | "rejected_by_rules"
  | "offline"
  | "network";

export type SubmitPriceResult =
  | { ok: true; status: SubmissionStatus; submissionId: string }
  | { ok: false; reason: SubmitFailureReason; message: string; retryAfter?: string };

/**
 * Check the ledger before attempting the write.
 *
 * The rule enforces this regardless; reading first exists purely so a repeat
 * contributor gets "you already logged this store today" instead of an opaque
 * permission error. The ledger is readable only by the device that owns it.
 */
async function findRateLimit(
  storeId: string,
  uid: string,
): Promise<{ blocked: boolean; retryAfter?: string }> {
  try {
    const snapshot = await getDoc(doc(getDb(), "rateLimits", `${uid}_${storeId}`));
    if (!snapshot.exists()) return { blocked: false };

    const last = snapshot.data()["lastSubmittedAt"];
    if (!(last instanceof Timestamp)) return { blocked: false };

    const elapsed = Date.now() - last.toDate().getTime();
    if (elapsed >= RATE_LIMIT_WINDOW_MS) return { blocked: false };

    return {
      blocked: true,
      retryAfter: new Date(last.toDate().getTime() + RATE_LIMIT_WINDOW_MS).toISOString(),
    };
  } catch {
    // A failed pre-check must not block a legitimate submission — the rule is
    // the real gate, so fall through and let the write decide.
    return { blocked: false };
  }
}

export async function submitPrice(input: SubmitPriceInput): Promise<SubmitPriceResult> {
  const { storeId, priceCents, source } = input;

  if (!isValidPriceCents(priceCents)) {
    return {
      ok: false,
      reason: "invalid_price",
      message: "That price is outside the range we accept.",
    };
  }

  // `navigator.onLine` is only trustworthy when it says false, which is exactly
  // the case worth acting on. Without this the write sits there until Firestore
  // gives up, and the contributor stares at a spinner for the length of a
  // timeout before being told something they already knew.
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    return {
      ok: false,
      reason: "offline",
      message:
        "You are offline, so this has not been saved. Nothing is queued, so try again once you are back online.",
    };
  }

  try {
    const user = await ensureAnonymousUser();
    const db = getDb();

    const rateLimit = await findRateLimit(storeId, user.uid);
    if (rateLimit.blocked) {
      return {
        ok: false,
        reason: "rate_limited",
        message: "You already logged a price for this store today.",
        ...(rateLimit.retryAfter !== undefined ? { retryAfter: rateLimit.retryAfter } : {}),
      };
    }

    // Read the store's current price so we can predict the status the rule
    // will require. If the price shifts between this read and the commit, the
    // rule rejects the write rather than accepting a wrong status.
    const storeSnapshot = await getDoc(doc(db, "stores", storeId));
    if (!storeSnapshot.exists()) {
      return {
        ok: false,
        reason: "store_not_found",
        message: "We do not have that store on file.",
      };
    }

    const storeData = storeSnapshot.data();
    const currentCents =
      typeof storeData["priceCents"] === "number" ? storeData["priceCents"] : null;
    const status = statusForSubmission(priceCents, currentCents);

    // Both documents in one atomic batch. The rule uses getAfter() to require
    // the ledger stamp, so a submission without it is refused.
    const submissionRef = doc(collection(db, "submissions"));
    const batch = writeBatch(db);

    batch.set(submissionRef, {
      storeId,
      priceCents,
      submittedAt: serverTimestamp(),
      source,
      status,
      flagCount: 0,
    });

    batch.set(doc(db, "rateLimits", `${user.uid}_${storeId}`), {
      storeId,
      lastSubmittedAt: serverTimestamp(),
    });

    await batch.commit();
    await recomputeAfterSubmit(storeId);

    return { ok: true, status, submissionId: submissionRef.id };
  } catch (error) {
    const code = (error as { code?: string }).code ?? "";

    if (code === "permission-denied") {
      return {
        ok: false,
        reason: "rejected_by_rules",
        message:
          "That submission was refused. You may have already logged this store today.",
      };
    }

    return {
      ok: false,
      reason: "network",
      message: "Could not reach the database. Check your connection and try again.",
    };
  }
}

/**
 * Ask the server to rebuild the store's rollup.
 *
 * Failure here is survivable and deliberately not surfaced to the contributor:
 * their price is already committed and durable, and the recompute is idempotent,
 * so the next successful call — from any visitor loading the store page —
 * reconciles the rollup. Telling someone their submission failed when it did not
 * would be worse than a briefly stale price.
 */
export async function recomputeAfterSubmit(storeId: string): Promise<boolean> {
  try {
    const response = await fetch(`/api/stores/${encodeURIComponent(storeId)}/recompute`, {
      method: "POST",
    });
    return response.ok;
  } catch {
    return false;
  }
}
