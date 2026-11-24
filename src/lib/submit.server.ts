import "server-only";

import { FieldValue, Timestamp, type Firestore } from "firebase-admin/firestore";

import {
  RATE_LIMITS_COLLECTION,
  STORES_COLLECTION,
  SUBMISSIONS_COLLECTION,
  SUBMISSION_REPORTERS_FIELD,
  getAdminAppCheck,
  getAdminAuth,
  getAdminDb,
} from "@/lib/firebase/admin";
import { statusForSubmission } from "@/lib/pricing";
import type { PriceSource, SubmissionStatus } from "@/types";

/**
 * The server half of logging a price.
 *
 * Submissions used to go straight from the browser to Firestore, with the
 * security rules doing the checking. They come through a server route now
 * because two of the checks cannot happen in a rule: a Cloudflare Turnstile
 * token has to be verified against Cloudflare with a secret, and the reporter
 * code (`lib/reporter.server.ts`) is built from the request's network
 * address, which a rule never sees. The rules now refuse client writes
 * outright, and every check they made is made here instead:
 *
 * - price in range, store exists (route validation and the transaction);
 * - one report per reporter per store per 24 hours (the `rateLimits` ledger,
 *   now keyed by reporter rather than by sign-in uid, so clearing site data
 *   no longer resets it);
 * - a big move is stored as `pending` (`statusForSubmission`);
 * - `submittedAt` is the server's clock.
 */

export const REPORT_WINDOW_MS = 24 * 60 * 60 * 1000;

export type VerifyResult = { ok: true } | { ok: false; why: string };

/**
 * Cloudflare Turnstile. Off until `TURNSTILE_SECRET_KEY` is set, so the site
 * keeps working before the widget exists.
 */
export async function verifyTurnstile(token: string | undefined, address: string): Promise<VerifyResult> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return { ok: true };
  if (!token) return { ok: false, why: "missing turnstile token" };

  const form = new URLSearchParams({ secret, response: token });
  if (address !== "local") form.set("remoteip", address);
  try {
    const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      body: form,
      signal: AbortSignal.timeout(8000),
    });
    const body = (await response.json()) as { success?: boolean; "error-codes"?: string[] };
    return body.success === true
      ? { ok: true }
      : { ok: false, why: `turnstile: ${(body["error-codes"] ?? []).join(",") || "rejected"}` };
  } catch (error) {
    return { ok: false, why: `turnstile unreachable: ${(error as Error).message}` };
  }
}

/**
 * Firebase App Check. Off until the public site key is set, which is also
 * what makes the browser start sending tokens, so the two switch on together.
 */
export async function verifyAppCheck(token: string | null): Promise<VerifyResult> {
  if (!process.env.NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY) return { ok: true };
  if (!token) return { ok: false, why: "missing app check token" };
  try {
    await getAdminAppCheck().verifyToken(token);
    return { ok: true };
  } catch (error) {
    return { ok: false, why: `app check: ${(error as Error).message}` };
  }
}

/** The signed-in user behind an `Authorization: Bearer` header, or null. */
export async function verifySignIn(
  authorization: string | null,
): Promise<{ uid: string; anonymous: boolean } | null> {
  const token = authorization?.match(/^Bearer (.+)$/)?.[1];
  if (!token) return null;
  try {
    const decoded = await getAdminAuth().verifyIdToken(token);
    return { uid: decoded.uid, anonymous: decoded.firebase.sign_in_provider === "anonymous" };
  } catch {
    return null;
  }
}

export interface NewSubmission {
  storeId: string;
  priceCents: number;
  source: PriceSource;
  reporter: string;
}

export type RecordResult =
  | { ok: true; status: SubmissionStatus; submissionId: string }
  | { ok: false; reason: "store_not_found" }
  | { ok: false; reason: "rate_limited"; retryAfter: string };

/**
 * Write one submission and stamp the reporter's ledger, atomically. The
 * ledger check and the store read happen inside the same transaction, so two
 * requests racing cannot both pass the 24-hour check.
 */
export async function recordSubmission(
  input: NewSubmission,
  db: Firestore = getAdminDb(),
  now: Date = new Date(),
): Promise<RecordResult> {
  const { storeId, priceCents, source, reporter } = input;
  const ledgerRef = db.collection(RATE_LIMITS_COLLECTION).doc(`${reporter}_${storeId}`);
  const storeRef = db.collection(STORES_COLLECTION).doc(storeId);
  const submissionRef = db.collection(SUBMISSIONS_COLLECTION).doc();

  return db.runTransaction(async (transaction): Promise<RecordResult> => {
    const [ledger, store] = await Promise.all([transaction.get(ledgerRef), transaction.get(storeRef)]);

    const last = ledger.get("lastSubmittedAt");
    if (last instanceof Timestamp && now.getTime() - last.toMillis() < REPORT_WINDOW_MS) {
      return {
        ok: false,
        reason: "rate_limited",
        retryAfter: new Date(last.toMillis() + REPORT_WINDOW_MS).toISOString(),
      };
    }
    if (!store.exists) return { ok: false, reason: "store_not_found" };

    const current = store.get("priceCents");
    const status = statusForSubmission(priceCents, typeof current === "number" ? current : null);

    transaction.create(submissionRef, {
      storeId,
      priceCents,
      submittedAt: FieldValue.serverTimestamp(),
      source,
      status,
      flagCount: 0,
      [SUBMISSION_REPORTERS_FIELD]: reporter,
    });
    transaction.set(ledgerRef, { storeId, lastSubmittedAt: FieldValue.serverTimestamp() });

    return { ok: true, status, submissionId: submissionRef.id };
  });
}
