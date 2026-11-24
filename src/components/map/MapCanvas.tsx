"use client";

import L from "leaflet";
import { useEffect, useMemo, useRef } from "react";
import { MapContainer, Marker, TileLayer, useMap } from "react-leaflet";

import { escapeHtml, pillParts } from "@/components/map/pill";
import type { LatLng } from "@/lib/geohash";
import {
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

/** Standard OpenStreetMap tiles, toned down to paper in globals.css (`.leaflet-tile-pane`). */
const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
/** OSM tile usage policy requires visible attribution. */
const TILE_ATTRIBUTION =
  '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors';

/**
 * Build a marker.
 *
 * The visible pill (`pill.ts`, shared with the vector map) sits inside a
 * 44px-tall transparent box so the touch target meets the minimum without
 * inflating the pill itself.
 */
function buildIcon(
  store: StoreWithId,
  tier: PriceTier | null,
  state: StoreDisplayState,
  isSelected: boolean,
): L.DivIcon {
  const { html: pill, label, width } = pillParts(store, tier, state, isSelected);

  // No role or tabindex here. Leaflet already renders the marker element with
  // role="button" and tabindex="0"; repeating them on a child would announce
  // two nested buttons and would swallow the pointer event before Leaflet's own
  // handler saw it. The aria-label stays, because a button named from its
  // contents picks up a descendant's label.
  const html = `<span class="marker-hit" aria-label="${escapeHtml(label)}">${pill}</span>`;

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

/** One step of the drop-in stagger, and at most this many steps. */
const DROP_STEP_MS = 35;
const DROP_STEPS = 10;
/** Standard UI duration: a pill is interface, not a figure. */
const DROP_MS = 220;

/**
 * The price pills drop into place once, the first time an area's stores are
 * on the map: nearest the centre first, rippling outward in at most ten
 * 35ms steps however many stores there are. It plays from here, once per
 * map, so nothing else (a selection, a search, a background sync redrawing
 * the pills) can replay it. Under reduced motion the pills are simply there.
 *
 * It starts in the next animation frame, which runs before that frame is
 * painted, so no pill is seen before it drops. Not sooner: react-leaflet adds
 * each marker in an effect, and in development React adds new ones, removes
 * them and adds them again, so pills found any earlier may already be gone.
 */
function DropIn({ ready }: { ready: boolean }) {
  const map = useMap();
  const played = useRef(false);

  useEffect(() => {
    if (!ready || played.current) return;
    const frame = requestAnimationFrame(() => {
      played.current = true;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      drop(map);
    });
    return () => cancelAnimationFrame(frame);
  }, [map, ready]);

  return null;
}

/** Drops every pill on the map in, nearest the centre first. */
function drop(map: L.Map) {
  const container = map.getContainer();
  const box = container.getBoundingClientRect();
  const centreX = box.left + box.width / 2;
  const centreY = box.top + box.height / 2;
  const pills = Array.from(map.getPane("markerPane")?.querySelectorAll<HTMLElement>(".marker-pill") ?? [])
    .map((pill) => {
      const rect = pill.getBoundingClientRect();
      return { pill, distance: Math.hypot(rect.left + rect.width / 2 - centreX, rect.top + rect.height / 2 - centreY) };
    })
    .sort((a, b) => a.distance - b.distance);

  const easing =
    getComputedStyle(container).getPropertyValue("--ease-out-quart").trim() || "cubic-bezier(0.165, 0.84, 0.44, 1)";
  const lastStep = Math.min(pills.length - 1, DROP_STEPS - 1);
  pills.forEach(({ pill }, rank) => {
    const step = pills.length > 1 ? Math.round((rank / (pills.length - 1)) * lastStep) : 0;
    pill.animate(
      [
        { opacity: 0, transform: "translateY(-10px)" },
        { opacity: 1, transform: "none" },
      ],
      // `backwards` holds each pill out of sight through its delay; nothing
      // is held after the end, so the pill is left exactly as styled.
      { duration: DROP_MS, delay: step * DROP_STEP_MS, easing, fill: "backwards" },
    );
  });
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

  // Built only when what they show changes. A new icon object makes Leaflet
  // rewrite the marker's HTML, which would cut a pill's drop-in short, so a
  // render for any other reason (the sync spinner, say) must reuse them.
  const icons = useMemo(
    () =>
      new Map(
        shown.map((store) => [
          store.id,
          buildIcon(store, tiers.get(store.id) ?? null, displayStateFor(store), store.id === selectedId),
        ]),
      ),
    [shown, tiers, selectedId],
  );

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

      {shown.map((store) => (
        <Marker
          key={store.id}
          position={[store.lat, store.lng]}
          icon={icons.get(store.id)}
          // Selected marker sits above its neighbours so it is never hidden.
          zIndexOffset={store.id === selectedId ? 1000 : 0}
          eventHandlers={{ click: () => onSelect(store.id) }}
        />
      ))}

      <DropIn ready={shown.length > 0} />
    </MapContainer>
  );
}
