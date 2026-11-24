"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

import { Confidence } from "@/components/ui/Confidence";
import { StoreStateBadge } from "@/components/ui/StoreStateBadge";
import { distanceMeters, type LatLng } from "@/lib/geohash";
import { formatCents } from "@/lib/money";
import { storeLabel } from "@/lib/store-label";
import { morphToStore } from "@/lib/store-morph";
import { TIER_PRESENTATION, assignTiers, displayStateFor } from "@/lib/tiers";
import type { StoreWithId } from "@/types";

/**
 * The side panel: nearby stores, nearest first.
 *
 * Ordered by distance rather than by price. The list is the answer to "which
 * McDonald's are around me"; price is what each row then tells you, through the
 * figure on the right and the tier badge beneath it. See the note in
 * `lib/tiers` for why this is not a price sort.
 *
 * Half of the two-way selection contract: clicking a row selects a store, and a
 * selection made on the map scrolls the matching row into view. Keeping both
 * directions in one component is what stops them drifting apart.
 *
 * A row's History link morphs its name and price into the store page's
 * header (`lib/store-morph`).
 */
/** Name widths for the skeleton rows, so they read as a list rather than a grid. */
const SKELETON_NAME_WIDTHS = ["72%", "58%", "80%", "64%", "52%", "76%"];

/**
 * Stand-in rows while the area's stores load: the same padding and the same
 * three lines as a real row, so the list does not jump when they arrive.
 * Still blocks, with no shimmer; the header already says it is looking, and
 * nothing on the site loops.
 */
export function StoreListSkeleton() {
  return (
    <ul aria-hidden="true" className="divide-y divide-rule">
      {SKELETON_NAME_WIDTHS.map((width, index) => (
        <li key={index} className="px-4 py-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="my-1 h-4 rounded bg-paper-sunken" style={{ width }} />
              <div className="mt-1.5 h-3 w-24 rounded bg-paper-sunken" />
            </div>
            <div className="flex shrink-0 flex-col items-end gap-1.5 pt-1">
              <div className="h-5 w-12 rounded bg-paper-sunken" />
              <div className="h-3 w-20 rounded bg-paper-sunken" />
            </div>
          </div>
          <div className="mt-2 flex min-h-11 items-center">
            <div className="h-6 w-28 rounded-full bg-paper-sunken" />
          </div>
        </li>
      ))}
    </ul>
  );
}

export function StoreList({
  stores,
  visibleIds,
  center,
  selectedId,
  onSelect,
}: {
  /** Every store in the area. Tiers are ranked across all of them. */
  stores: readonly StoreWithId[];
  /** The ones a search left on screen, or null when nothing is searched. */
  visibleIds: ReadonlySet<string> | null;
  center: LatLng;
  selectedId: string | null;
  onSelect: (storeId: string) => void;
}) {
  // Distance is measured once per store and carried through the sort, rather
  // than recomputed for the row that displays it. A search hides rows but
  // never re-ranks: a store's tier is about the whole area, not the results.
  const ordered = stores
    .filter((store) => visibleIds === null || visibleIds.has(store.id))
    .map((store) => ({ store, miles: distanceMeters(center, store) / 1609.344 }))
    .sort((a, b) => a.miles - b.miles);

  const tiers = assignTiers(stores);
  const listRef = useRef<HTMLUListElement>(null);
  const router = useRouter();

  // Map selection scrolls the panel. `nearest` rather than `center` so a click
  // on an already-visible row does not yank the list under the user's cursor.
  useEffect(() => {
    if (selectedId === null || listRef.current === null) return;
    const row = listRef.current.querySelector<HTMLElement>(`[data-store-id="${selectedId}"]`);
    row?.scrollIntoView({ block: "nearest", behavior: "auto" });
  }, [selectedId]);

  if (ordered.length === 0) return null;

  return (
    <ul ref={listRef} className="divide-y divide-rule">
      {ordered.map(({ store, miles }) => {
        const state = displayStateFor(store);
        const tier = tiers.get(store.id) ?? null;
        const presentation = tier === null ? null : TIER_PRESENTATION[tier];
        const isSelected = store.id === selectedId;
        const label = storeLabel(store);

        return (
          <li key={store.id} data-store-id={store.id}>
            <div
              // `.map-row`: a hover shade, and an accent bar that grows in down
              // the left edge of the selected store.
              data-selected={isSelected || undefined}
              className={`map-row px-4 py-3 transition-colors duration-150 ease-out motion-reduce:transition-none ${
                isSelected ? "bg-paper-sunken" : "bg-transparent"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <button
                  type="button"
                  onClick={() => onSelect(store.id)}
                  aria-pressed={isSelected}
                  // 44px minimum target, and the whole label is the target.
                  className="press -m-1 min-h-11 min-w-0 flex-1 rounded p-1 text-left"
                >
                  <span data-morph-source="name" className="block w-fit font-medium">
                    {label.text}
                    {label.qualifier !== null ? (
                      <span className="font-normal text-ink-subtle">
                        {" "}
                        ({label.qualifier})
                      </span>
                    ) : null}
                  </span>
                  <span className="mt-0.5 block text-xs text-ink-subtle">
                    {miles < 0.1 ? "less than 0.1" : miles.toFixed(1)} miles away
                  </span>
                </button>

                {/* Capped, so a long source line ("from MenuPriceTracker · 17
                    visitor prices on file") wraps under the price instead of
                    squeezing the address to one word a line. */}
                <div className="max-w-[10.5rem] shrink-0 text-right">
                  {store.priceCents === null ? (
                    <span className="tabular text-lg text-ink-subtle" aria-hidden="true">
                      —
                    </span>
                  ) : (
                    <span data-morph-source="price" className="tabular ml-auto block w-fit text-lg font-medium">
                      {formatCents(store.priceCents)}
                    </span>
                  )}
                  {/* A store nobody has reported carries a "No prices yet"
                      badge below; saying "no confirmed prices" here as well
                      would be the same fact twice in one row. */}
                  {store.priceCents === null && store.reportCount === 0 ? null : (
                    <Confidence
                      sampleCount={store.confirmedCount}
                      totalCount={store.reportCount}
                      priceFeed={store.priceFeed}
                    />
                  )}
                </div>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-2">
                {state === "priced" && presentation !== null ? (
                  // Glyph plus words. The colour is the third signal, not the only one.
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full border border-rule bg-paper-raised px-2.5 py-1 text-xs font-medium"
                    style={{ color: presentation.colorVar }}
                  >
                    <span aria-hidden="true">{presentation.glyph}</span>
                    {presentation.label}
                  </span>
                ) : (
                  <StoreStateBadge state={state} pricedAt={store.pricedAt} />
                )}

                <Link
                  href={`/store/${store.id}`}
                  onNavigate={(event) =>
                    morphToStore(
                      event,
                      router,
                      `/store/${store.id}`,
                      listRef.current?.querySelector(`[data-store-id="${store.id}"]`),
                    )
                  }
                  className="link-prose ml-auto inline-flex min-h-11 items-center px-1 text-sm"
                >
                  History
                </Link>
              </div>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
