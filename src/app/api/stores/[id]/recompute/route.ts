import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";

import { INDEX_SNAPSHOT_TAG } from "@/lib/index-snapshot.server";
import { recomputeStoreRollupReporting } from "@/lib/stores.server";
import { storeIdSchema } from "@/lib/validation";

/**
 * POST /api/stores/[id]/recompute
 *
 * Rebuild a store's denormalized price rollup from its submissions.
 *
 * Called by the client immediately after a successful submission, and safe to
 * call at any other time. The computation is derived from scratch rather than
 * incremented, so running it twice produces the same answer — which is what
 * makes the write path recoverable when this call fails after the submission
 * has already committed.
 *
 * Unauthenticated on purpose: it takes no input beyond a store id and can only
 * ever make the stored rollup agree with the submissions that already exist.
 * The worst an abuser achieves is making us do arithmetic.
 */
export async function POST(
  _request: Request,
  context: RouteContext<"/api/stores/[id]/recompute">,
): Promise<NextResponse> {
  const { id } = await context.params;

  const parsed = storeIdSchema.safeParse(id);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid store id" }, { status: 400 });
  }

  try {
    const result = await recomputeStoreRollupReporting(parsed.data);

    if (result === null) {
      return NextResponse.json({ error: "Store not found" }, { status: 404 });
    }

    // A price changed, so the landing page's cached figures are marked
    // stale; the next visit rebuilds them in the background. Only on a
    // change: a rebuild reads about 500 stores, and this URL is public.
    if (result.changed) revalidateTag(INDEX_SNAPSHOT_TAG, "max");

    return NextResponse.json({ storeId: parsed.data, rollup: result.rollup });
  } catch (error) {
    console.error("[api/stores/recompute] failed", error);
    return NextResponse.json({ error: "Recompute failed" }, { status: 500 });
  }
}
