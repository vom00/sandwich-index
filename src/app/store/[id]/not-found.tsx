import Link from "next/link";

export default function StoreNotFound() {
  return (
    <main id="main" className="mx-auto w-full max-w-xl px-5 py-20 sm:px-8">
      <h1 className="reveal font-display text-3xl">We do not have that store</h1>
      <p className="reveal mt-4 leading-relaxed text-ink-muted" style={{ animationDelay: "80ms" }}>
        The link may be mistyped, or the store may have closed and been
        removed. Either way there is nothing to show here.
      </p>
      {/* The rise is on a wrapper: its fill would otherwise hold the button's
          transform and cancel the press. */}
      <div className="reveal mt-8" style={{ animationDelay: "160ms" }}>
        <Link
          href="/map"
          className="btn-primary press inline-flex min-h-11 items-center rounded-md bg-accent px-5 py-3 font-medium text-accent-ink"
        >
          <span className="btn-arrow-back mr-2" aria-hidden="true">←</span>
          Back to the map
        </Link>
      </div>
    </main>
  );
}
