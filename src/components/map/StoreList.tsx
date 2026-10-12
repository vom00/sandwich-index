"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";

import { Confidence } from "@/components/ui/Confidence";
import { StoreStateBadge } from "@/components/ui/StoreStateBadge";
import { distanceMeters, type LatLng } from "@/lib/geohash";
import { formatCents } from "@/lib/money";
import { storeLabel } from "@/lib/store-label";
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
 */
export function StoreList({
  stores,
  center,
  selectedId,
  onSelect,
}: {
  stores: readonly StoreWithId[];
  center: LatLng;
  selectedId: string | null;
  onSelect: (storeId: string) => void;
}) {
  // Distance is measured once per store and carried through the sort, rather
  // than recomputed for the row that displays it.
  const ordered = stores
    .map((store) => ({ store, miles: distanceMeters(center, store) / 1609.344 }))
    .sort((a, b) => a.miles - b.miles);

  const tiers = assignTiers(stores);
  const listRef = useRef<HTMLUListElement>(null);

  // Map selection scrolls the panel. `nearest` rather than `center` so a click
  // on an already-visible row does not yank the list under the user's cursor.
  useEffect(() => {
    if (selectedId === null || listRef.current === null) return;
    const row = listRef.current.querySelector<HTMLElement>(`[data-store-id="${selectedId}"]`);
    row?.scrollIntoView({ block: "nearest", behavior: "auto" });
  }, [selectedId]);

  if (stores.length === 0) return null;

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
              className={`px-4 py-3 transition-colors duration-150 ease-out motion-reduce:transition-none ${
                isSelected ? "bg-paper-sunken" : "bg-transparent"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <button
                  type="button"
                  onClick={() => onSelect(store.id)}
                  aria-pressed={isSelected}
                  // 44px minimum target, and the whole label is the target.
                  className="press -m-1 min-h-11 flex-1 rounded p-1 text-left"
                >
                  <span className="block font-medium">
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

                <div className="shrink-0 text-right">
                  {store.priceCents === null ? (
                    <span className="tabular text-lg text-ink-subtle" aria-hidden="true">
                      —
                    </span>
                  ) : (
                    <span className="tabular block text-lg font-medium">
                      {formatCents(store.priceCents)}
                    </span>
                  )}
                  <Confidence
                    sampleCount={store.confirmedCount}
                    totalCount={store.reportCount}
                    priceFeed={store.priceFeed}
                  />
                </div>
              </div>

              <div className="mt-2 flex flex-wrap items-center gap-2">
                {state === "priced" && presentation !== null ? (
                  // Glyph plus words. The colour is the third signal, not the only one.
                  <span
                    className="inline-flex items-center gap-1.5 rounded-full border border-rule px-2.5 py-1 text-xs font-medium"
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
                  className="ml-auto inline-flex min-h-11 items-center px-1 text-sm underline decoration-rule underline-offset-2 hover-accent"
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
