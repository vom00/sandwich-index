import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { cache } from "react";

import { ObservationLog } from "@/components/store/ObservationLog";
import { PriceComparison } from "@/components/store/PriceComparison";
import { PriceHistory } from "@/components/store/PriceHistory";
import { ShareGifButton } from "@/components/store/ShareGifButton";
import { SubmissionLog } from "@/components/store/SubmissionLog";
import { StoreMorphLanding } from "@/components/store/StoreMorphLanding";
import { SubmitPriceButton } from "@/components/store/SubmitPriceButton";
import { Confidence } from "@/components/ui/Confidence";
import { FeedCredit } from "@/components/ui/FeedCredit";
import { Odometer } from "@/components/ui/Odometer";
import { StoreStateBadge } from "@/components/ui/StoreStateBadge";
import { WordRise } from "@/components/ui/WordRise";
import { feedName } from "@/lib/feeds";
import { formatCents } from "@/lib/money";
import { priceAge } from "@/lib/provenance";
import { siteUrl } from "@/lib/site";
import { storeCard } from "@/lib/store-card";
import { getCachedAreaPeers } from "@/lib/area-peers.server";
import {
  areaCellFor,
  areaComparisonFrom,
  getObservationsForStore,
  getStore,
  getSubmissionsForStore,
} from "@/lib/stores.server";
import { storeLabel, storeLabelText } from "@/lib/store-label";
import { locationSource } from "@/lib/store-list";
import { displayStateFor, relativeAge } from "@/lib/tiers";
import { storeIdSchema } from "@/lib/validation";

/**
 * Cached per store, and dropped the moment the store changes.
 *
 * Rendering every view cost a store read, its history and, once an hour per
 * area, hundreds of neighbours (`area-peers.server`), so a crawler walking
 * store pages could spend the free tier's 50,000 reads a day on its own. Each
 * page is now built on its first visit and kept, but a cached page must never
 * quote a superseded price, so every write that changes a store drops it:
 * a visitor's report (the submission route, whether or not the price moved),
 * a recompute that changed it, and a sync that changed anything in its area
 * (`api/stores/sync`). Scripts that write through the Admin SDK cannot reach
 * Next's cache; the hourly rebuild below is the backstop for those, and keeps
 * relative ages and the stale mark honest.
 */
export const revalidate = 3600;

/** None at build time: every store page is built on its first visit. */
export function generateStaticParams(): { id: string }[] {
  return [];
}

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

/**
 * One read of the store per render: the metadata and the page both need it,
 * and on Firestore's free tier every read is counted.
 */
const readStore = cache((id: string) => getStore(id));

export async function generateMetadata(
  props: PageProps<"/store/[id]">,
): Promise<Metadata> {
  const { id } = await props.params;
  const parsed = storeIdSchema.safeParse(id);
  if (!parsed.success) return { title: "Store — Sandwich Index" };

  const store = await readStore(parsed.data);
  if (store === null) return { title: "Store not found — Sandwich Index" };

  const where = storeLabelText(store);
  return {
    title: `${where} — Sandwich Index`,
    description:
      store.priceCents === null
        ? `No McChicken prices have been submitted for ${where} yet.`
        : store.priceFeed !== null
          ? `McChicken priced at ${formatCents(store.priceCents)}, as listed by ${feedName(store.priceFeed)}.`
          : `McChicken priced at ${formatCents(store.priceCents)}, from ${store.confirmedCount} confirmed reports.`,
  };
}

