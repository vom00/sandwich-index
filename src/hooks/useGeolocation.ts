"use client";

import { useCallback, useState } from "react";

import type { LatLng } from "@/lib/geohash";
import {
  forgetLocation,
  readRememberedLocation,
  rememberLocation,
} from "@/lib/remembered-location";

export type GeolocationPhase =
  | "idle"
  | "requesting"
  | "granted"
  | "denied"
  | "unavailable"
  | "failed";

export interface GeolocationState {
  phase: GeolocationPhase;
  position: LatLng | null;
  /** Human-readable, already suitable for display. */
  message: string | null;
}

const INITIAL: GeolocationState = { phase: "idle", position: null, message: null };

/**
 * Browser geolocation, deliberately never requested automatically.
 *
 * The prompt only fires when the user activates a control that says what it is
 * for. A permission dialog that appears unprompted on page load gets denied out
 * of reflex, and a denial is sticky — asking badly once costs the answer
 * permanently.
 *
 * Denial is a first-class outcome here, not an error path. Every phase other
 * than `granted` still leaves the ZIP entry route open.
 *
 * Once answered, the position is kept for the life of the tab — see
 * `lib/remembered-location`. Asking again because the user opened a store page
 * and came back is asking badly too.
 */
export function useGeolocation(): GeolocationState & {
  request: (onResolved?: (position: LatLng) => void) => void;
  setManualPosition: (position: LatLng, label?: string) => void;
  restore: (onRestored?: (position: LatLng, label: string | null) => void) => void;
  reset: () => void;
} {
  const [state, setState] = useState<GeolocationState>(INITIAL);

  /**
   * `onResolved` is passed per call rather than per hook.
   *
   * The alternative — watching `position` in an effect and loading when it
   * changes — makes the fetch a consequence of a state change rather than of
   * the click that caused it, which is both harder to follow and a cascading
   * render. Taking the callback at the call site also sidesteps a stale
   * closure without a ref.
   */
  const request = useCallback((onResolved?: (position: LatLng) => void) => {
    if (typeof navigator === "undefined" || navigator.geolocation === undefined) {
      setState({
        phase: "unavailable",
        position: null,
        message: "This browser cannot share your location. Enter a ZIP code instead.",
      });
      return;
    }

    setState({ phase: "requesting", position: null, message: null });

    navigator.geolocation.getCurrentPosition(
      (position) => {
        const resolved: LatLng = {
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        };
        setState({ phase: "granted", position: resolved, message: null });
        rememberLocation(resolved, null);
        onResolved?.(resolved);
      },
      (error) => {
        // PERMISSION_DENIED is a decision, not a failure. It gets its own phase
        // so the UI can offer the fallback without implying something broke.
        if (error.code === error.PERMISSION_DENIED) {
          setState({
            phase: "denied",
            position: null,
            message: "No problem — enter a ZIP code and we will use that instead.",
          });
          return;
        }

        setState({
          phase: "failed",
          position: null,
          message:
            error.code === error.TIMEOUT
              ? "Locating you took too long. Try a ZIP code instead."
              : "We could not work out where you are. Try a ZIP code instead.",
        });
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 5 * 60 * 1000 },
    );
  }, []);

  const setManualPosition = useCallback((position: LatLng, label?: string) => {
    setState({
      phase: "granted",
      position,
      message: label !== undefined ? `Showing results near ${label}` : null,
    });
    rememberLocation(position, label ?? null);
  }, []);

  /**
   * Adopt the position remembered earlier in this tab, if there is one.
   *
   * Takes its callback per call for the same reason `request` does: the caller
   * needs to load stores for the restored position, and doing that by watching
   * `position` in an effect would make the fetch a consequence of a state
   * change rather than of the navigation that actually caused it.
   *
   * Silent when nothing is remembered — a first visit is not a failed restore.
   */
  const restore = useCallback(
    (onRestored?: (position: LatLng, label: string | null) => void) => {
      const remembered = readRememberedLocation();
      if (remembered === null) return;

      setState({ phase: "granted", position: remembered.position, message: null });
      onRestored?.(remembered.position, remembered.label);
    },
    [],
  );

  /** Back to square one, and the tab forgets. Used by "change location". */
  const reset = useCallback(() => {
    forgetLocation();
    setState(INITIAL);
  }, []);

  return { ...state, request, setManualPosition, restore, reset };
}
