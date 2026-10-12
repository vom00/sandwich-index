"use client";

import { LoaderCircle, MapPinOff, RefreshCw } from "lucide-react";
import dynamic from "next/dynamic";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";

import { LocationGate } from "@/components/map/LocationGate";
import { StoreList } from "@/components/map/StoreList";
import { StoreSheet } from "@/components/map/StoreSheet";
import { useGeolocation } from "@/hooks/useGeolocation";
import type { LatLng } from "@/lib/geohash";
import { formatCents } from "@/lib/money";
import { storeLabel } from "@/lib/store-label";
import { rankableStores } from "@/lib/tiers";
import type { StoreWithId } from "@/types";

/**
 * Leaflet touches `window` at module scope, so the map can only ever be loaded
 * in the browser. The skeleton below reserves the full height of the map area,
 * which is what keeps this from contributing layout shift.
 */
const MapCanvas = dynamic(() => import("@/components/map/MapCanvas"), {
  ssr: false,
  loading: () => (
    <div className="flex size-full items-center justify-center bg-paper-sunken">
      <LoaderCircle
        aria-hidden="true"
        className="size-6 animate-spin text-ink-subtle motion-reduce:animate-none"
      />
      <span className="sr-only">Loading map</span>
    </div>
  ),
});

export function MapExperience() {
  const geo = useGeolocation();
  const [stores, setStores] = useState<StoreWithId[]>([]);
  /**
   * Load status as two independent facts rather than one enum.
   *
   * The enum version needed `setPhase("loading")` to run the instant `load()`
   * was called, which meant a synchronous state update inside the effect that
   * starts the load — a cascading render, and something React's own lint rule
   * rightly objects to. Splitting the flags lets every update happen in an
   * async callback, where it belongs, and the two render states below are
   * derived instead of assigned.
   */
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [locationLabel, setLocationLabel] = useState<string | null>(null);
  /**
   * Whether the one-shot restore below has run yet.
   *
   * Until it has, this component genuinely does not know whether the user has a
   * location or not, and rendering the permission gate on that ignorance would
   * flash "Find the cheapest McChicken near you" at somebody who just pressed
   * "Back to the map". `sessionStorage` is unreadable on the server, so a brief
   * neutral state is the price of not guessing.
   */
  const [restoreAttempted, setRestoreAttempted] = useState(false);

  const fetchStores = useCallback(async (position: LatLng): Promise<StoreWithId[]> => {
    const params = new URLSearchParams({
      lat: String(position.lat),
      lng: String(position.lng),
      radiusMiles: "15",
    });
    const response = await fetch(`/api/stores?${params.toString()}`);
    if (!response.ok) throw new Error("Store lookup failed");
    const body = await response.json();
    return body.stores ?? [];
  }, []);

  /**
   * Which load is still allowed to write to state.
   *
   * `load` awaits up to three times and the middle one is an Overpass sync,
   * which is slow enough to have its own spinner. That is a wide window, and
   * "Change location" is reachable throughout it, so an abandoned run could
   * resolve after its replacement and call `setStores` last. The visible result
   * is worse than a stale list: `locationLabel` is set synchronously by the new
   * selection while `stores` came from the old one, so the page renders "Stores
   * near Plano" above Coppell's restaurants — confidently mislabelled rather
   * than obviously broken.
   *
   * Every write below is gated on still being the newest run. A ref rather than
   * state because nothing renders from it and a change must never itself cause
   * a render.
   */
  const loadGeneration = useRef(0);

  const load = useCallback(
    async (position: LatLng) => {
      const generation = ++loadGeneration.current;
      const isCurrent = () => loadGeneration.current === generation;

      // Render whatever is already known immediately, then reconcile against
      // OpenStreetMap in the background. Blocking the map on a third-party API
      // would make every visit as slow as Overpass happens to be today.
      let known: StoreWithId[];
      try {
        known = await fetchStores(position);
      } catch {
        if (isCurrent()) setFailed(true);
        return;
      }
      if (!isCurrent()) return;

      setStores(known);
      setLoaded(true);
      setFailed(false);

      setSyncing(true);
      try {
        const syncResponse = await fetch("/api/stores/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ lat: position.lat, lng: position.lng, radiusMiles: 15 }),
        });

        if (syncResponse.ok) {
          const result = await syncResponse.json();
          // Refetch for new stores, and for addresses the backfill just filled
          // in — a row that silently stops saying "no address on file" is the
          // visible half of that work.
          const changed = result.created > 0 || (result.addresses?.resolved ?? 0) > 0;
          if (changed) {
            const refreshed = await fetchStores(position);
            if (isCurrent()) setStores(refreshed);
          }
        }
      } catch {
        // Background reconciliation only. The list on screen came from our own
        // database and is still perfectly good without it.
      } finally {
        // Not unconditional: a stale run clearing this would hide the spinner
        // belonging to the load that replaced it.
        if (isCurrent()) setSyncing(false);
      }
    },
    [fetchStores],
  );

  // Both entry points start the load themselves. Neither watches `position` and
  // reacts to it — the fetch is caused by the click that produced the
  // coordinates, which is where the cause actually is.
  const handleRequestLocation = useCallback(() => {
    geo.request((position) => void load(position));
  }, [geo, load]);

  const handleManualLocation = useCallback(
    (position: LatLng, label: string) => {
      setLocationLabel(label);
      geo.setManualPosition(position, label);
      void load(position);
    },
    [geo, load],
  );

  /** Back to the gate, and the tab forgets the old position. */
  const handleChangeLocation = useCallback(() => {
    // Abandon any load still in flight. Without this the clearing below is
    // temporary — a sync that resolves afterwards would repopulate the list the
    // user just asked to leave.
    loadGeneration.current += 1;
    setStores([]);
    setLoaded(false);
    setFailed(false);
    setSelectedId(null);
    setLocationLabel(null);
    setSyncing(false);
    geo.reset();
  }, [geo]);

  /**
   * Pick the map back up where the tab left it.
   *
   * Guarded by a ref rather than an empty dependency list: `geo` is a fresh
   * object every render, so an honest dependency list would re-run this, and
   * lying about the dependencies to prevent that hides the intent. The ref says
   * what is actually meant — once per mount.
   */
  const restoreRequested = useRef(false);
  useEffect(() => {
    if (restoreRequested.current) return;
    restoreRequested.current = true;

    geo.restore((position, label) => {
      setLocationLabel(label);
      void load(position);
    });
    setRestoreAttempted(true);
  }, [geo, load]);

  // One frame at most, and only before the restore has been attempted.
  if (!restoreAttempted && geo.position === null) {
    return (
      <main id="main" className="flex min-h-0 flex-1 items-center justify-center py-20">
        <LoaderCircle
          aria-hidden="true"
          className="size-6 animate-spin text-ink-subtle motion-reduce:animate-none"
        />
        <span className="sr-only">Loading the map</span>
      </main>
    );
  }

  if (geo.position === null) {
    return (
      <main id="main">
        <LocationGate
          phase={geo.phase}
          message={geo.message}
          onRequestLocation={handleRequestLocation}
          onManualLocation={handleManualLocation}
        />
      </main>
    );
  }

  const cheapest = rankableStores(stores)[0] ?? null;
  const selected = stores.find((store) => store.id === selectedId) ?? null;

  return (
    // `lg:flex-none` is load-bearing next to the `lg:h-[…]` viewport height
    // (the viewport minus the site header). `flex-1` resolves to
    // `flex: 1 1 0%`, and in a column flex container the basis governs the main
    // axis — the height is simply ignored, so the element keeps growing to fit
    // the store list. Dropping the flex sizing at lg is what makes the height
    // apply, which in turn keeps the map inside the viewport where its markers
    // are actually clickable.
    <main id="main" className="flex min-h-0 flex-1 flex-col lg:h-[calc(100dvh-var(--site-header-height))] lg:flex-none">
      <div className="shrink-0 border-b border-rule bg-paper-raised px-5 py-3 sm:px-8">
        <div className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-2">
          <div>
            <h1 className="font-display text-xl">
              {locationLabel === null
                ? "Stores near you"
                : `Stores near ${locationLabel}`}
            </h1>
            <p className="text-sm text-ink-muted">
              {!loaded && !failed && stores.length === 0
                ? "Looking for stores…"
                : `${stores.length} within 15 miles`}
              {syncing ? (
                <span className="ml-2 inline-flex items-center gap-1 text-ink-subtle">
                  <RefreshCw
                    aria-hidden="true"
                    className="size-3 animate-spin motion-reduce:animate-none"
                  />
                  checking OpenStreetMap
                </span>
              ) : null}
              {/* The tab now remembers where you asked about, which would be a
                  trap without a way out of it. */}
              <button
                type="button"
                onClick={handleChangeLocation}
                className="hover-accent tap-target ml-2 underline decoration-rule underline-offset-2"
              >
                Change location
              </button>
            </p>
          </div>

          {/* Grouped so the header row keeps exactly two flex children. A third
              would be spread by `justify-between` and strand itself mid-row. */}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-2">
            {cheapest !== null ? (
              <p className="text-sm">
                <span className="text-ink-subtle">Cheapest nearby </span>
                <span className="tabular font-medium">
                  {formatCents(cheapest.priceCents ?? 0)}
                </span>
                <span className="text-ink-subtle"> · {storeLabel(cheapest).text}</span>
              </p>
            ) : null}

            <Link
              href="/log"
              className="press inline-flex min-h-11 shrink-0 items-center rounded-md border border-rule-strong px-4 py-2 text-sm font-medium"
            >
              Log several at once
            </Link>
          </div>
        </div>
      </div>

      <div className="flex min-h-0 flex-1 flex-col lg:flex-row">
        <aside
          aria-label="Nearby stores, nearest first"
          className="order-2 w-full border-rule bg-paper-raised lg:order-1 lg:w-96 lg:shrink-0 lg:overflow-y-auto lg:border-r"
        >
          {failed && stores.length === 0 ? (
            <EmptyState
              title="We could not load stores"
              body="Something went wrong reaching the database. Your connection may be down."
              action={
                <button
                  type="button"
                  onClick={() => geo.position !== null && void load(geo.position)}
                  className="press inline-flex min-h-11 items-center rounded-md border border-rule-strong px-4 py-2 font-medium"
                >
                  Try again
                </button>
              }
            />
          ) : stores.length === 0 && loaded ? (
            <EmptyState
              title="No stores tracked here yet"
              body="We have no McDonald's locations on file within fifteen miles. That usually means OpenStreetMap has not been checked for this area yet, or there genuinely are none nearby."
            />
          ) : (
            <StoreList
              stores={stores}
              center={geo.position}
              selectedId={selectedId}
              onSelect={setSelectedId}
            />
          )}
        </aside>

        {/* Height reserved at every breakpoint so the map cannot shift the page
            as Leaflet initialises. */}
        <div className="relative order-1 h-[45vh] min-h-[320px] w-full lg:order-2 lg:h-auto lg:min-h-0 lg:flex-1">
          <MapCanvas
            center={geo.position}
            stores={stores}
            selectedId={selectedId}
            onSelect={setSelectedId}
          />
          <StoreSheet store={selected} onClose={() => setSelectedId(null)} />
        </div>
      </div>
    </main>
  );
}

function EmptyState({
  title,
  body,
  action,
}: {
  title: string;
  body: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="px-5 py-10 text-center">
      <MapPinOff aria-hidden="true" className="mx-auto size-6 text-ink-subtle" />
      <h2 className="mt-3 font-display text-lg">{title}</h2>
      <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-ink-muted">{body}</p>
      {action !== undefined ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
