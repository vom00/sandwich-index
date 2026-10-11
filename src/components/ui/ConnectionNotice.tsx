"use client";

import { CloudOff } from "lucide-react";

import { useOnlineStatus } from "@/hooks/useOnlineStatus";

/**
 * The offline banner.
 *
 * What it says is deliberately specific about what still works. Reads are
 * whatever the page already loaded; writes will fail. Saying only "you are
 * offline" leaves somebody to discover the second half by losing a submission.
 *
 * Firestore's offline persistence would queue that submission and replay it on
 * reconnect, and it is deliberately not enabled — see the README. A queued
 * price carries a status predicted against a price that may have moved by the
 * time it commits, so the security rule would reject it on replay, silently,
 * long after the contributor was told it had saved. Failing now and saying so
 * is the better of the two.
 *
 * The live region is always mounted, empty, so a screen reader announces the
 * change rather than the arrival of a new element. Fixed to the bottom of the
 * viewport so appearing costs no layout shift.
 */
export function ConnectionNotice() {
  const online = useOnlineStatus();

  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[2000] flex justify-center p-3"
    >
      {online ? null : (
        <p className="offline-banner pointer-events-auto flex items-start gap-2.5 rounded-md border border-rule-strong bg-ink px-4 py-3 text-sm leading-relaxed text-paper shadow-lg sm:items-center">
          <CloudOff aria-hidden="true" className="mt-0.5 size-4 shrink-0 sm:mt-0" />
          <span className="max-w-md">
            You are offline. Prices on screen were loaded before the connection
            dropped, and nothing you submit will save until it is back.
          </span>
        </p>
      )}
    </div>
  );
}
