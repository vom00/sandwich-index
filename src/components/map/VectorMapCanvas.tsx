"use client";

import * as maplibregl from "maplibre-gl";
import type { Map as MapLibreMap, Marker } from "maplibre-gl";
import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";

import { pillParts } from "@/components/map/pill";
import type { LatLng } from "@/lib/geohash";
import { paperInkStyle, type VectorTileSource } from "@/lib/map-style";
import { placePills, rankPills } from "@/lib/pill-layout";
import { assignTiers, displayStateFor } from "@/lib/tiers";
import type { StoreWithId } from "@/types";

import "maplibre-gl/dist/maplibre-gl.css";

/**
 * The vector map (MapLibre GL), drawn in the site's paper and ink
 * (`lib/map-style`). Behind a flag until the owner approves a tile source
 * (docs/plans/vector-map.md); the Leaflet map (`MapCanvas`) is the default
 * and takes the same props.
 *
 * What it keeps from the Leaflet map: the price pills as HTML buttons with the
 * same markup (`pill.ts`), their drop-in once per map, nearest first, and the
 * same viewport rules for a selection and a search, all without motion under
 * reduced motion. What it adds: pills that would overlap are hidden until a
 * zoom gives them room (`lib/pill-layout`), so no two 44px targets overlap.
 */

interface VectorMapCanvasProps {
  center: LatLng;
  stores: readonly StoreWithId[];
  visibleIds: ReadonlySet<string> | null;
  selectedId: string | null;
  onSelect: (storeId: string) => void;
  /** The tile source; null draws the paper ground alone. */
  tiles: VectorTileSource | null;
}

// MapLibre 6 starts its worker from a file beside its own module, which a
// bundler moves; point it at the worker as Turbopack emits it.
maplibregl.setWorkerUrl(new URL("maplibre-gl/dist/maplibre-gl-worker.mjs", import.meta.url).href);

/** Timing tokens (globals.css): a pan is `--duration-modal`, a change of view `--duration-hero`. */
const PAN_MS = 240;
const VIEW_MS = 600;
const easeOutQuart = (t: number) => 1 - (1 - t) ** 4;

/** The drop-in, as on the Leaflet map: ten 35ms steps at most, 220ms each. */
const DROP_STEP_MS = 35;
const DROP_STEPS = 10;
const DROP_MS = 220;

interface PillEntry {
  id: string;
  marker: Marker;
  element: HTMLButtonElement;
  lngLat: [number, number];
  /** What the pill shows; its markup is rewritten only when this changes. */
  key: string;
  width: number;
  selected: boolean;
  standing: 0 | 1 | 2;
  priceCents: number | null;
  shown: boolean;
}

