"use client";

import { Camera, Check, Info, LoaderCircle, TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useRef, useState } from "react";

import { formatCents } from "@/lib/money";
import {
  checkStore,
  MAX_RECEIPT_AGE_DAYS,
  readPictureText,
  receiptAgeDays,
  type MissingReason,
  type PictureKind,
  type ReadPicture,
  type StoreCheck,
} from "@/lib/receipt";

/**
 * "Read the price from a photo": a receipt, or a screenshot of the McChicken
 * in the McDonald's app with this store selected.
 *
 * The photo is read on this device (`lib/ocr.ts`) and never uploaded. What it
 * finds goes into the price box for the person to check, and nothing is
 * submitted until they press "Log this price", so every rule a typed price
 * faces still applies. Three things stop it from filling anything in:
 *
 *   - the photo is from another store, by restaurant number or street number;
 *   - the receipt is more than a week old, because a report is dated when it
 *     is made (the security rules stamp it), and an old receipt would be
 *     recorded as today's price;
 *   - there is no plain McChicken on it, only a meal or a Spicy McChicken.
 */

const DATE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric" });

type State =
  | { phase: "idle" }
  | { phase: "reading"; preparing: boolean; percent: number }
  | { phase: "found"; read: ReadPicture & { mcchicken: NonNullable<ReadPicture["mcchicken"]> }; check: StoreCheck; ageDays: number | null }
  | { phase: "wrong-store"; read: ReadPicture; elsewhere: { id: string; label: string } | null }
  | { phase: "too-old"; read: ReadPicture; ageDays: number }
  | { phase: "not-found"; reason: MissingReason }
  | { phase: "failed" };

function printedDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  return DATE.format(new Date(year!, month! - 1, day!));
}

function where(read: ReadPicture): string {
  const parts = [read.street, read.restaurantNumber === null ? null : `Restaurant #${read.restaurantNumber}`];
  return parts.filter((part) => part !== null).join(", ");
}

async function findElsewhere(restaurantNumber: string | null): Promise<{ id: string; label: string } | null> {
  if (restaurantNumber === null) return null;
  try {
    const response = await fetch(`/api/stores/by-number/${encodeURIComponent(restaurantNumber)}`);
    if (!response.ok) return null;
    return (await response.json()) as { id: string; label: string };
  } catch {
    return null;
  }
}

export function ReadFromPhoto({
  storeAddress,
  restaurantNumber,
  disabled,
  onFound,
}: {
  storeAddress: string | null;
  restaurantNumber: string | null;
  disabled: boolean;
  onFound: (found: { priceCents: number; kind: PictureKind }) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<State>({ phase: "idle" });
  const reading = state.phase === "reading";

  async function handleFile(file: File) {
    setState({ phase: "reading", preparing: true, percent: 0 });
    let text: string;
    try {
      const { readTextOnDevice } = await import("@/lib/ocr");
      text = await readTextOnDevice(file, ({ status, progress }) => {
        const recognizing = status === "recognizing text";
        setState({ phase: "reading", preparing: !recognizing, percent: Math.round(progress * 100) });
      });
    } catch (error) {
      console.warn("[ReadFromPhoto] OCR failed", error);
      setState({ phase: "failed" });
      return;
    }

    const read = readPictureText(text);
    if (read.mcchicken === null) {
      setState({ phase: "not-found", reason: read.missing ?? "no-mcchicken" });
      return;
    }

    const check = checkStore(read, { restaurantNumber, address: storeAddress });
    if (check.verdict === "mismatch") {
      setState({ phase: "wrong-store", read, elsewhere: await findElsewhere(read.restaurantNumber) });
      return;
    }

    const ageDays = read.date === null ? null : receiptAgeDays(read.date);
    if (ageDays !== null && ageDays > MAX_RECEIPT_AGE_DAYS) {
      setState({ phase: "too-old", read, ageDays });
      return;
    }

    setState({ phase: "found", read: { ...read, mcchicken: read.mcchicken }, check, ageDays });
    onFound({ priceCents: read.mcchicken.unitCents, kind: read.kind ?? "receipt" });
  }

  return (
    <div className="mt-5">
      <button
        type="button"
        disabled={disabled || reading}
        onClick={() => inputRef.current?.click()}
        className="press inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-md border border-rule-strong px-4 py-2.5 text-sm font-medium disabled:opacity-70"
      >
        {reading ? (
          <LoaderCircle aria-hidden="true" className="size-4 animate-spin motion-reduce:animate-none" />
        ) : (
          <Camera aria-hidden="true" className="size-4" />
        )}
        {state.phase === "idle" || reading ? "Read the price from a photo" : "Read another photo"}
      </button>
      <p className="mt-1 text-xs text-ink-subtle">
        A receipt, or a screenshot of the McChicken in the McDonald&rsquo;s app.
        The photo is read on this device and never uploaded.
      </p>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        hidden
        data-testid="photo-input"
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Cleared so choosing the same photo again still fires a change.
          event.target.value = "";
          if (file !== undefined) void handleFile(file);
        }}
      />

      <div role="status">
        {state.phase === "idle" ? null : <Outcome state={state} />}
      </div>
    </div>
  );
}

