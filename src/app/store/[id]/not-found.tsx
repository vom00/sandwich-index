import Link from "next/link";

export default function StoreNotFound() {
  return (
    <main id="main" className="mx-auto w-full max-w-xl px-5 py-20 sm:px-8">
      <h1 className="font-display text-3xl">We do not have that store</h1>
      <p className="mt-4 leading-relaxed text-ink-muted">
        It may never have been in OpenStreetMap, or it may have closed and been
        removed. Either way there is nothing to show here.
      </p>
      <Link
        href="/map"
        className="press mt-8 inline-flex min-h-11 items-center rounded-md bg-accent px-5 py-3 font-medium text-accent-ink"
      >
        Back to the map
      </Link>
    </main>
  );
}
