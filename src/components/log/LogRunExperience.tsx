"use client";

import { Check, CircleAlert, LoaderCircle, MapPinOff, TriangleAlert } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";

import { LocationGate } from "@/components/map/LocationGate";
import { useGeolocation } from "@/hooks/useGeolocation";
import type { LatLng } from "@/lib/geohash";
import {
  NEED_LABELS,
  coverageOf,
  describeRun,
  prioritiseForLogging,
  summarise,
  type LogCandidate,
  type RowOutcome,
} from "@/lib/log-run";
import { formatCents } from "@/lib/money";
import { isBlank, readPriceInput } from "@/lib/price-input";
import { storeLabel } from "@/lib/store-label";
import { submitPrice } from "@/lib/submissions";
import { relativeAge } from "@/lib/tiers";
import { PRICE_SOURCES, PRICE_SOURCE_LABELS, type PriceSource } from "@/types";

/**
 * Log many stores in one sitting.
 *
 * The store page's dialog is the right shape for one price: you are standing in
 * a restaurant, you log the sandwich in front of you. It is the wrong shape for
 * twenty, where the cost is not the typing but the twenty round trips through a
 * modal to get to it.
 *
 * Two deliberate omissions:
 *
 * 1. **No new animation.** This is a data-entry grid where rows change status
 *    independently; animating thirty of those at once produces motion with no
 *    information in it, and every frame of it would need a reduced-motion
 *    escape hatch that earns nothing. The only motion here is the existing
 *    `press` affordance and the spinner, both already guarded.
 *
 * 2. **No parallel submission.** Each `submitPrice` is a read, an atomic batch
 *    and a recompute call; firing thirty at once would put thirty concurrent
 *    recomputes on our own route for no gain a person could perceive. Serial
 *    also means the progress readout is true rather than approximate.
 */

const RADIUS_MILES = 15;

/** Reading prices from the app is the realistic bulk path, so it leads. */
const DEFAULT_SOURCE: PriceSource = "app";

