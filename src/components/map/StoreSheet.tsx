"use client";

import { X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { Confidence } from "@/components/ui/Confidence";
import { FeedCredit } from "@/components/ui/FeedCredit";
import { Odometer } from "@/components/ui/Odometer";
import { Sparkline } from "@/components/ui/Sparkline";
import { StoreStateBadge } from "@/components/ui/StoreStateBadge";
import { formatCents } from "@/lib/money";
import { priceAge } from "@/lib/provenance";
import { storeLabel, storeLabelText } from "@/lib/store-label";
import { morphToStore } from "@/lib/store-morph";
import { displayStateFor } from "@/lib/tiers";
import type { StoreWithId, Submission } from "@/types";

/**
 * The detail sheet opened by selecting a store.
 *
 * It springs in from the edge it is docked to (a short spring with a little
 * overshoot, about 340ms) and leaves faster, in 190ms, because a dismissal
 * that lingers feels like the interface arguing. It starts at `scale(0.98)`
 * rather than `scale(0)`, so the card arrives rather than materialises. The
 * price rolls up on odometer wheels as it opens.
 *
 * When the user prefers reduced motion, `initial={false}` skips the entrance
 * entirely rather than merely shortening it.
 *
 * Following either link to the store page morphs the sheet's name and price
 * into that page's header (`lib/store-morph`).
 */
/** Whether the sheet is docked to the right (640px and up) rather than the bottom. */
function useWideScreen(): boolean {
  const [wide, setWide] = useState(false);
  useEffect(() => {
    const query = window.matchMedia("(min-width: 640px)");
    const update = () => setWide(query.matches);
    update();
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);
  return wide;
}

function StoreHeading({ store }: { store: StoreWithId }) {
  const { text, qualifier } = storeLabel(store);

  return (
    <h2 data-morph-source="name" className="w-fit font-display text-lg leading-snug">
      {text}
      {qualifier !== null ? (
        <span className="text-sm text-ink-subtle"> ({qualifier})</span>
      ) : null}
    </h2>
  );
}

export function StoreSheet({
  store,
  onClose,
}: {
  store: StoreWithId | null;
  onClose: () => void;
}) {
  const reducedMotion = useReducedMotion() ?? false;
  const wide = useWideScreen();
  const router = useRouter();
  const sheetRef = useRef<HTMLElement>(null);

  /**
   * History is stored with the id it belongs to rather than on its own.
   *
   * Selecting a second store before its fetch resolves would otherwise leave
   * the first store's sparkline on screen under the second store's name — a
   * wrong chart is worse than no chart.
   */
  const [history, setHistory] = useState<{
    storeId: string;
    submissions: Submission[];
  } | null>(null);

  useEffect(() => {
    if (store === null) return;

    let cancelled = false;
    void (async () => {
      try {
        const response = await fetch(`/api/stores/${encodeURIComponent(store.id)}/history`);
        if (!response.ok) return;
        const body = await response.json();
        if (!cancelled) {
          setHistory({ storeId: store.id, submissions: body.submissions ?? [] });
        }
      } catch {
        // A missing sparkline is not worth an error state — the numbers above
        // it are the substance and they are already on screen.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [store]);

  const submissions =
    store !== null && history?.storeId === store.id ? history.submissions : [];

  // Escape closes, as it must for anything overlaying content.
  useEffect(() => {
    if (store === null) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [store, onClose]);

  return (
    <AnimatePresence>
      {store !== null ? (
        <motion.aside
          ref={sheetRef}
          key={store.id}
          role="dialog"
          aria-label={`Price detail for ${storeLabelText(store)}`}
          // Springs up from the bottom edge on a phone and in from the right
          // on a wide screen: the side it is docked to.
          initial={
            reducedMotion ? false : wide ? { opacity: 0, x: 28, scale: 0.98 } : { opacity: 0, y: 28, scale: 0.98 }
          }
          animate={{ opacity: 1, x: 0, y: 0, scale: 1 }}
          exit={
            reducedMotion
              ? { opacity: 1 }
              : {
                  opacity: 0,
                  ...(wide ? { x: 12 } : { y: 12 }),
                  scale: 0.98,
                  transition: { duration: 0.19, ease: [0.165, 0.84, 0.44, 1] },
                }
          }
          transition={reducedMotion ? { duration: 0 } : { type: "spring", visualDuration: 0.34, bounce: 0.2 }}
          // Only transform and opacity animate — never width, height, or offsets
          // that would force layout on every frame.
          style={{ willChange: reducedMotion ? "auto" : "transform, opacity" }}
          className="pointer-events-auto absolute inset-x-3 bottom-3 z-[1000] rounded-xl border border-rule bg-paper-raised p-4 shadow-[0_1px_2px_rgb(21_20_15/0.08),0_18px_40px_-12px_rgb(21_20_15/0.28)] sm:inset-x-auto sm:right-4 sm:w-96"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <StoreHeading store={store} />
            </div>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close price detail"
              className="sheet-close press -m-1 inline-flex size-11 shrink-0 items-center justify-center rounded-md"
            >
              <X aria-hidden="true" className="size-5" />
            </button>
          </div>

          <div className="mt-3 flex items-end gap-3">
            {store.priceCents === null ? (
              <p className="text-ink-muted">No prices submitted yet.</p>
            ) : (
              <>
                {/* Rolls up on wheels each time a store's sheet opens. */}
                <Odometer
                  roll="load"
                  morph="source"
                  value={formatCents(store.priceCents)}
                  className="tabular text-3xl font-medium"
                />
                <span className="pb-1 text-sm text-ink-subtle">current</span>
              </>
            )}
          </div>

          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
            <Confidence
              sampleCount={store.confirmedCount}
              totalCount={store.reportCount}
              priceFeed={store.priceFeed}
            />
            {store.pricedAt !== null ? (
              <span className="text-xs text-ink-subtle">
                {priceAge(store, "last updated")}
              </span>
            ) : null}
          </div>
          <FeedCredit feed={store.priceFeed} observedAt={store.pricedAt} className="mt-1 text-xs text-ink-subtle" />

          <div className="mt-3">
            <StoreStateBadge
              state={displayStateFor(store)}
              pricedAt={store.pricedAt}
            />
          </div>

          <div className="mt-4 border-t border-rule pt-3">
            <Sparkline submissions={submissions} />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <Link
              href={`/store/${store.id}`}
              onNavigate={(event) => morphToStore(event, router, `/store/${store.id}`, sheetRef.current)}
              className="btn-primary press inline-flex min-h-11 flex-1 items-center justify-center rounded-md bg-accent px-4 py-2 font-medium text-accent-ink"
            >
              Log a price
              <span className="btn-arrow ml-2" aria-hidden="true">→</span>
            </Link>
            <Link
              href={`/store/${store.id}`}
              onNavigate={(event) => morphToStore(event, router, `/store/${store.id}`, sheetRef.current)}
              className="btn-quiet press inline-flex min-h-11 items-center justify-center rounded-md border border-rule-strong px-4 py-2 font-medium"
            >
              Full history
            </Link>
          </div>
        </motion.aside>
      ) : null}
    </AnimatePresence>
  );
}
