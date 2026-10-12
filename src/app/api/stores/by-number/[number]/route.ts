import { NextResponse } from "next/server";

import { storeLabel } from "@/lib/store-label";
import { getStoreByRestaurantNumber } from "@/lib/stores.server";
import { restaurantNumberSchema } from "@/lib/validation";

/**
 * GET /api/stores/by-number/[number]
 *
 * The store a receipt came from, by the "McDonald's Restaurant #" it prints.
 * Used when somebody reads a receipt on one store's page and it turns out to
 * be from another, so the form can point them to the right page instead of
 * just refusing.
 */
export async function GET(
  _request: Request,
  context: RouteContext<"/api/stores/by-number/[number]">,
): Promise<NextResponse> {
  const { number } = await context.params;

  const parsed = restaurantNumberSchema.safeParse(number);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid restaurant number" }, { status: 400 });
  }

  try {
    const store = await getStoreByRestaurantNumber(parsed.data);
    if (store === null) {
      return NextResponse.json({ error: "No store on file with that number" }, { status: 404 });
    }
    return NextResponse.json({ id: store.id, label: storeLabel(store).text });
  } catch (error) {
    console.error("[api/stores/by-number] failed", error);
    return NextResponse.json({ error: "Lookup failed" }, { status: 500 });
  }
}
