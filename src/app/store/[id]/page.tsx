import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { PriceComparison } from "@/components/store/PriceComparison";
import { PriceHistory } from "@/components/store/PriceHistory";
import { SubmissionLog } from "@/components/store/SubmissionLog";
import { SubmitPriceButton } from "@/components/store/SubmitPriceButton";
import { Confidence } from "@/components/ui/Confidence";
import { StoreStateBadge } from "@/components/ui/StoreStateBadge";
import { formatCents } from "@/lib/money";
import {
  getAreaComparison,
  getStore,
  getSubmissionsForStore,
} from "@/lib/stores.server";
import { storeLabel, storeLabelText } from "@/lib/store-label";
import { displayStateFor, relativeAge } from "@/lib/tiers";
import { storeIdSchema } from "@/lib/validation";

/**
 * Rendered per request, never cached.
 *
 * The price can change the second somebody submits a report, and nothing here
 * revalidates a cached copy. A store page quoting yesterday's number is the
 * exact failure this project exists to avoid, so the full route cache is opted
 * out of rather than trusted.
 */
export const dynamic = "force-dynamic";

/**
 * There is deliberately no `loading.tsx` beside this file.
 *
 * A route-level loading fallback makes Next stream the response, which means
 * the 200 header is already on the wire by the time `notFound()` runs below.
 * The 404 page then renders with a 200 status — correct to look at, wrong to
 * anything that reads status codes, which is every crawler and every link
 * checker. A shareable page has to be honest about whether it exists, and the
 * three reads it takes to answer that are fast enough not to need covering up.
 */

export async function generateMetadata(
  props: PageProps<"/store/[id]">,
): Promise<Metadata> {
  const { id } = await props.params;
  const parsed = storeIdSchema.safeParse(id);
  if (!parsed.success) return { title: "Store — Sandwich Index" };

  const store = await getStore(parsed.data);
  if (store === null) return { title: "Store not found — Sandwich Index" };

  const where = storeLabelText(store);
  return {
    title: `${where} — Sandwich Index`,
    description:
      store.priceCents === null
        ? `No McChicken prices have been submitted for ${where} yet.`
        : `McChicken priced at ${formatCents(store.priceCents)}, from ${store.confirmedCount} confirmed reports.`,
  };
}

export default async function StorePage(props: PageProps<"/store/[id]">) {
  const { id } = await props.params;

  const parsed = storeIdSchema.safeParse(id);
  if (!parsed.success) notFound();

  const [store, submissions] = await Promise.all([
    getStore(parsed.data),
    getSubmissionsForStore(parsed.data),
  ]);

  if (store === null) notFound();

  // Depends on the store record, so it cannot join the parallel batch above.
  const comparison = await getAreaComparison(store);

  const state = displayStateFor(store);
  const label = storeLabel(store);

  return (
    <main id="main" className="mx-auto w-full max-w-3xl px-5 py-10 sm:px-8 sm:py-14">
      <Link
        href="/map"
        className="hover-accent inline-flex min-h-11 items-center text-sm underline decoration-rule underline-offset-4"
      >
        Back to the map
      </Link>

      <header className="mt-3">
        <p className="font-mono text-xs uppercase tracking-[0.18em] text-ink-subtle">
          McChicken price
        </p>
        <h1 className="mt-2 font-display text-3xl leading-tight sm:text-4xl">
          {label.text}
          {label.qualifier !== null ? (
            <span className="text-2xl text-ink-subtle"> ({label.qualifier})</span>
          ) : null}
        </h1>
        <p className="mt-2 text-sm text-ink-subtle">
          Location from OpenStreetMap. Prices from whoever walked in and told us.
        </p>
      </header>

      <div className="mt-8 flex flex-wrap items-end justify-between gap-x-8 gap-y-5">
        <div>
          {store.priceCents === null ? (
            <p className="max-w-md text-lg leading-relaxed text-ink-muted">
              Nobody has reported a price for this store. There is nothing to
              show and no honest way to guess one.
            </p>
          ) : (
            <>
              <div className="flex items-baseline gap-2">
                <span className="tabular text-5xl font-medium sm:text-6xl">
                  {formatCents(store.priceCents)}
                </span>
                <span className="text-sm text-ink-subtle">current price</span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                <Confidence
                  sampleCount={store.confirmedCount}
                  totalCount={store.reportCount}
                />
                {store.pricedAt !== null ? (
                  <span className="text-xs text-ink-subtle">
                    last confirmed {relativeAge(store.pricedAt)}
                  </span>
                ) : null}
              </div>
            </>
          )}

          {state !== "priced" ? (
            <div className="mt-3">
              <StoreStateBadge state={state} pricedAt={store.pricedAt} />
            </div>
          ) : null}
        </div>

        <SubmitPriceButton
          storeId={store.id}
          storeLabel={label.text}
          hasPrices={store.reportCount > 0}
        />
      </div>

      <PriceComparison comparison={comparison} />

      <section className="mt-12">
        <h2 className="font-display text-2xl">Price history</h2>
        <PriceHistory
          submissions={submissions}
          priceCents={store.priceCents}
        />
      </section>

      <section className="mt-12 border-t border-rule pt-8">
        <h2 className="font-display text-2xl">Every report</h2>
        <SubmissionLog submissions={submissions} />
      </section>
    </main>
  );
}
