"use client";

import { Check, LoaderCircle, TriangleAlert, X } from "lucide-react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useId, useRef, useState } from "react";

import { formatCents } from "@/lib/money";
import { readPriceInput } from "@/lib/price-input";
import { submitPrice, type SubmitFailureReason } from "@/lib/submissions";
import {
  PRICE_SOURCES,
  PRICE_SOURCE_LABELS,
  type PriceSource,
  type SubmissionStatus,
} from "@/types";

/**
 * The price submission modal.
 *
 * Built on the native `<dialog>` element opened with `showModal()`, which is
 * what supplies the focus trap, the top layer (no z-index argument with
 * Leaflet), background inertness, and focus restoration to the launching
 * button. Reimplementing those by hand is where accessible modals usually go
 * wrong, so they are delegated to the platform.
 *
 * The animation is layered on top rather than replacing any of that: the
 * dialog's own `::backdrop` is left transparent and a backdrop element is
 * rendered inside, so the backdrop and the panel can share one transition
 * object — literally the same values, not two definitions that happen to
 * match. Escape is intercepted via `oncancel` so the exit animation gets to
 * run before `close()`.
 */

/** `--ease-out-quart` from globals.css, in the form Motion wants. */
const EASE_OUT_QUART = [0.165, 0.84, 0.44, 1] as const;

/** `--duration-modal` and `--duration-modal-exit`, in seconds. */
const ENTER_SECONDS = 0.24;
const EXIT_SECONDS = 0.19;

const SOURCE_HINTS: Record<PriceSource, string> = {
  in_store: "Counter, kiosk or menu board",
  drive_thru: "Drive-thru menu or window",
  app: "App menu price, before any deal",
  delivery: "DoorDash, Uber Eats and the like",
};

/**
 * Client-side validation is a courtesy and not a control — the identical range
 * lives in firestore.rules, and that is the one that actually decides. It exists
 * so somebody who fat-fingers a decimal point finds out immediately instead of
 * after a round trip. The rule itself is in `lib/price-input.ts`, shared with
 * the bulk logging run so the two cannot drift apart.
 */
function errorFor(raw: string): string | null {
  const parsed = readPriceInput(raw);
  return parsed.ok ? null : parsed.message;
}

interface Accepted {
  priceCents: number;
  status: SubmissionStatus;
}

interface Failure {
  reason: SubmitFailureReason;
  message: string;
  retryAfter?: string | undefined;
}

