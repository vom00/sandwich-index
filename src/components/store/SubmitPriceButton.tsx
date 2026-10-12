"use client";

import { ReceiptText } from "lucide-react";
import { useState } from "react";

import { SubmitPriceDialog } from "@/components/store/SubmitPriceDialog";

/**
 * The one thing this page asks of the reader.
 *
 * Kept as its own client component so the store page itself stays a server
 * component — the price, the chart data and the log are all server-rendered,
 * and only the button and the modal ship JavaScript.
 *
 * Focus returns here when the modal closes. That is not implemented below: it
 * is what `<dialog>.close()` does, and it is one of the reasons the modal is
 * built on the native element.
 */
export function SubmitPriceButton({
  storeId,
  storeLabel,
  storeAddress,
  restaurantNumber,
  hasPrices,
}: {
  storeId: string;
  storeLabel: string;
  storeAddress: string | null;
  restaurantNumber: string | null;
  hasPrices: boolean;
}) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="press inline-flex min-h-12 items-center justify-center gap-2 rounded-md bg-accent px-5 py-3 font-medium text-accent-ink"
      >
        <ReceiptText aria-hidden="true" className="size-4" />
        {hasPrices ? "Log a price" : "Log the first price"}
      </button>

      <SubmitPriceDialog
        open={open}
        onClose={() => setOpen(false)}
        storeId={storeId}
        storeLabel={storeLabel}
        storeAddress={storeAddress}
        restaurantNumber={restaurantNumber}
      />
    </>
  );
}