function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function canDrawWebGl(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return Boolean(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

export default function VectorMapCanvas({ center, stores, visibleIds, selectedId, onSelect, tiles }: VectorMapCanvasProps) {
  const container = useRef<HTMLDivElement>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const pills = useRef(new Map<string, PillEntry>());
  const onSelectRef = useRef(onSelect);
  const dropped = useRef(false);
  const [drawable] = useState(canDrawWebGl);

  const tiers = useMemo(() => assignTiers(stores), [stores]);
  const shown = useMemo(
    () => (visibleIds === null ? stores : stores.filter((store) => visibleIds.has(store.id))),
    [stores, visibleIds],
  );

  useEffect(() => {
    onSelectRef.current = onSelect;
  }, [onSelect]);

  /** Shows the pills that have room and hides the rest (`lib/pill-layout`). */
  const layout = useRef(() => {
    const map = mapRef.current;
    if (map === null) return;
    const box = map.getContainer();
    const width = box.clientWidth;
    const height = box.clientHeight;
    const entries = [...pills.current.values()];
    const at = new Map(entries.map((entry) => [entry.id, map.project(entry.lngLat)]));
    const order = rankPills(
      entries.map((entry) => {
        const point = at.get(entry.id)!;
        return {
          id: entry.id,
          selected: entry.selected,
          standing: entry.standing,
          priceCents: entry.priceCents,
          distance: Math.hypot(point.x - width / 2, point.y - height / 2),
        };
      }),
    );
    const visible = placePills(
      order.map((id) => {
        const point = at.get(id)!;
        return { id, x: point.x, y: point.y, width: pills.current.get(id)!.width, height: 44 };
      }),
      { width, height },
    );
    for (const entry of entries) {
      const next = visible.has(entry.id);
      if (next === entry.shown) continue;
      entry.shown = next;
      // Hidden from sight, from the tab order and from screen readers alike;
      // the list beside the map still has the store.
      entry.element.style.visibility = next ? "" : "hidden";
      entry.element.inert = !next;
      entry.element.toggleAttribute("data-collided", !next);
    }
  });

  // The map, once. Its centre and tiles are where it starts; later changes to
  // the centre are followed below. A layout effect, declared first, so the map
  // exists before the pills' layout effect runs in the same commit.
  useLayoutEffect(() => {
    if (!drawable || container.current === null) return;
    const reduced = prefersReducedMotion();
    const map = new maplibregl.Map({
      container: container.current,
      style: paperInkStyle(tiles),
      center: [center.lng, center.lat],
      zoom: 11,
      minZoom: 3,
      maxZoom: 18,
      attributionControl: { compact: true },
      // Labels fade in as tiles arrive; under reduced motion they are simply there.
      fadeDuration: reduced ? 0 : 200,
      dragRotate: false,
      pitchWithRotate: false,
      touchPitch: false,
    });
    map.touchZoomRotate.disableRotation();
    map.keyboard.disableRotation();
    map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-left");
    mapRef.current = map;

    let frame = 0;
    const relayout = () => {
      if (frame !== 0) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        layout.current();
      });
    };
    map.on("move", relayout);
    map.on("resize", relayout);

    const entries = pills.current;
    return () => {
      cancelAnimationFrame(frame);
      map.remove();
      mapRef.current = null;
      entries.clear();
      // The drop-in is once per map, and this one is gone: a map made again
      // (React's development remount does exactly this) drops its pills too.
      dropped.current = false;
    };
    // Mount only: the centre and tiles are its starting point.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawable]);

  // The pills. A layout effect, so a new pill is placed, laid out and (the
  // first time) set dropping before the frame that would first paint it.
  useLayoutEffect(() => {
    const map = mapRef.current;
    if (map === null) return;
    const entries = pills.current;
    const keep = new Set(shown.map((store) => store.id));
    for (const [id, entry] of entries) {
      if (keep.has(id)) continue;
      entry.marker.remove();
      entries.delete(id);
    }

    for (const store of shown) {
      const state = displayStateFor(store);
      const selected = store.id === selectedId;
      const parts = pillParts(store, tiers.get(store.id) ?? null, state, selected);
      let entry = entries.get(store.id);
      if (entry === undefined) {
        const element = document.createElement("button");
        element.type = "button";
        element.className = "vmap-marker";
        element.dataset.storeId = store.id;
        element.addEventListener("click", (event) => {
          event.stopPropagation();
          onSelectRef.current(store.id);
        });
        const lngLat: [number, number] = [store.lng, store.lat];
        const marker = new maplibregl.Marker({ element, anchor: "bottom" }).setLngLat(lngLat).addTo(map);
        entry = { id: store.id, marker, element, lngLat, key: "", width: 0, selected, standing: 2, priceCents: null, shown: true };
        entries.set(store.id, entry);
      }
      const key = `${parts.html}|${parts.label}`;
      if (entry.key !== key) {
        entry.element.innerHTML = parts.html;
        entry.element.setAttribute("aria-label", parts.label);
        entry.element.style.width = `${parts.width}px`;
        entry.key = key;
      }
      entry.width = parts.width;
      entry.selected = selected;
      entry.standing = state === "priced" ? 0 : state === "stale" ? 1 : 2;
      entry.priceCents = store.priceCents;
      // The selected pill sits above its neighbours so it is never hidden.
      entry.element.style.zIndex = selected ? "1" : "";
    }
    layout.current();

    if (!dropped.current && entries.size > 0) {
      dropped.current = true;
      if (!prefersReducedMotion()) drop(map, [...entries.values()].filter((entry) => entry.shown));
    }
  }, [shown, tiers, selectedId]);

  // Follow the search centre without moving the zoom.
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    mapRef.current?.jumpTo({ center: [center.lng, center.lat] });
  }, [center.lat, center.lng]);

  const selected = stores.find((store) => store.id === selectedId) ?? null;
  useEffect(() => {
    if (selected === null) return;
    mapRef.current?.panTo([selected.lng, selected.lat], {
      duration: prefersReducedMotion() ? 0 : PAN_MS,
      easing: easeOutQuart,
    });
  }, [selected]);

  // Frame what a search found; go back to the area view when it is cleared.
  const matchKey = visibleIds === null ? null : shown.map((store) => store.id).join(",");
  const searching = matchKey !== null;
  useEffect(() => {
    const map = mapRef.current;
    if (map === null || matchKey === null || shown.length === 0) return;
    const bounds = new maplibregl.LngLatBounds();
    for (const store of shown) bounds.extend([store.lng, store.lat]);
    map.fitBounds(bounds, { padding: 48, maxZoom: 14, duration: prefersReducedMotion() ? 0 : VIEW_MS, easing: easeOutQuart });
    // `shown` is read through `matchKey`; depending on the array would refit on every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [matchKey]);
  const wasSearching = useRef(false);
  useEffect(() => {
    if (searching) {
      wasSearching.current = true;
      return;
    }
    if (!wasSearching.current) return;
    wasSearching.current = false;
    mapRef.current?.easeTo({
      center: [center.lng, center.lat],
      zoom: 11,
      duration: prefersReducedMotion() ? 0 : VIEW_MS,
      easing: easeOutQuart,
    });
    // Only when a search ends; the centre effect owns the centre otherwise.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searching]);

  if (!drawable) {
    return (
      <div className="flex size-full items-center justify-center bg-paper-sunken p-6 text-center text-sm text-ink-muted">
        This browser can&rsquo;t draw the map. Every store is in the list.
      </div>
    );
  }

  return (
    <div className="relative size-full">
      <div ref={container} className="vmap size-full" />
      {tiles === null && process.env.NODE_ENV !== "production" ? (
        <p className="pointer-events-none absolute bottom-2 left-2 rounded-md bg-paper-raised/90 px-2 py-1 font-mono text-[11px] text-ink-subtle">
          No base map: the tile source is waiting for approval. Preview one with ?tiles=&lt;TileJSON URL&gt;.
        </p>
      ) : null}
    </div>
  );
}

/** Drops the shown pills in, nearest the middle first, as the Leaflet map does. */
function drop(map: MapLibreMap, entries: readonly PillEntry[]) {
  const box = map.getContainer();
  const middle = { x: box.clientWidth / 2, y: box.clientHeight / 2 };
  const ranked = entries
    .map((entry) => {
      const point = map.project(entry.lngLat);
      return { entry, distance: Math.hypot(point.x - middle.x, point.y - middle.y) };
    })
    .sort((a, b) => a.distance - b.distance);
  const easing = getComputedStyle(box).getPropertyValue("--ease-out-quart").trim() || "cubic-bezier(0.165, 0.84, 0.44, 1)";
  const lastStep = Math.min(ranked.length - 1, DROP_STEPS - 1);
  ranked.forEach(({ entry }, rank) => {
    const pill = entry.element.querySelector<HTMLElement>(".marker-pill");
    if (pill === null) return;
    const step = ranked.length > 1 ? Math.round((rank / (ranked.length - 1)) * lastStep) : 0;
    pill.animate(
      [
        { opacity: 0, transform: "translateY(-10px)" },
        { opacity: 1, transform: "none" },
      ],
      { duration: DROP_MS, delay: step * DROP_STEP_MS, easing, fill: "backwards" },
    );
  });
}