export function SubmitPriceDialog({
  open,
  onClose,
  storeId,
  storeLabel,
}: {
  open: boolean;
  onClose: () => void;
  storeId: string;
  storeLabel: string;
}) {
  const router = useRouter();
  const reducedMotion = useReducedMotion() ?? false;

  const dialogRef = useRef<HTMLDialogElement>(null);
  const priceInputRef = useRef<HTMLInputElement>(null);
  const successHeadingRef = useRef<HTMLHeadingElement>(null);

  const titleId = useId();
  const priceId = useId();
  const priceHintId = useId();
  const priceErrorId = useId();

  const [priceInput, setPriceInput] = useState("");
  const [priceError, setPriceError] = useState<string | null>(null);
  const [source, setSource] = useState<PriceSource>("in_store");
  const [submitting, setSubmitting] = useState(false);
  const [accepted, setAccepted] = useState<Accepted | null>(null);
  const [failure, setFailure] = useState<Failure | null>(null);

  // Open the dialog once its contents are committed, so `showModal()` has
  // something to move focus into.
  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog === null || !open) return;
    if (!dialog.open) dialog.showModal();
    priceInputRef.current?.focus();
  }, [open]);

  // Announce and land focus on the confirmation. Without this, focus falls off
  // the submit button as it unmounts and a keyboard user is left nowhere.
  useEffect(() => {
    if (accepted !== null) successHeadingRef.current?.focus();
  }, [accepted]);

  /**
   * Close for real, and reset.
   *
   * Resetting here rather than on open means the form does not visibly blank
   * itself during the 190ms it spends animating away.
   */
  const handleExitComplete = useCallback(() => {
    dialogRef.current?.close();
    setPriceInput("");
    setPriceError(null);
    setSource("in_store");
    setAccepted(null);
    setFailure(null);
  }, []);

  const handleSubmit = useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      const parsed = readPriceInput(priceInput);
      if (!parsed.ok) {
        setPriceError(parsed.message);
        priceInputRef.current?.focus();
        return;
      }
      setPriceError(null);

      setFailure(null);
      setSubmitting(true);

      const result = await submitPrice({ storeId, priceCents: parsed.cents, source });
      setSubmitting(false);

      if (result.ok) {
        setAccepted({ priceCents: parsed.cents, status: result.status });
        // Pull the price, the chart and the log back down from the server. The
        // write already committed; this is only about what the page shows.
        router.refresh();
        return;
      }

      setFailure({
        reason: result.reason,
        message: result.message,
        retryAfter: result.retryAfter,
      });
    },
    [priceInput, source, storeId, router],
  );

  const transitionIn = { duration: reducedMotion ? 0 : ENTER_SECONDS, ease: EASE_OUT_QUART };
  const transitionOut = { duration: reducedMotion ? 0 : EXIT_SECONDS, ease: EASE_OUT_QUART };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby={titleId}
      onCancel={(event) => {
        // Escape would close the dialog synchronously and cut the exit
        // animation off at the first frame.
        event.preventDefault();
        onClose();
      }}
      // `size-full` is load-bearing. The UA stylesheet sizes a dialog with
      // `width: fit-content; height: fit-content`, and every child below is
      // out of flow, so without an explicit size the dialog box collapses to
      // 0×0 — visually fine, because the children are positioned against the
      // viewport, but a zero-area element that assistive tech and hit testing
      // both treat as absent.
      className="fixed inset-0 m-0 size-full max-h-none max-w-none border-0 bg-transparent p-0 backdrop:bg-transparent"
    >
      <div className="flex size-full items-end justify-center p-3 sm:items-center sm:p-6">
        <AnimatePresence onExitComplete={handleExitComplete}>
          {open
            ? [
                <motion.div
                  key="backdrop"
                  aria-hidden="true"
                  onClick={onClose}
                  className="absolute inset-0 bg-ink/50"
                  initial={reducedMotion ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0, transition: transitionOut }}
                  transition={transitionIn}
                />,

                <motion.div
                  key="panel"
                  className="relative max-h-full w-full max-w-lg overflow-y-auto rounded-lg border border-rule bg-paper-raised p-5 shadow-xl sm:p-6"
                  // Transform and opacity only — nothing here can trigger
                  // layout while it animates.
                  initial={reducedMotion ? false : { opacity: 0, scale: 0.95, y: 8 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.97, y: 4, transition: transitionOut }}
                  transition={transitionIn}
                  style={{ willChange: reducedMotion ? "auto" : "transform, opacity" }}
                >
                  <div className="flex items-start justify-between gap-4">
                    <h2 id={titleId} className="font-display text-xl leading-snug">
                      {accepted === null ? "Log a McChicken price" : "Thanks — that is in"}
                    </h2>
                    <button
                      type="button"
                      onClick={onClose}
                      aria-label="Close"
                      className="press -m-2 inline-flex size-11 shrink-0 items-center justify-center rounded-md"
                    >
                      <X aria-hidden="true" className="size-5" />
                    </button>
                  </div>

                  {/* No transition between the form and the confirmation. The
                      panel changes height when it swaps, and animating that
                      means animating layout — the one thing the motion budget
                      in this project rules out. The content change is its own
                      feedback. */}
                  {accepted === null ? (
                    <PriceForm
                      formIds={{ priceId, priceHintId, priceErrorId }}
                      priceInputRef={priceInputRef}
                      storeLabel={storeLabel}
                      priceInput={priceInput}
                      priceError={priceError}
                      source={source}
                      submitting={submitting}
                      failure={failure}
                      onPriceChange={(value) => {
                        setPriceInput(value);
                        // Stop scolding the moment they start fixing it.
                        if (priceError !== null) setPriceError(null);
                      }}
                      onPriceBlur={() => setPriceError(errorFor(priceInput))}
                      onSourceChange={setSource}
                      onSubmit={handleSubmit}
                      onCancel={onClose}
                    />
                  ) : (
                    <Confirmation
                      accepted={accepted}
                      headingRef={successHeadingRef}
                      onDone={onClose}
                    />
                  )}
                </motion.div>,
              ]
            : null}
        </AnimatePresence>
      </div>
    </dialog>
  );
}

