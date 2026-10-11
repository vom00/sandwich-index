"use client";

import { useSyncExternalStore } from "react";

function subscribe(callback: () => void): () => void {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

/**
 * Whether the browser thinks it has a connection.
 *
 * `navigator.onLine` is famously optimistic — it reports true for a captive
 * portal or a router with no upstream — so a false here is trustworthy and a
 * true is only a hint. Everything in this app is built to survive a request
 * failing anyway; this exists to explain the failure before it happens, not to
 * decide whether to try.
 *
 * The server snapshot is `true`: rendering an offline warning into the HTML of
 * a page that was just successfully fetched would be absurd.
 */
export function useOnlineStatus(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => navigator.onLine,
    () => true,
  );
}
