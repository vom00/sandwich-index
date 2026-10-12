"use client";

import L from "leaflet";
import { useEffect, useMemo } from "react";
import { MapContainer, Marker, TileLayer, useMap } from "react-leaflet";

import type { LatLng } from "@/lib/geohash";
import { formatCents } from "@/lib/money";
import { provenanceSummary } from "@/lib/provenance";
import { storeLabelText } from "@/lib/store-label";
import {
  TIER_PRESENTATION,
  assignTiers,
  displayStateFor,
  type PriceTier,
  type StoreDisplayState,
} from "@/lib/tiers";
import type { StoreWithId } from "@/types";

import "leaflet/dist/leaflet.css";

/**
 * The Leaflet map. Rendered only on the client — Leaflet reaches for `window`
 * at module scope, so this file must never be imported from a server component.
 * See MapExperience for the dynamic import that enforces that.
 *
 * Markers are `divIcon`s rather than image pins for two reasons: the price has
 * to be legible without a click, and the tier has to be readable without
 * relying on colour.
 */

interface MapCanvasProps {
  center: LatLng;
  /** Every store in the area. Tiers are ranked across all of them. */
  stores: readonly StoreWithId[];
  /** The ones a search left on screen, or null when nothing is searched. */
  visibleIds: ReadonlySet<string> | null;
  selectedId: string | null;
  onSelect: (storeId: string) => void;
}

const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
/** OSM tile usage policy requires visible attribution. */
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Build a marker.
 *
 * The visible pill sits inside a 44px-tall transparent box so the touch target
 * meets the minimum without inflating the pill itself.
 */
function buildIcon(
  store: StoreWithId,
  tier: PriceTier | null,
  state: StoreDisplayState,
  isSelected: boolean,
): L.DivIcon {
  const priceLabel =
    store.priceCents === null ? "—" : formatCents(store.priceCents);

  const presentation = tier === null ? null : TIER_PRESENTATION[tier];

  // The glyph is what keeps the tier readable in greyscale and under every
  // form of colour blindness. Colour alone would fail those users entirely.
  const glyph = state === "unmeasured" ? "?" : state === "stale" ? "◷" : presentation?.glyph ?? "●";

  const color =
    state === "priced" && presentation !== null
      ? presentation.colorVar
      : "var(--color-stale)";

  const ariaParts = [
    store.name,
    storeLabelText(store),
    state === "unmeasured"
      ? "no prices submitted yet"
      : state === "stale"
        ? `${priceLabel}, price is stale`
        : `${priceLabel}, ${presentation?.label ?? ""}`,
    provenanceSummary(store),
  ];

  const width = Math.max(64, priceLabel.length * 10 + 34);

  // No role or tabindex here. Leaflet already renders the marker element with
  // role="button" and tabindex="0"; repeating them on a child would announce
  // two nested buttons and would swallow the pointer event before Leaflet's own
  // handler saw it. The aria-label stays, because a button named from its
  // contents picks up a descendant's label.
  const html = `
    <span class="marker-hit" aria-label="${escapeHtml(ariaParts.join(", "))}">
      <span class="marker-pill${isSelected ? " marker-pill--selected" : ""}${
        state !== "priced" ? " marker-pill--muted" : ""
      }" style="--pill-color:${color}">
        <span class="marker-glyph" aria-hidden="true">${glyph}</span>
        <span class="marker-price tabular">${escapeHtml(priceLabel)}</span>
      </span>
    </span>`;

  return L.divIcon({
    html,
    // Leaflet's default divIcon class paints a white box with a border.
    className: "",
    iconSize: [width, 44],
    iconAnchor: [width / 2, 44],
  });
}

/**
 * Keeps the viewport in step with the selection and the search centre.
 *
 * Panning is instant when the user prefers reduced motion — an animated pan is
 * a large, unavoidable movement across the whole viewport, which is exactly the
 * kind of motion that setting exists to suppress.
 */
