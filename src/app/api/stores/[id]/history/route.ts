import { NextResponse } from "next/server";

import { getStore, getSubmissionsForStore } from "@/lib/stores.server";
import { storeIdSchema } from "@/lib/validation";

/**
 * GET /api/stores/[id]/history
 *
 * Full submission log for one store, newest first. Public, because the whole
 * argument for trusting a crowdsourced price is that you can look at where it
 * came from.
 */
export async function GET(
  _request: Request,
  context: RouteContext<"/api/stores/[id]/history">,
): Promise<NextResponse> {
  const { id } = await context.params;

  const parsed = storeIdSchema.safeParse(id);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid store id" }, { status: 400 });
  }

  try {
    const [store, submissions] = await Promise.all([
      getStore(parsed.data),
      getSubmissionsForStore(parsed.data),
    ]);

    if (store === null) {
      return NextResponse.json({ error: "Store not found" }, { status: 404 });
    }

    return NextResponse.json({ store, submissions });
  } catch (error) {
    console.error("[api/stores/history] failed", error);
    return NextResponse.json({ error: "History lookup failed" }, { status: 500 });
  }
}
