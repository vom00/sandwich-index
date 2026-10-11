/**
 * Remembering where the user asked to look, for as long as the tab is open.
 *
 * Without this, opening a store page and pressing "Back to the map" throws away
 * the location and drops the user back on the permission gate — the same
 * question they answered a moment ago, with their place on the map lost. That
 * is the whole reason this module exists; it is a navigation fix, not a
 * tracking feature.
 *
 * `sessionStorage`, deliberately, and not a cookie: a cookie would be attached
 * to every request to the server, which would make the promise on the location
 * gate — that a position is only ever sent to look up nearby stores — false.
 * This copy never leaves the browser and dies with the tab.
 */

import type { LatLng } from "@/lib/geohash";

const STORAGE_KEY = "sandwich-index:location";

export interface RememberedLocation {
  position: LatLng;
  /** The ZIP or place name the user typed, when they typed one. */
  label: string | null;
}

/**
 * Every access is wrapped: Safari in private mode throws on `sessionStorage`
 * rather than returning null, and a browser that refuses to remember a location
 * is not a reason to break the map.
 */
function storage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function rememberLocation(position: LatLng, label: string | null): void {
  try {
    storage()?.setItem(STORAGE_KEY, JSON.stringify({ position, label }));
  } catch {
    // Quota, private mode, a user who disabled storage. All fine — the only
    // cost is being asked for a location again.
  }
}

/**
 * The remembered location, or null.
 *
 * Validated rather than trusted. The value is in a store the user can edit, so
 * anything malformed or out of range is treated as absent — a NaN centre would
 * take Leaflet down with it.
 */
export function readRememberedLocation(): RememberedLocation | null {
  let raw: string | null = null;
  try {
    raw = storage()?.getItem(STORAGE_KEY) ?? null;
  } catch {
    return null;
  }
  if (raw === null) return null;

  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;

    const { position, label } = parsed as { position?: unknown; label?: unknown };
    if (typeof position !== "object" || position === null) return null;

    const { lat, lng } = position as { lat?: unknown; lng?: unknown };
    if (typeof lat !== "number" || !Number.isFinite(lat) || Math.abs(lat) > 90) return null;
    if (typeof lng !== "number" || !Number.isFinite(lng) || Math.abs(lng) > 180) return null;

    return { position: { lat, lng }, label: typeof label === "string" ? label : null };
  } catch {
    return null;
  }
}

export function forgetLocation(): void {
  try {
    storage()?.removeItem(STORAGE_KEY);
  } catch {
    // Nothing to do about it, and nothing depends on it succeeding.
  }
}