function ViewportSync({
  center,
  selected,
  reducedMotion,
}: {
  center: LatLng;
  selected: StoreWithId | null;
  reducedMotion: boolean;
}) {
  const map = useMap();

  useEffect(() => {
    map.setView([center.lat, center.lng], map.getZoom(), { animate: false });
  }, [map, center.lat, center.lng]);

  useEffect(() => {
    if (selected === null) return;
    map.panTo([selected.lat, selected.lng], { animate: !reducedMotion, duration: 0.25 });
  }, [map, selected, reducedMotion]);

  return null;
}

/**
 * Frames the stores a search found, and goes back to the area view when the
 * search is cleared. Keyed on the set of ids, so typing a letter that leaves
 * the same results doesn't move the map.
 */
function FitToResults({
  center,
  matches,
  reducedMotion,
}: {
  center: LatLng;
  matches: readonly StoreWithId[] | null;
  reducedMotion: boolean;
}) {
  const map = useMap();
  const key = matches === null ? null : matches.map((store) => store.id).join(",");

  useEffect(() => {
    if (key === null) return;
    if (matches === null || matches.length === 0) return;
    const bounds = L.latLngBounds(matches.map((store) => [store.lat, store.lng] as [number, number]));
    map.fitBounds(bounds, { padding: [48, 48], maxZoom: 14, animate: !reducedMotion });
    // `matches` is read through `key`; depending on the array would refit on
    // every render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [map, key, reducedMotion]);

  const searching = key !== null;
  useEffect(() => {
    if (searching) return;
    map.setView([center.lat, center.lng], 11, { animate: !reducedMotion });
    // Only when a search ends; ViewportSync owns the centre otherwise.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searching]);

  return null;
}

/**
 * Leaflet measures the container on creation. When the map is inside a layout
 * that settles after mount, that measurement is wrong and the tiles render into
 * a grey band. Invalidating once on mount and on resize fixes it.
 */
function SizeGuard() {
  const map = useMap();

  useEffect(() => {
    const invalidate = () => map.invalidateSize();
    invalidate();

    const observer = new ResizeObserver(invalidate);
    observer.observe(map.getContainer());
    return () => observer.disconnect();
  }, [map]);

  return null;
}

export default function MapCanvas({
  center,
  stores,
  visibleIds,
  selectedId,
  onSelect,
}: MapCanvasProps) {
  const tiers = useMemo(() => assignTiers(stores), [stores]);
  const shown = useMemo(
    () => (visibleIds === null ? stores : stores.filter((store) => visibleIds.has(store.id))),
    [stores, visibleIds],
  );
  const reducedMotion =
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const selected = stores.find((store) => store.id === selectedId) ?? null;

  return (
    <MapContainer
      center={[center.lat, center.lng]}
      zoom={11}
      scrollWheelZoom
      className="size-full"
      // Reserved by the parent; stated here too so Leaflet never measures zero.
      style={{ minHeight: "100%" }}
      // Leaflet ships its own zoom, pan and tile-fade transitions, and its CSS
      // knows nothing about prefers-reduced-motion. A zoom animation moves the
      // entire viewport, which is the single largest piece of motion on the
      // site — turning it off at the source is the only honest way to claim
      // nothing here animates against the user's wishes. globals.css also
      // neutralises the stylesheet, for a preference changed mid-session.
      zoomAnimation={!reducedMotion}
      fadeAnimation={!reducedMotion}
      markerZoomAnimation={!reducedMotion}
    >
      <TileLayer url={TILE_URL} attribution={TILE_ATTRIBUTION} maxZoom={19} />

      <SizeGuard />
      <ViewportSync center={center} selected={selected} reducedMotion={reducedMotion} />
      <FitToResults center={center} matches={visibleIds === null ? null : shown} reducedMotion={reducedMotion} />

      {shown.map((store) => {
        const state = displayStateFor(store);
        return (
          <Marker
            key={store.id}
            position={[store.lat, store.lng]}
            icon={buildIcon(store, tiers.get(store.id) ?? null, state, store.id === selectedId)}
            // Selected marker sits above its neighbours so it is never hidden.
            zIndexOffset={store.id === selectedId ? 1000 : 0}
            eventHandlers={{ click: () => onSelect(store.id) }}
          />
        );
      })}
    </MapContainer>
  );
}
