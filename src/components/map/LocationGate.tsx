"use client";

import { LoaderCircle, MapPin } from "lucide-react";
import { useId, useState, type FormEvent } from "react";

import type { LatLng } from "@/lib/geohash";
import type { GeolocationPhase } from "@/hooks/useGeolocation";
import { parseZip, ZIP_MESSAGE } from "@/lib/zip";

/**
 * Asks for location, and makes declining a real option rather than a dead end.
 *
 * Both paths are offered at once. Presenting ZIP entry only after a denial
 * frames the fallback as a consolation prize and means a user who already knows
 * they will refuse has to sit through a permission dialog first.
 *
 * The explanation appears before the button, so the browser's own prompt is
 * never the first time someone learns why they are being asked.
 */
export function LocationGate({
  phase,
  message,
  onRequestLocation,
  onManualLocation,
}: {
  phase: GeolocationPhase;
  message: string | null;
  onRequestLocation: () => void;
  onManualLocation: (position: LatLng, label: string) => void;
}) {
  const zipFieldId = useId();
  const zipErrorId = useId();

  const [zip, setZip] = useState("");
  const [zipError, setZipError] = useState<string | null>(null);
  const [lookingUp, setLookingUp] = useState(false);

  async function handleZipSubmit(event: FormEvent) {
    event.preventDefault();

    const parsed = parseZip(zip);
    if (parsed === null) {
      setZipError(ZIP_MESSAGE);
      return;
    }

    setZipError(null);
    setLookingUp(true);

    try {
      const response = await fetch(`/api/geocode?zip=${encodeURIComponent(parsed)}`);
      const body = await response.json();

      if (!response.ok) {
        setZipError(body.error ?? "Could not look up that ZIP code");
        return;
      }

      onManualLocation({ lat: body.lat, lng: body.lng }, parsed);
    } catch {
      setZipError("Could not reach the lookup service. Check your connection.");
    } finally {
      setLookingUp(false);
    }
  }

  const requesting = phase === "requesting";

  return (
    <div className="mx-auto w-full max-w-xl px-5 py-14 sm:px-8">
      <h1 className="font-display text-3xl leading-tight sm:text-4xl">
        Find the cheapest McChicken near you
      </h1>

      <p className="mt-4 leading-relaxed text-ink-muted">
        We need a rough location to work out which stores to show. It centres
        the map and searches about fifteen miles around you, and it is not sent
        anywhere except to look up nearby stores. Your browser keeps a copy
        while this tab is open, so opening a store and coming back does not ask
        you again; closing the tab discards it.
      </p>

      <div className="mt-8">
        <button
          type="button"
          onClick={onRequestLocation}
          disabled={requesting}
          className="press inline-flex min-h-11 items-center gap-2 rounded-md bg-accent px-5 py-3 font-medium text-accent-ink disabled:opacity-70"
        >
          {requesting ? (
            <LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />
          ) : (
            <MapPin aria-hidden="true" className="size-4" />
          )}
          {requesting ? "Locating you…" : "Use my location"}
        </button>
      </div>

      {message !== null ? (
        <p
          className="mt-4 text-sm text-ink-muted"
          // Denial is an expected answer, so this is polite rather than assertive.
          role="status"
        >
          {message}
        </p>
      ) : null}

      <div className="mt-10 border-t border-rule pt-8">
        <form onSubmit={handleZipSubmit} noValidate>
          <label htmlFor={zipFieldId} className="block font-medium">
            Or enter a ZIP code
          </label>
          <p className="mt-1 text-sm text-ink-muted">
            Works just as well. No permission needed.
          </p>

          <div className="mt-3 flex flex-wrap items-start gap-3">
            <div className="flex-1 min-w-[10rem]">
              <input
                id={zipFieldId}
                name="zip"
                type="text"
                inputMode="numeric"
                autoComplete="postal-code"
                maxLength={5}
                value={zip}
                onChange={(event) => {
                  setZip(event.target.value);
                  if (zipError !== null) setZipError(null);
                }}
                onBlur={() => {
                  if (zip === "") return;
                  setZipError(parseZip(zip) === null ? ZIP_MESSAGE : null);
                }}
                aria-invalid={zipError !== null}
                aria-describedby={zipError !== null ? zipErrorId : undefined}
                placeholder="75019"
                className="tabular min-h-11 w-full rounded-md border border-rule bg-paper-raised px-3 py-2 text-base"
              />
              {/* Adjacent to the field it describes, never a summary block. */}
              {zipError !== null ? (
                <p id={zipErrorId} role="alert" className="mt-2 text-sm text-danger">
                  {zipError}
                </p>
              ) : null}
            </div>

            <button
              type="submit"
              disabled={lookingUp}
              className="press inline-flex min-h-11 items-center gap-2 rounded-md border border-rule-strong px-5 py-2 font-medium disabled:opacity-70"
            >
              {lookingUp ? (
                <LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />
              ) : null}
              {lookingUp ? "Looking up…" : "Show stores"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