export function LogRunExperience() {
  const router = useRouter();
  const geo = useGeolocation();
  const baseId = useId();

  const [candidates, setCandidates] = useState<LogCandidate[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const [locationLabel, setLocationLabel] = useState<string | null>(null);
  /** See the map: rendering the gate before the restore has run flashes it. */
  const [restoreAttempted, setRestoreAttempted] = useState(false);

  const [source, setSource] = useState<PriceSource>(DEFAULT_SOURCE);
  /**
   * Stores whose "no street address" skip the contributor has deliberately
   * lifted. Empty by default and never populated automatically — the whole
   * point is that enabling one of these rows is an act, not an oversight.
   */
  const [overridden, setOverridden] = useState<Record<string, boolean>>({});
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [outcomes, setOutcomes] = useState<Record<string, RowOutcome>>({});
  const [running, setRunning] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  const load = useCallback(async (position: LatLng) => {
    const params = new URLSearchParams({
      lat: String(position.lat),
      lng: String(position.lng),
      radiusMiles: String(RADIUS_MILES),
    });

    try {
      const response = await fetch(`/api/stores?${params.toString()}`);
      if (!response.ok) throw new Error("Store lookup failed");
      const body = await response.json();
      setCandidates(prioritiseForLogging(body.stores ?? []));
      setLoaded(true);
      setFailed(false);
    } catch {
      setFailed(true);
    }
  }, []);

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

  /**
   * Adopt the location the tab already knows about.
   *
   * The realistic route here is map → "Log several at once", and asking for a
   * ZIP a second time on the next screen would be the app forgetting something
   * it was just told. Ref-guarded rather than given an empty dependency list,
   * for the reason spelled out in MapExperience: `geo` is a new object every
   * render, so an honest list would re-run this and a dishonest one would hide
   * why it does not.
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

  const coverage = useMemo(() => coverageOf(candidates), [candidates]);

  /**
   * Whether a row will accept a price at all.
   *
   * Checked here rather than relying on the input's `disabled` attribute, which
   * is a UI affordance and not a control — it is trivially removed, and a value
   * left over from before an override was withdrawn would otherwise still be
   * sitting in `inputs`.
   */
  const enterable = useCallback(
    (candidate: LogCandidate): boolean =>
      candidate.matchable || overridden[candidate.store.id] === true,
    [overridden],
  );

  /** Rows with something typed in them, in the order they appear on screen. */
  const filled = useMemo(
    () =>
      candidates.filter(
        (candidate) => enterable(candidate) && !isBlank(inputs[candidate.store.id] ?? ""),
      ),
    [candidates, inputs, enterable],
  );

  /** Rows that are filled in but would not survive validation. */
  const invalidCount = useMemo(
    () =>
      filled.filter(({ store }) => !readPriceInput(inputs[store.id] ?? "").ok).length,
    [filled, inputs],
  );

  const handleRun = useCallback(async () => {
    const queue = filled.filter(
      (candidate) =>
        enterable(candidate) && readPriceInput(inputs[candidate.store.id] ?? "").ok,
    );
    if (queue.length === 0) return;

    setRunning(true);
    setAnnouncement(`Saving ${queue.length} prices.`);

    const collected: RowOutcome[] = [];

    for (const [index, { store }] of queue.entries()) {
      setOutcomes((previous) => ({ ...previous, [store.id]: { kind: "saving" } }));

      const parsed = readPriceInput(inputs[store.id] ?? "");
      // Re-checked rather than trusted from the filter above: `inputs` could
      // have changed between building the queue and reaching this row, and a
      // price that is not in range must never reach the write path.
      if (!parsed.ok) {
        const outcome: RowOutcome = { kind: "failed", message: parsed.message };
        collected.push(outcome);
        setOutcomes((previous) => ({ ...previous, [store.id]: outcome }));
        continue;
      }

      const result = await submitPrice({
        storeId: store.id,
        priceCents: parsed.cents,
        source,
      });

      const outcome: RowOutcome = result.ok
        ? result.status === "accepted"
          ? { kind: "saved", cents: parsed.cents }
          : { kind: "held", cents: parsed.cents }
        : { kind: "failed", message: result.message };

      collected.push(outcome);
      setOutcomes((previous) => ({ ...previous, [store.id]: outcome }));
      setAnnouncement(`Saved ${index + 1} of ${queue.length}.`);
    }

    setRunning(false);
    setAnnouncement(describeRun(summarise(collected)));
    // Every other surface reads these prices server-side.
    router.refresh();
  }, [filled, inputs, source, router, enterable]);

  // One frame at most, and only before the restore has been attempted.
  if (!restoreAttempted && geo.position === null) {
    return (
      <main id="main" className="flex min-h-0 flex-1 items-center justify-center py-20">
        <LoaderCircle
          aria-hidden="true"
          className="size-6 animate-spin text-ink-subtle motion-reduce:animate-none"
        />
        <span className="sr-only">Loading</span>
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

  const summary = summarise(Object.values(outcomes));
  const runnable = filled.length - invalidCount;

  return (
    <main id="main" className="mx-auto w-full max-w-3xl px-5 py-10 sm:px-8">
      <header>
        <p className="text-xs uppercase tracking-[0.18em] text-ink-subtle">
          Logging run
        </p>
        <h1 className="mt-2 font-display text-3xl leading-tight sm:text-4xl">
          {locationLabel === null
            ? "Stores that need a price"
            : `Stores near ${locationLabel} that need a price`}
        </h1>
        <p className="mt-3 max-w-prose leading-relaxed text-ink-muted">
          Open the McDonald&rsquo;s app, switch stores, and read the McChicken
          price off the menu. Type what you see and move down the list. Nothing
          is saved until you finish, and stores nobody has priced come first.
        </p>
      </header>

      {failed && candidates.length === 0 ? (
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
      ) : !loaded ? (
        <p className="mt-10 flex items-center gap-2 text-ink-muted">
          <LoaderCircle
            aria-hidden="true"
            className="size-4 animate-spin motion-reduce:animate-none"
          />
          Looking for stores…
        </p>
      ) : candidates.length === 0 ? (
        <EmptyState
          title="No stores tracked here yet"
          body={`We have no McDonald's locations on file within ${RADIUS_MILES} miles. Open the map here first, which adds the stores in the area.`}
        />
      ) : (
        <>
          {/* Three cells, not four. The counters partition the list and sum to
              its length; "no street address" cuts across all three, so putting
              it in the same row would invite adding it to the total. */}
          <dl className="mt-8 grid grid-cols-3 gap-px overflow-hidden rounded-lg border border-rule bg-rule">
            <Stat label="Never logged" value={coverage.neverLogged} />
            <Stat label="Expired" value={coverage.expired} />
            <Stat label="Up to date" value={coverage.current} />
          </dl>

          {coverage.unmatchable > 0 ? (
            <p className="mt-2 flex items-start gap-1.5 text-xs text-ink-muted">
              <CircleAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
              {coverage.unmatchable} of these{" "}
              {coverage.unmatchable === 1 ? "has" : "have"} no street address on
              file, so there is no way to tell which restaurant in the app{" "}
              {coverage.unmatchable === 1 ? "it is" : "they are"}. They are at the
              bottom of the list and skipped unless you say otherwise.
            </p>
          ) : null}

          <fieldset className="mt-8">
            <legend className="text-sm font-medium">
              Where are you reading these prices?
            </legend>
            <p className="mt-0.5 text-xs text-ink-subtle">
              Applies to every row in this run.
            </p>

            {/* Standing, not conditional. The mistake this prevents — logging a
                screen full of app prices as counter prices — is made before the
                first row is typed, so the warning has to be visible then too,
                not revealed once a particular option is chosen. */}
            <p className="mt-2 flex items-start gap-1.5 rounded-md border border-rule bg-paper-sunken p-2.5 text-xs leading-relaxed text-ink-muted">
              <TriangleAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
              <span>
                One restaurant charges different amounts depending on how you
                buy. App, counter, drive-thru and delivery are routinely four
                different numbers for the same sandwich. Whatever you pick here
                is stamped on every price in this run, so if you switch part way
                through, save what you have and start a new run.
              </span>
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              {PRICE_SOURCES.map((value) => (
                <label
                  key={value}
                  className={`press inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-md border px-3.5 py-2 text-sm has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus ${
                    source === value
                      ? "border-rule-strong bg-paper-sunken font-medium"
                      : "border-rule bg-paper-raised"
                  }`}
                >
                  <input
                    type="radio"
                    name="run-source"
                    value={value}
                    checked={source === value}
                    disabled={running}
                    onChange={() => setSource(value)}
                    className="size-4 shrink-0 accent-accent focus-visible:outline-none"
                  />
                  {PRICE_SOURCE_LABELS[value]}
                </label>
              ))}
            </div>
            {source === "delivery" ? (
              <p className="mt-2 flex items-start gap-1.5 text-xs text-ink-muted">
                <CircleAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
                Delivery prices are recorded and shown but never counted in a
                price, because the platforms add their own markup on top of the
                franchise price.
              </p>
            ) : null}
          </fieldset>

          <ol className="mt-8 divide-y divide-rule border-y border-rule">
            {candidates.map((candidate) => {
              const { store, need, matchable } = candidate;
              const open = enterable(candidate);
              const label = storeLabel(store);
              const value = inputs[store.id] ?? "";
              const outcome = outcomes[store.id] ?? { kind: "idle" };
              const parsed = isBlank(value) ? null : readPriceInput(value);
              const error =
                parsed !== null && !parsed.ok && outcome.kind === "idle"
                  ? parsed.message
                  : null;
              const fieldId = `${baseId}-${store.id}`;
              const errorId = `${fieldId}-error`;
              const noteId = `${fieldId}-note`;

              return (
                <li
                  key={store.id}
                  className="flex flex-wrap items-start gap-x-4 gap-y-3 py-4"
                >
                  <div className="min-w-0 flex-1 basis-64">
                    {/* A `for` pointing at an input that is not rendered is a
                        dangling reference, so a skipped row names itself with a
                        span and the override button is described by the note
                        instead. */}
                    {open ? (
                      <label htmlFor={fieldId} className="block font-medium leading-snug">
                        {label.text}
                      </label>
                    ) : (
                      <span className="block font-medium leading-snug">{label.text}</span>
                    )}
                    <p className="mt-0.5 text-sm text-ink-subtle">
                      {label.qualifier !== null ? `${label.qualifier} · ` : ""}
                      <span className={need === "current" ? "" : "text-ink-muted"}>
                        {NEED_LABELS[need]}
                      </span>
                      {store.priceCents !== null ? (
                        <>
                          {" · now "}
                          <span className="tabular">
                            {formatCents(store.priceCents)}
                          </span>
                          {`, seen ${relativeAge(store.pricedAt)}`}
                        </>
                      ) : null}
                    </p>

                    {!matchable ? (
                      <p
                        id={noteId}
                        className="mt-1.5 flex items-start gap-1.5 text-sm text-ink-muted"
                      >
                        <CircleAlert
                          aria-hidden="true"
                          className="mt-0.5 size-3.5 shrink-0"
                        />
                        <span>
                          No street address, so there is no way to tell which
                          restaurant this is in the app. Skipped by default.
                          {open ? " You have chosen to log it anyway." : null}
                        </span>
                      </p>
                    ) : null}

                    {error !== null ? (
                      <p
                        id={errorId}
                        role="alert"
                        className="mt-1.5 flex items-start gap-1.5 text-sm text-danger"
                      >
                        <TriangleAlert
                          aria-hidden="true"
                          className="mt-0.5 size-3.5 shrink-0"
                        />
                        {error}
                      </p>
                    ) : null}
                  </div>

                  <div className="flex shrink-0 items-center gap-3">
                    {/* An unmatchable row shows the override in place of the
                        field rather than beside a greyed-out one. A disabled
                        input you can see is an invitation to work out how to
                        type in it; a button that says what it does is not. */}
                    {!open ? (
                      <button
                        type="button"
                        disabled={running}
                        onClick={() =>
                          setOverridden((previous) => ({ ...previous, [store.id]: true }))
                        }
                        // Every one of these buttons reads "Log anyway", which
                        // out of context names nothing. The store goes in the
                        // accessible name so a list of them stays navigable.
                        aria-label={`Log a price for ${label.text} anyway`}
                        aria-describedby={noteId}
                        className="press inline-flex min-h-12 w-28 items-center justify-center rounded-md border border-rule-strong px-3 py-2 text-sm font-medium"
                      >
                        Log anyway
                      </button>
                    ) : (
                      <div className="relative">
                        <span
                          aria-hidden="true"
                          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle"
                        >
                          $
                        </span>
                        <input
                          id={fieldId}
                          type="text"
                          inputMode="decimal"
                          autoComplete="off"
                          placeholder="3.19"
                          value={value}
                          disabled={running || outcome.kind === "saved"}
                          aria-invalid={error !== null}
                          aria-describedby={
                            [error !== null ? errorId : null, !matchable ? noteId : null]
                              .filter(Boolean)
                              .join(" ") || undefined
                          }
                          onChange={(event) =>
                            setInputs((previous) => ({
                              ...previous,
                              [store.id]: event.target.value,
                            }))
                          }
                          className={`tabular min-h-12 w-28 rounded-md border bg-paper-raised py-2 pl-7 pr-3 disabled:opacity-60 ${
                            error === null ? "border-rule-strong" : "border-danger"
                          }`}
                        />
                      </div>
                    )}

                    <RowStatus outcome={outcome} />
                  </div>
                </li>
              );
            })}
          </ol>

          <div className="sticky bottom-0 mt-6 flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-rule bg-paper py-4">
            <button
              type="button"
              onClick={() => void handleRun()}
              disabled={running || runnable === 0}
              className="press inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-accent px-5 py-3 font-medium text-accent-ink disabled:opacity-60"
            >
              {running ? (
                <>
                  <LoaderCircle
                    aria-hidden="true"
                    className="size-4 animate-spin motion-reduce:animate-none"
                  />
                  Saving…
                </>
              ) : (
                `Save ${runnable} ${runnable === 1 ? "price" : "prices"}`
              )}
            </button>

            <p className="text-sm text-ink-muted">
              {invalidCount > 0
                ? `${invalidCount} ${invalidCount === 1 ? "row needs" : "rows need"} fixing first.`
                : summary.saved + summary.held + summary.failed > 0
                  ? describeRun(summary)
                  : "One price per store, per day."}
            </p>
          </div>
        </>
      )}

      {/* Progress and the closing summary, announced once each. Assertive would
          interrupt the screen reader mid-row on every save. */}
      <p role="status" aria-live="polite" className="sr-only">
        {announcement}
      </p>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="bg-paper-raised px-4 py-3">
      <dt className="text-xs uppercase tracking-wider text-ink-subtle">{label}</dt>
      <dd className="tabular mt-1 font-display text-2xl">{value}</dd>
    </div>
  );
}

function RowStatus({ outcome }: { outcome: RowOutcome }) {
  switch (outcome.kind) {
    case "idle":
      return <span className="w-24 shrink-0" />;
    case "saving":
      return (
        <span className="flex w-24 shrink-0 items-center gap-1.5 text-sm text-ink-subtle">
          <LoaderCircle
            aria-hidden="true"
            className="size-3.5 animate-spin motion-reduce:animate-none"
          />
          Saving
        </span>
      );
    case "saved":
      return (
        <span className="flex w-24 shrink-0 items-center gap-1.5 text-sm text-ink-muted">
          <Check aria-hidden="true" className="size-3.5 shrink-0 text-tier-low" />
          Logged
        </span>
      );
    case "held":
      return (
        <span
          className="flex w-24 shrink-0 items-start gap-1.5 text-sm text-ink-muted"
          title="Far enough from this store's baseline that it needs a second report before it counts."
        >
          <CircleAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
          Held
        </span>
      );
    case "failed":
      return (
        <span className="flex w-24 shrink-0 items-start gap-1.5 text-sm text-danger">
          <TriangleAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
          {outcome.message}
        </span>
      );
  }
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
    <div className="mt-10 rounded-lg border border-rule bg-paper-raised px-5 py-10 text-center">
      <MapPinOff aria-hidden="true" className="mx-auto size-6 text-ink-subtle" />
      <h2 className="mt-3 font-display text-lg">{title}</h2>
      <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-ink-muted">{body}</p>
      {action !== undefined ? <div className="mt-4">{action}</div> : null}
    </div>
  );
}
