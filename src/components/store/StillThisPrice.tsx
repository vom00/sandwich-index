"use client";

import { LoaderCircle } from "lucide-react";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";

import { useTurnstile } from "@/components/ui/useTurnstile";
import { formatCents } from "@/lib/money";
import { submitPrice } from "@/lib/submissions";
import { PRICE_SOURCE_LABELS, type PriceSource } from "@/types";

/**
 * "Still this price?": one tap says the price on the card is still right.
 *
 * A confirm is an ordinary report of the current price, sent the way the
 * price dialog sends one (`submitPrice`): sign-in, App Check, Turnstile, and
 * one report per reporter per store per day, all checked by the server. So it
 * writes nothing a typed report wouldn't, and it dates the price today
 * (`lib/pricing`: a report that isn't a big move sets the price and its date).
 *
 * The visitor taps where they saw it rather than a bare "yes", because every
 * report carries its source and the site won't make one up. Delivery isn't
 * offered: delivery prices never set a store's price.
 */

const SOURCES = ["in_store", "drive_thru", "app"] as const satisfies readonly PriceSource[];

type State =
  | { kind: "idle" }
  | { kind: "sending"; source: PriceSource }
  | { kind: "done"; held: boolean }
  | { kind: "failed"; message: string };

export function StillThisPrice({ storeId, priceCents }: { storeId: string; priceCents: number }) {
  const router = useRouter();
  const labelId = useId();
  const { slotRef, getToken } = useTurnstile();
  const [state, setState] = useState<State>({ kind: "idle" });
  const price = formatCents(priceCents);

  async function confirm(source: PriceSource) {
    setState({ kind: "sending", source });
    const turnstileToken = await getToken();
    const result = await submitPrice({ storeId, priceCents, source, turnstileToken });
    if (!result.ok) {
      setState({ kind: "failed", message: result.message });
      return;
    }
    // "pending" only if the price on file moved a long way since this page
    // was built; the report then waits for a second one, like any other.
    setState({ kind: "done", held: result.status === "pending" });
    // The card's date and the report log catch up from the server.
    router.refresh();
  }

  if (state.kind === "done") {
    return (
      <div role="status" className="mt-5 flex items-start gap-2.5 text-sm">
        {/* The tick draws itself once (`.check-stroke`); under reduced motion it is simply there. */}
        <svg
          aria-hidden="true"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth={2.25}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="check-stroke mt-0.5 size-4 shrink-0 text-tier-low"
        >
          <path d="M4.5 12.5l5 5L19.5 7" pathLength={1} />
        </svg>
        <p className="text-ink-muted">
          {state.held ? (
            <>
              Logged. The price on file has changed since this page loaded, so your{" "}
              <span className="tabular text-ink">{price}</span> waits for a second report.
            </>
          ) : (
            <>
              Thanks. <span className="tabular text-ink">{price}</span> is confirmed as of today.
            </>
          )}
        </p>
      </div>
    );
  }

  const sending = state.kind === "sending";

  return (
    <div className="mt-5">
      <div role="group" aria-labelledby={labelId} aria-busy={sending}>
        <p id={labelId} className="text-sm text-ink-muted">
          Still <span className="tabular font-medium text-ink">{price}</span>? Tap where you saw it.
        </p>
        <div className="mt-2 flex flex-wrap gap-2">
          {SOURCES.map((source) => (
            <button
              key={source}
              type="button"
              disabled={sending}
              onClick={() => void confirm(source)}
              className="btn-quiet press inline-flex min-h-11 items-center gap-1.5 rounded-md border border-rule px-3.5 text-sm disabled:cursor-wait"
            >
              {state.kind === "sending" && state.source === source ? (
                <LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />
              ) : null}
              {PRICE_SOURCE_LABELS[source]}
            </button>
          ))}
        </div>
      </div>
      {/* Turnstile shows itself here only to a visitor it is unsure about. */}
      <div ref={slotRef} className="mt-3 empty:hidden" />
      <p role="status" className="mt-2 text-sm text-tier-high empty:hidden">
        {state.kind === "failed" ? state.message : ""}
      </p>
    </div>
  );
}
