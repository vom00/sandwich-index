import Link from "next/link";

export default function NotFound() {
  return (
    <main id="main" className="mx-auto w-full max-w-xl px-5 py-20 sm:px-8">
      <p className="font-mono text-xs uppercase tracking-[0.22em] text-ink-subtle">
        404
      </p>

      <h1 className="mt-3 font-display text-3xl leading-tight sm:text-4xl">
        There is nothing at this address
      </h1>

      <p className="mt-4 leading-relaxed text-ink-muted">
        Which is a shame, because there is quite a lot at the other ones.
      </p>

      <div className="mt-8 flex flex-wrap gap-3">
        <Link
          href="/map"
          className="press inline-flex min-h-12 items-center rounded-md bg-accent px-5 py-3 font-medium text-accent-ink"
        >
          Find prices near you
        </Link>
        <Link
          href="/"
          className="press inline-flex min-h-12 items-center rounded-md border border-rule-strong px-5 py-3 font-medium"
        >
          Back to the start
        </Link>
      </div>
    </main>
  );
}
