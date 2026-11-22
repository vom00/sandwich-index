import Link from "next/link";

import { Odometer } from "@/components/ui/Odometer";

export default function NotFound() {
  return (
    <main id="main" className="mx-auto w-full max-w-xl px-5 py-20 sm:px-8">
      {/* The status, set large; it rolls up on wheels as the page opens. */}
      <p className="reveal font-display text-7xl leading-none tracking-tight text-ink-subtle sm:text-8xl">
        <Odometer roll="load" value="404" />
      </p>

      <h1 className="reveal mt-5 font-display text-3xl leading-tight sm:text-4xl" style={{ animationDelay: "90ms" }}>
        There is nothing at this address
      </h1>

      <p className="reveal mt-4 leading-relaxed text-ink-muted" style={{ animationDelay: "160ms" }}>
        Which is a shame, because there is quite a lot at the other ones.
      </p>

      <div className="reveal mt-8 flex flex-wrap gap-3" style={{ animationDelay: "230ms" }}>
        <Link
          href="/map"
          className="btn-primary press inline-flex min-h-12 items-center rounded-md bg-accent px-5 py-3 font-medium text-accent-ink"
        >
          Find prices near you
          <span className="btn-arrow ml-2" aria-hidden="true">→</span>
        </Link>
        <Link
          href="/"
          className="btn-quiet press inline-flex min-h-12 items-center rounded-md border border-rule-strong px-5 py-3 font-medium"
        >
          Back to the start
        </Link>
      </div>
    </main>
  );
}