function PriceForm({
  formIds,
  priceInputRef,
  storeLabel,
  priceInput,
  priceError,
  source,
  submitting,
  failure,
  onPriceChange,
  onPriceBlur,
  onSourceChange,
  onSubmit,
  onCancel,
}: {
  formIds: { priceId: string; priceHintId: string; priceErrorId: string };
  priceInputRef: React.RefObject<HTMLInputElement | null>;
  storeLabel: string;
  priceInput: string;
  priceError: string | null;
  source: PriceSource;
  submitting: boolean;
  failure: Failure | null;
  onPriceChange: (value: string) => void;
  onPriceBlur: () => void;
  onSourceChange: (source: PriceSource) => void;
  onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  onCancel: () => void;
}) {
  const { priceId, priceHintId, priceErrorId } = formIds;

  return (
    // `noValidate` because the browser's own validation bubbles would compete
    // with the inline messages, and they cannot be styled or positioned.
    <form onSubmit={onSubmit} noValidate className="mt-5">
      {failure !== null ? (
        <div
          role="alert"
          className="mb-5 flex gap-2.5 rounded-md border border-danger bg-paper-sunken p-3 text-sm"
        >
          <TriangleAlert aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-danger" />
          <div>
            <p>{failure.message}</p>
            {failure.retryAfter !== undefined ? (
              <p className="mt-1 text-ink-muted">
                You can log this store again after{" "}
                {new Date(failure.retryAfter).toLocaleString("en-US", {
                  month: "short",
                  day: "numeric",
                  hour: "numeric",
                  minute: "2-digit",
                })}
                .
              </p>
            ) : null}
          </div>
        </div>
      ) : null}

      {/* Store is fixed rather than a picker. You arrive here from one store's
          page, and a searchable store selector inside the modal would be a
          second, worse version of the map. */}
      <div>
        <span className="text-sm font-medium">Store</span>
        <p className="mt-1.5 rounded-md border border-rule bg-paper-sunken px-3 py-2.5 text-sm text-ink-muted">
          {storeLabel}
        </p>
      </div>

      <div className="mt-5">
        <label htmlFor={priceId} className="text-sm font-medium">
          Price you paid or saw
        </label>
        <p id={priceHintId} className="mt-0.5 text-xs text-ink-subtle">
          From a receipt, the menu board or the app. Before tax, and for the
          sandwich on its own — not a meal.
        </p>

        <div className="relative mt-1.5">
          <span
            aria-hidden="true"
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-ink-subtle"
          >
            $
          </span>
          <input
            ref={priceInputRef}
            id={priceId}
            name="price"
            type="text"
            inputMode="decimal"
            autoComplete="off"
            placeholder="3.19"
            value={priceInput}
            onChange={(event) => onPriceChange(event.target.value)}
            onBlur={onPriceBlur}
            aria-invalid={priceError !== null}
            aria-describedby={
              priceError === null ? priceHintId : `${priceHintId} ${priceErrorId}`
            }
            className={`tabular min-h-12 w-full rounded-md border bg-paper-raised py-2 pl-7 pr-3 text-lg ${
              priceError === null ? "border-rule-strong" : "border-danger"
            }`}
          />
        </div>

        {/* Adjacent to the field it describes, not collected at the top of the
            form — an error a hundred pixels from its cause is a puzzle. */}
        {priceError !== null ? (
          <p
            id={priceErrorId}
            role="alert"
            className="mt-1.5 flex items-start gap-1.5 text-sm text-danger"
          >
            <TriangleAlert aria-hidden="true" className="mt-0.5 size-3.5 shrink-0" />
            {priceError}
          </p>
        ) : null}
      </div>

      <fieldset className="mt-5">
        <legend className="text-sm font-medium">Where was the price?</legend>
        <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
          {PRICE_SOURCES.map((value) => (
            <label
              key={value}
              className={`press flex min-h-12 cursor-pointer items-start gap-2.5 rounded-md border p-3 has-[:focus-visible]:outline has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus ${
                source === value
                  ? "border-rule-strong bg-paper-sunken"
                  : "border-rule bg-paper-raised"
              }`}
            >
              <input
                type="radio"
                name="source"
                value={value}
                checked={source === value}
                onChange={() => onSourceChange(value)}
                // The ring is drawn on the label instead; a 16px dot inside a
                // full-width card is too small a thing to focus the eye on.
                className="mt-0.5 size-4 shrink-0 accent-accent focus-visible:outline-none"
              />
              <span className="min-w-0">
                <span className="block text-sm font-medium">
                  {PRICE_SOURCE_LABELS[value]}
                </span>
                <span className="block text-xs text-ink-subtle">{SOURCE_HINTS[value]}</span>
              </span>
            </label>
          ))}
        </div>
        <p className="mt-2 text-xs text-ink-subtle">
          Delivery prices are recorded and shown, but never become the price —
          the platforms add their own markup.
        </p>
      </fieldset>

      <div className="mt-6 flex flex-wrap gap-2">
        <button
          type="submit"
          disabled={submitting}
          className="press inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-md bg-accent px-5 py-3 font-medium text-accent-ink disabled:opacity-70"
        >
          {submitting ? (
            <>
              <LoaderCircle
                aria-hidden="true"
                className="size-4 animate-spin motion-reduce:animate-none"
              />
              Logging…
            </>
          ) : (
            "Log this price"
          )}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="press inline-flex min-h-12 items-center justify-center rounded-md border border-rule-strong px-5 py-3 font-medium"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}

function Confirmation({
  accepted,
  headingRef,
  onDone,
}: {
  accepted: Accepted;
  headingRef: React.RefObject<HTMLHeadingElement | null>;
  onDone: () => void;
}) {
  return (
    <div role="status" className="mt-5">
      <div className="flex items-start gap-3">
        <Check aria-hidden="true" className="mt-1 size-5 shrink-0 text-tier-low" />
        <div>
          <h3
            ref={headingRef}
            tabIndex={-1}
            className="font-display text-lg outline-none"
          >
            <span className="tabular">{formatCents(accepted.priceCents)}</span> logged
          </h3>

          {accepted.status === "accepted" ? (
            <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">
              That is this store&rsquo;s price from now on. The page behind this
              has already been updated.
            </p>
          ) : (
            <p className="mt-1.5 text-sm leading-relaxed text-ink-muted">
              It is more than 40% away from what this store is currently listed
              at, so it is held rather than applied. That is not an accusation —
              prices really do jump — it just needs one more person to see the
              same thing, and then it becomes the price.
            </p>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={onDone}
        className="press mt-6 inline-flex min-h-12 w-full items-center justify-center rounded-md bg-accent px-5 py-3 font-medium text-accent-ink"
      >
        Done
      </button>
    </div>
  );
}
