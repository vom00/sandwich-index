import { revalidatePath, revalidateTag } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";

import { INDEX_SNAPSHOT_TAG } from "@/lib/index-snapshot.server";
import { SUBMIT_RATE, clientAddress, rateLimited } from "@/lib/rate-limit";
import { reporterKey } from "@/lib/reporter.server";
import { recomputeStoreRollupReporting } from "@/lib/stores.server";
import { recordSubmission, verifyAppCheck, verifySignIn, verifyTurnstile } from "@/lib/submit.server";
import { priceCentsSchema, priceSourceSchema, storeIdSchema } from "@/lib/validation";

const bodySchema = z.object({
  priceCents: priceCentsSchema,
  source: priceSourceSchema,
  turnstileToken: z.string().max(4096).optional(),
});

/**
 * POST /api/stores/[id]/submissions
 *
 * Log a price a visitor saw. The checks run cheapest first, so a refused
 * request costs as little as possible: the per-address request limit, the
 * body, the sign-in token, App Check, Turnstile, and only then Firestore. See
 * `lib/submit.server.ts` for why this is a server route at all.
 *
 * After the write the store's rollup is recomputed here, in the same request,
 * so the visitor's next page load already shows the result. If that fails the
 * price is still saved, and the next recompute of the store catches up.
 */
export async function POST(
  request: Request,
  context: RouteContext<"/api/stores/[id]/submissions">,
): Promise<NextResponse> {
  const limited = rateLimited(SUBMIT_RATE, request);
  if (limited !== null) return limited;

  const { id } = await context.params;
  const storeId = storeIdSchema.safeParse(id);
  if (!storeId.success) {
    return NextResponse.json({ error: "Invalid store id", reason: "store_not_found" }, { status: 400 });
  }

  let raw: unknown;
  try {
    raw = await request.json();
  } catch {
    return NextResponse.json({ error: "Expected a JSON body", reason: "invalid_price" }, { status: 400 });
  }
  const body = bodySchema.safeParse(raw);
  if (!body.success) {
    return NextResponse.json({ error: "That price is outside the range we accept.", reason: "invalid_price" }, { status: 400 });
  }

  const user = await verifySignIn(request.headers.get("authorization"));
  if (user === null) {
    return NextResponse.json({ error: "Sign-in token missing or invalid", reason: "verification_failed" }, { status: 401 });
  }

  const address = clientAddress(request);
  const [appCheck, turnstile] = await Promise.all([
    verifyAppCheck(request.headers.get("x-firebase-appcheck")),
    verifyTurnstile(body.data.turnstileToken, address),
  ]);
  for (const check of [appCheck, turnstile]) {
    if (!check.ok) {
      console.warn("[api/submissions] refused", check.why);
      return NextResponse.json({ error: "Verification failed", reason: "verification_failed" }, { status: 403 });
    }
  }

  const reporter = reporterKey({
    uid: user.uid,
    anonymous: user.anonymous,
    address,
    secret: process.env.REPORTER_HASH_SECRET,
  });

  try {
    const result = await recordSubmission({
      storeId: storeId.data,
      priceCents: body.data.priceCents,
      source: body.data.source,
      reporter,
    });

    if (!result.ok) {
      return result.reason === "rate_limited"
        ? NextResponse.json(
            { error: "Already logged today", reason: "rate_limited", retryAfter: result.retryAfter },
            { status: 429 },
          )
        : NextResponse.json({ error: "Store not found", reason: "store_not_found" }, { status: 404 });
    }

    try {
      const recomputed = await recomputeStoreRollupReporting(storeId.data);
      if (recomputed?.changed) revalidateTag(INDEX_SNAPSHOT_TAG, "max");
    } catch (error) {
      console.error("[api/submissions] recompute after submit failed", error);
    }
    // The store page is cached; its history changed even if the price held.
    revalidatePath(`/store/${storeId.data}`);

    return NextResponse.json({ status: result.status, submissionId: result.submissionId }, { status: 201 });
  } catch (error) {
    console.error("[api/submissions] write failed", error);
    return NextResponse.json({ error: "Submission failed", reason: "network" }, { status: 500 });
  }
}
