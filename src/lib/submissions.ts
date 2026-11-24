"use client";

/**
 * The client submission write path.
 *
 * Writes go through POST /api/stores/[id]/submissions, which checks the
 * sign-in token, App Check and Turnstile, works out who the reporter is, and
 * writes with the Admin SDK (see `lib/submit.server.ts`). The Firestore rules
 * refuse submission writes from browsers, so this route is the only way in.
 * The route also recomputes the store's price before it answers.
 */

import { ensureAnonymousUser, getAppCheckToken } from "@/lib/firebase/client";
import { isValidPriceCents } from "@/lib/money";
import type { PriceSource, SubmissionStatus } from "@/types";

export interface SubmitPriceInput {
  storeId: string;
  priceCents: number;
  source: PriceSource;
  /** From `useTurnstile().getToken()`; null while Turnstile is off. */
  turnstileToken?: string | null;
}

export type SubmitFailureReason =
  | "invalid_price"
  | "store_not_found"
  | "rate_limited"
  | "rejected_by_rules"
  | "verification_failed"
  | "offline"
  | "network";

export type SubmitPriceResult =
  | { ok: true; status: SubmissionStatus; submissionId: string }
  | { ok: false; reason: SubmitFailureReason; message: string; retryAfter?: string };

const MESSAGES: Record<Exclude<SubmitFailureReason, "offline">, string> = {
  invalid_price: "That price is outside the range we accept.",
  store_not_found: "We do not have that store on file.",
  rate_limited: "You already logged a price for this store today.",
  rejected_by_rules: "That submission was refused. You may have already logged this store today.",
  verification_failed:
    "We could not confirm this report came from a person. Reload the page and try again.",
  network: "Could not reach the database. Check your connection and try again.",
};

const fail = (reason: Exclude<SubmitFailureReason, "offline">, retryAfter?: string): SubmitPriceResult => ({
  ok: false,
  reason,
  message: MESSAGES[reason],
  ...(retryAfter !== undefined ? { retryAfter } : {}),
});

export async function submitPrice(input: SubmitPriceInput): Promise<SubmitPriceResult> {
  const { storeId, priceCents, source, turnstileToken } = input;

  if (!isValidPriceCents(priceCents)) return fail("invalid_price");

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
    const [idToken, appCheckToken] = await Promise.all([user.getIdToken(), getAppCheckToken()]);

    const response = await fetch(`/api/stores/${encodeURIComponent(storeId)}/submissions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
        ...(appCheckToken !== null ? { "X-Firebase-AppCheck": appCheckToken } : {}),
      },
      body: JSON.stringify({
        priceCents,
        source,
        ...(turnstileToken ? { turnstileToken } : {}),
      }),
    });

    const body = (await response.json().catch(() => ({}))) as {
      status?: SubmissionStatus;
      submissionId?: string;
      reason?: SubmitFailureReason;
      retryAfter?: string;
      error?: string;
    };

    if (response.ok && body.status !== undefined && body.submissionId !== undefined) {
      return { ok: true, status: body.status, submissionId: body.submissionId };
    }

    if (response.status === 429) {
      // The 24-hour rule names its reason; the per-minute request limit
      // does not, and says so in its own words.
      return body.reason === "rate_limited"
        ? fail("rate_limited", body.retryAfter)
        : { ok: false, reason: "rate_limited", message: body.error ?? MESSAGES.network };
    }

    switch (body.reason) {
      case "invalid_price":
      case "store_not_found":
      case "verification_failed":
        return fail(body.reason);
      default:
        return fail(response.status === 403 ? "rejected_by_rules" : "network");
    }
  } catch {
    return fail("network");
  }
}
