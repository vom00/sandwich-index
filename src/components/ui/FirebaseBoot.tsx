"use client";

import { useEffect } from "react";

import { initAppCheck } from "@/lib/firebase/client";

/**
 * Starts App Check, if there is anything to start.
 *
 * `initAppCheck` returns immediately unless `NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY`
 * is set, so this is inert against the emulator and becomes live the moment a
 * real key is configured — no code change required to turn enforcement on.
 *
 * Mount time is early enough. Every read on this site goes through a server
 * route using the Admin SDK; the browser SDK is only ever used for the
 * submission write, which cannot happen before a user has clicked something.
 *
 * Renders nothing. It exists so that the wiring already written in
 * `lib/firebase/client.ts` is actually reachable — an App Check setup that is
 * never called is worse than none, because it looks like protection.
 *
 * **Cost, measured:** this sits in the root layout, so the browser SDK —
 * app, auth, firestore, App Check — ships to every route, ~180 KB compressed
 * of the landing page's 330 KB of JS, for a page that reads nothing from the
 * client.
 *
 * Converting this to a dynamic `import()` inside the effect was tried and
 * reverted: it changed nothing measurable. Next preloads the chunk graph, so
 * all 330 KB still arrived before 300 ms, with no chunk starting late. The
 * only fix that would actually move bytes is not mounting this on routes that
 * cannot write — which trades away having an App Check token ready before the
 * user reaches a form, and is a decision about security posture rather than a
 * bundling tweak.
 */
export function FirebaseBoot() {
  useEffect(() => {
    void initAppCheck().catch((error: unknown) => {
      // A failed App Check init must not take the page down with it. If
      // enforcement is on, the write it guards will fail on its own and say so.
      console.error("[app-check] initialisation failed", error);
    });
  }, []);

  return null;
}