function Note({ tone, children }: { tone: "ok" | "warn" | "info"; children: React.ReactNode }) {
  const Icon = tone === "ok" ? Check : tone === "warn" ? TriangleAlert : Info;
  const color = tone === "ok" ? "text-tier-low" : tone === "warn" ? "text-danger" : "text-ink-muted";
  return (
    <div className="mt-3 flex gap-2.5 rounded-md border border-rule bg-paper-sunken p-3 text-sm leading-relaxed">
      <Icon aria-hidden="true" className={`mt-0.5 size-4 shrink-0 ${color}`} />
      <div>{children}</div>
    </div>
  );
}

function Outcome({ state }: { state: Exclude<State, { phase: "idle" }> }) {
  switch (state.phase) {
    case "reading":
      return (
        <Note tone="info">
          {state.preparing
            ? "Getting the photo reader ready. The first time, that downloads about 7 MB."
            : "Reading the photo…"}
          {/* The number changes many times a second; a screen reader would
              read every one of them. */}
          <span aria-hidden="true" className="tabular ml-1 text-ink-subtle">
            {state.percent}%
          </span>
        </Note>
      );

    case "found": {
      const { read, check, ageDays } = state;
      const each = read.mcchicken.quantity > 1 ? ` each (${read.mcchicken.quantity} on the receipt)` : "";
      return (
        <Note tone="ok">
          <p>
            Found a McChicken at <span className="tabular">{formatCents(read.mcchicken.unitCents)}</span>
            {each} {read.kind === "app" ? "in this app screenshot" : "on this receipt"}
            {read.date === null ? "" : `, dated ${printedDate(read.date)}`}. It&rsquo;s in the price box
            below. Check it, then log it.
          </p>
          {read.kind === "app" ? (
            <p className="mt-1 text-ink-muted">&ldquo;Where was the price?&rdquo; is set to Mobile app.</p>
          ) : null}
          {check.verdict === "unknown" ? (
            <p className="mt-1 text-ink-muted">
              It doesn&rsquo;t say which store it&rsquo;s from in a way we could read, so make sure
              it&rsquo;s this one.
            </p>
          ) : null}
          {ageDays !== null && ageDays >= 2 ? (
            <p className="mt-1 text-ink-muted">It will be logged as today&rsquo;s price.</p>
          ) : null}
        </Note>
      );
    }

    case "wrong-store":
      return (
        <Note tone="warn">
          <p>
            This {state.read.kind === "app" ? "screenshot" : "receipt"} is from a different
            McDonald&rsquo;s{where(state.read) === "" ? "" : `: ${where(state.read)}`}. Nothing was
            filled in.
          </p>
          {state.elsewhere !== null ? (
            <p className="mt-1">
              <Link
                href={`/store/${state.elsewhere.id}`}
                className="underline decoration-rule-strong underline-offset-2 hover-accent"
              >
                Log it on the page for {state.elsewhere.label}
              </Link>
            </p>
          ) : null}
        </Note>
      );

    case "too-old":
      return (
        <Note tone="warn">
          This receipt is from {state.read.date === null ? "a while ago" : printedDate(state.read.date)},{" "}
          {state.ageDays} days ago. A price logged here is recorded as today&rsquo;s, so only receipts
          from the last {MAX_RECEIPT_AGE_DAYS} days are read. Nothing was filled in.
        </Note>
      );

    case "not-found":
      return (
        <Note tone="warn">
          {state.reason === "no-text"
            ? "Couldn't read any text in that photo. A flat, well-lit, close-up shot works best."
            : state.reason === "only-variants"
              ? "That photo has a McChicken meal or a Spicy McChicken, but not the sandwich on its own, which is the price this site tracks."
              : "Couldn't find a McChicken price in that photo. You can type it in instead."}
        </Note>
      );

    case "failed":
      return <Note tone="warn">The photo reader couldn&rsquo;t load. You can type the price in instead.</Note>;
  }
}