export default async function StorePage(props: PageProps<"/store/[id]">) {
  const { id } = await props.params;

  const parsed = storeIdSchema.safeParse(id);
  if (!parsed.success) notFound();

  const [store, submissions, observations] = await Promise.all([
    readStore(parsed.data),
    getSubmissionsForStore(parsed.data),
    getObservationsForStore(parsed.data),
  ]);

  if (store === null) notFound();

  // Depends on the store record, so it cannot join the parallel batch above.
  const [peers, card] = await Promise.all([getCachedAreaPeers(areaCellFor(store)), storeCard(store)]);
  const comparison = areaComparisonFrom(store, peers);

  const state = displayStateFor(store);
  const label = storeLabel(store);

  // The observation behind a feed-set price, so the figure can link to the
  // page that vouches for it. The newest one from that feed is the one the
  // replay used; nothing newer from the feed exists to have replaced it.
  const behindPrice =
    store.priceFeed === null
      ? null
      : (observations.find((observation) => observation.feed === store.priceFeed) ?? null);

  // The newest report still waiting, for the held slot's date. Submissions
  // come newest first.
  const heldReport =
    store.heldPriceCents === null
      ? null
      : (submissions.find(
          (submission) => submission.status === "pending" && submission.priceCents === store.heldPriceCents,
        ) ?? null);

  return (
    // `data-morph-page`, the name and the price below: where a store row or
    // sheet on the map lands when it morphs into this page (`lib/store-morph`).
    <main id="main" data-morph-page className="mx-auto w-full max-w-3xl px-5 py-10 sm:px-8 sm:py-14">
      <StoreMorphLanding />
      <Link href="/map" className="link-wipe hover-accent inline-flex min-h-11 items-center gap-1.5 text-sm">
        <span className="btn-arrow-back" aria-hidden="true">←</span>
        <span className="wipe">Back to the map</span>
      </Link>

      {/* The header and the price card come in as one short staggered rise. */}
      <header className="mt-3">
        <p className="reveal font-mono text-xs uppercase tracking-[0.18em] text-ink-subtle">
          McChicken price
        </p>
        <h1
          data-morph-target="name"
          className="reveal mt-2 w-fit font-display text-3xl leading-tight sm:text-4xl"
          style={{ animationDelay: "70ms" }}
        >
          {label.text}
          {label.qualifier !== null ? (
            <span className="text-2xl text-ink-subtle"> ({label.qualifier})</span>
          ) : null}
        </h1>
        <p className="reveal mt-2 text-sm text-ink-subtle" style={{ animationDelay: "140ms" }}>
          {`Location from ${locationSource(store.id)}. `}
          {observations.length === 0
            ? "Prices from whoever walked in and told us."
            : "Prices from visitors and from the price feeds listed below, each under its own name."}
        </p>
      </header>

      <div
        className="reveal mt-8 flex flex-wrap items-end justify-between gap-x-8 gap-y-5 rounded-2xl border border-rule bg-paper-raised p-5 shadow-[0_1px_2px_rgb(21_20_15/0.05),0_12px_32px_-20px_rgb(21_20_15/0.25)] sm:p-7"
        style={{ animationDelay: "210ms" }}
      >
        <div>
          {store.priceCents === null ? (
            // The empty state says what is missing, why, and the one thing
            // that fills it; the button beside it is that thing.
            <div className="max-w-md">
              <p className="font-display text-2xl leading-snug">No price here yet</p>
              <p className="mt-2 leading-relaxed text-ink-muted">
                Nobody has reported a price for this store, and we won&rsquo;t
                guess one. Seen it on a receipt, the menu board or the app? Log it
                and it becomes this store&rsquo;s price.
              </p>
            </div>
          ) : (
            <>
              <div className="flex items-baseline gap-2">
                {/* Rolls up on wheels from the first paint; the figure itself
                    is plain text inside (`Odometer`). */}
                <Odometer
                  roll="load"
                  morph="target"
                  value={formatCents(store.priceCents)}
                  className="tabular text-5xl font-medium sm:text-6xl"
                />
                <span className="text-sm text-ink-subtle">current price</span>
              </div>
              <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1">
                <Confidence
                  sampleCount={store.confirmedCount}
                  totalCount={store.reportCount}
                  priceFeed={store.priceFeed}
                />
                {store.pricedAt !== null ? (
                  <span className="text-xs text-ink-subtle">{priceAge(store)}</span>
                ) : null}
                {behindPrice?.sourceUrl ? (
                  <a
                    href={behindPrice.sourceUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="link-prose inline-flex min-h-11 items-center text-xs"
                  >
                    Check it at the source
                    <span className="sr-only"> (opens {feedName(behindPrice.feed)} in a new tab)</span>
                  </a>
                ) : null}
              </div>
              {behindPrice !== null ? (
                <FeedCredit feed={behindPrice.feed} observedAt={behindPrice.observedAt} className="mt-1 text-xs text-ink-subtle" />
              ) : null}
              {store.heldPriceCents !== null ? (
                // A report more than 40% from the price waits in a slot of
                // its own until a second person agrees (`lib/pricing`). It
                // rises in once, with the card, or when it first appears
                // after a visitor logs it.
                <div
                  data-held-slot
                  className="reveal mt-4 flex max-w-md flex-wrap items-baseline gap-x-3 gap-y-1 rounded-md border border-dashed border-ink-subtle/60 px-3.5 py-2.5"
                  style={{ animationDelay: "280ms" }}
                >
                  <span className="tabular text-lg font-medium text-ink-muted">
                    {formatCents(store.heldPriceCents)}
                  </span>
                  <span className="text-xs leading-relaxed text-ink-subtle">
                    held{heldReport !== null ? `, reported ${relativeAge(heldReport.submittedAt)}` : ""}. One
                    more report of the same price makes it this store&rsquo;s price.
                  </span>
                </div>
              ) : null}
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
          storeAddress={store.address}
          restaurantNumber={store.restaurantNumber}
          hasPrices={store.reportCount > 0}
        />
      </div>

      {card.priced ? (
        <ShareGifButton card={card} host={new URL(siteUrl()).host} fileName={`mcchicken-price-${store.id}.gif`} />
      ) : null}

      <PriceComparison comparison={comparison} />

      <section className="mt-12">
        <h2 className="wr font-display text-2xl">
          <WordRise text="Price history" />
        </h2>
        <PriceHistory
          submissions={submissions}
          observations={observations}
          priceCents={store.priceCents}
        />
      </section>

      <section className="mt-12 border-t border-rule pt-8">
        <h2 className="wr font-display text-2xl">
          <WordRise text="Every report" />
        </h2>
        <SubmissionLog submissions={submissions} />
      </section>

      {observations.length > 0 ? (
        <section className="mt-12 border-t border-rule pt-8">
          <h2 className="wr font-display text-2xl">
            <WordRise text="From price feeds" />
          </h2>
          <ObservationLog observations={observations} />
        </section>
      ) : null}
    </main>
  );
}
