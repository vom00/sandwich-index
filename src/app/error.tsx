"use client";

import { TriangleAlert } from "lucide-react";
import Link from "next/link";
import { useEffect } from "react";

/**
 * The boundary for every route under it.
 *
 * Two rules govern the copy: say what failed in terms the reader can act on,
 * and never claim to know something we do not. Nearly every failure that lands
 * here is Firestore being unreachable, but it could be anything, so the page
 * says what it can and offers the two things that sometimes help.
 *
 * The `digest` is shown deliberately. Next replaces server error messages with
 * an opaque hash in production, and printing it is the only way somebody
 * reporting a problem can give us anything to search the logs for.
 */
export default function RouteError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error("[route error]", error);
  }, [error]);

  return (
    <main id="main" className="mx-auto w-full max-w-xl px-5 py-20 sm:px-8">
      <TriangleAlert aria-hidden="true" className="size-6 text-danger" />

      <h1 className="mt-4 font-display text-3xl leading-tight">
        That did not load
      </h1>

      <p className="mt-4 leading-relaxed text-ink-muted">
        Something broke between here and the price database. Nothing you did
        caused it, and nothing you have submitted has been lost.
      </p>

      <div className="mt-8 flex flex-wrap gap-3">
        <button
          type="button"
          onClick={reset}
          className="press inline-flex min-h-12 items-center rounded-md bg-accent px-5 py-3 font-medium text-accent-ink"
        >
          Try again
        </button>
        <Link
          href="/"
          className="press inline-flex min-h-12 items-center rounded-md border border-rule-strong px-5 py-3 font-medium"
        >
          Back to the start
        </Link>
      </div>

      {error.digest !== undefined ? (
        <p className="mt-10 text-sm text-ink-subtle">
          If you report this, quote{" "}
          <code className="tabular text-ink">{error.digest}</code>.
        </p>
      ) : null}
    </main>
  );
}
