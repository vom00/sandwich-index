import type { Metadata } from "next";
import Link from "next/link";

import { CountUpPrice } from "@/components/landing/CountUpPrice";
import { HAS_LICENSED_FEED } from "@/lib/feeds";
import { formatCents } from "@/lib/money";
import { priceAge, provenanceSummary } from "@/lib/provenance";
import { getIndexSnapshot, type IndexSnapshot } from "@/lib/stores.server";
import { storeLabelText } from "@/lib/store-label";
import type { StoreWithId } from "@/types";

/**
 * The landing page.
 *
 * Editorial data journalism: the number is the artwork, rules do the structural
 * work that cards and shadows would do elsewhere, and there is exactly one
 * heavy element on the page — the inverted band at the end.
 *
 * Everything on it is live. There is no placeholder copy, no illustrative
 * figure, and no "$1.42" hardcoded anywhere; if the database is empty the page
 * says so in as many words. A price index whose front page invents its headline
 * has nothing left to sell.
 *
 * Deliberately not named after a metro area. The data is Dallas–Fort Worth
 * today, but nothing in the schema knows that, and a hardcoded region becomes a
 * lie the first time someone syncs a different one. The addresses in the table
 * below say where this is well enough.
 */

export const dynamic = "force-dynamic";

/**
 * There is no `loading.tsx` for this route, and that is a measured decision
 * rather than an omission.
 *
 * A skeleton was built for it, sized against the real layout. It scored 0.28
 * cumulative layout shift at 1440px — nearly three times the budget — because
 * a hero whose type wraps and whose figure is `clamp()`-sized cannot be
 * predicted by a static placeholder, and every discrepancy is a shift. Without
 * it the page measures 0.0000. A skeleton that shifts the page more than having
 * no skeleton is a skeleton doing the opposite of its job.
 *
 * Worth knowing if one is ever added back: a `loading.tsx` at the app root also
 * puts a Suspense boundary above every other route, and a streamed response has
 * already sent its 200 by the time `/store/<unknown>` calls `notFound()`. It
 * would need to live in a route group covering only this page.
 */

const LEADER_LIMIT = 3;

export async function generateMetadata(): Promise<Metadata> {
  const snapshot = await getIndexSnapshot(undefined, LEADER_LIMIT);

  return {
    title: "Sandwich Index — what a McChicken actually costs",
    description:
      snapshot.spreadCents === null
        ? `Tracking McChicken prices across ${snapshot.trackedStoreCount} McDonald's locations. ${HAS_LICENSED_FEED ? "Every price either paid by a visitor or observed by a named price feed." : "Every price submitted by somebody who paid it."}`
        : `${formatCents(snapshot.spreadCents)} separates the cheapest McChicken in the index from the priciest, across ${snapshot.pricedStoreCount} stores with current prices.`,
  };
}

export default async function Home() {
  const snapshot = await getIndexSnapshot(undefined, LEADER_LIMIT);

  return (
    <main id="main">
      <div className="mx-auto w-full max-w-[68rem] px-5 sm:px-8">
        <Hero snapshot={snapshot} />
        <Premise />
        <LiveProof snapshot={snapshot} />
        <HowItWorks />
      </div>

      <Contribute snapshot={snapshot} />
    </main>
  );
}

/* ------------------------------------------------------------------------ */

function Eyebrow({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return (
    <p
      className={`font-mono text-[0.6875rem] uppercase tracking-[0.22em] text-ink-subtle ${className}`}
    >
      {children}
    </p>
  );
}

function Hero({ snapshot }: { snapshot: IndexSnapshot }) {
  const { spreadCents, lowestPriceCents, highestPriceCents } = snapshot;

  return (
    <section className="border-b border-rule pb-14 pt-12 sm:pt-16">
      <Eyebrow className="reveal">
        {snapshot.trackedStoreCount} stores tracked ·{" "}
        {snapshot.pricedStoreCount} with a current price
      </Eyebrow>

      {spreadCents === null ? (
        <>
          <h1
            className="reveal mt-7 max-w-3xl font-display text-4xl leading-[1.05] sm:text-6xl"
            style={{ animationDelay: "70ms" }}
          >
            Nothing to report yet.
          </h1>
          <p
            className="reveal mt-6 max-w-xl text-lg leading-relaxed text-ink-muted"
            style={{ animationDelay: "150ms" }}
          >
            There are {snapshot.trackedStoreCount} restaurants on file and not one
            price among them yet.{" "}
            {HAS_LICENSED_FEED
              ? "The first number on this page will be one somebody paid or a feed recorded, and it will say which."
              : "The first number on this page will be one that somebody actually paid."}
          </p>
        </>
      ) : (
        <>
          {/* The number and the sentence are one heading. The figure is not
              decoration sitting above a headline — it is the subject of it. */}
          {/* `auto` rather than a fixed column split, so the sentence sits
              against the figure instead of across a gap whose width depends on
              how many digits today's number happens to have. */}
          <h1 className="mt-7 grid gap-x-10 gap-y-4 lg:grid-cols-[auto_minmax(0,1fr)] lg:items-end">
            <span className="reveal block" style={{ animationDelay: "70ms" }}>
              <CountUpPrice cents={spreadCents} className="hero-figure" />
            </span>
            <span
              className="reveal block max-w-lg font-display text-2xl leading-[1.2] sm:text-[1.75rem] lg:pb-5"
              style={{ animationDelay: "170ms" }}
            >
              separates the cheapest McChicken in the index from the priciest.
            </span>
          </h1>

          {/* The one place the grid is broken: this measurement spans the full
              width while every other line of type stays inside the column. */}
          <div className="reveal mt-14" style={{ animationDelay: "270ms" }}>
            <IntervalBar
              lowCents={lowestPriceCents}
              highCents={highestPriceCents}
              storeCount={snapshot.pricedStoreCount}
            />
          </div>

          <div
            className="reveal mt-12 flex flex-col gap-x-8 gap-y-5 sm:flex-row sm:items-center"
            style={{ animationDelay: "350ms" }}
          >
            <Link
              href="/map"
              className="press inline-flex min-h-12 shrink-0 items-center justify-center rounded-md bg-accent px-6 py-3 font-medium text-accent-ink"
            >
              Find prices near you
            </Link>
            <p className="max-w-md leading-relaxed text-ink-muted">
              Same sandwich, same week, different franchisee. Nobody publishes
              this, so it gets built one receipt at a time.
            </p>
          </div>
        </>
      )}
    </section>
  );
}

/**
 * The spread drawn as a measured interval — two prices with the distance
 * between them marked, the way a dimension is called out on a drawing.
 *
 * Both endpoints are labelled in words as well as position, so the graphic is
 * never carrying information the text does not also carry.
 */
function IntervalBar({
  lowCents,
  highCents,
  storeCount,
}: {
  lowCents: number | null;
  highCents: number | null;
  storeCount: number;
}) {
  if (lowCents === null || highCents === null) return null;

  return (
    <div>
      <div className="flex items-end gap-4 sm:gap-8">
        <div className="shrink-0">
          <Eyebrow>Cheapest</Eyebrow>
          <p className="tabular mt-1.5 text-xl sm:text-2xl">{formatCents(lowCents)}</p>
        </div>

        <div aria-hidden="true" className="relative mb-3 h-px flex-1 bg-rule">
          <span className="absolute -top-2 left-0 h-4 w-px bg-rule-strong" />
          <span className="absolute -top-2 right-0 h-4 w-px bg-rule-strong" />
        </div>

        <div className="shrink-0 text-right">
          <Eyebrow>Priciest</Eyebrow>
          <p className="tabular mt-1.5 text-xl sm:text-2xl">{formatCents(highCents)}</p>
        </div>
      </div>

      <p className="mt-3 text-sm text-ink-subtle">
        Across {storeCount} {storeCount === 1 ? "store" : "stores"} with a price
        from the last three months. Stores whose latest price is older than that
        are left out of this figure.
      </p>
    </div>
  );
}

/* ------------------------------------------------------------------------ */

function Premise() {
  return (
    <section className="mt-24 grid gap-6 lg:grid-cols-12">
      {/* The section heading sits in the gutter as a running head rather than
          competing with the body type for the reader's attention. */}
      <h2 className="font-mono text-[0.6875rem] uppercase tracking-[0.22em] text-ink-subtle lg:col-span-3 lg:pt-2">
        Why it moves
      </h2>

      <div className="lg:col-span-8 lg:col-start-5">
        <p className="max-w-2xl font-display text-2xl leading-[1.3] sm:text-[1.75rem]">
          Most McDonald&rsquo;s restaurants in the United States are owned and run
          by independent franchisees, not by the corporation. Suggested prices are
          exactly that. The operator decides.
        </p>

        <div className="mt-7 max-w-xl space-y-4 leading-relaxed text-ink-muted">
          <p>
            So the sandwich costs what the person running that particular
            restaurant decided it should cost, shaped by their rent, their wages,
            and whatever the store on the other side of the highway is charging.
          </p>
          <p>
            None of that is published anywhere. Two restaurants a few minutes
            apart can differ by more than a dollar on the same item, and there is
            no way to find out before you have already ordered. This is an attempt
            to write it down.
          </p>
        </div>
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------------ */

function LiveProof({ snapshot }: { snapshot: IndexSnapshot }) {
  if (snapshot.pricedStoreCount === 0) return null;

  // Below twice the leader limit the two lists would share entries, which reads
  // as a bug rather than as a small dataset. One ranked list is the honest shape.
  const splitIsMeaningful = snapshot.pricedStoreCount >= LEADER_LIMIT * 2;

  return (
    <section className="mt-24 border-t border-rule pt-10">
      <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-3">
        <h2 className="font-display text-2xl sm:text-3xl">
          {splitIsMeaningful ? "The ends of the range" : "What is on file"}
        </h2>
        <Link
          href="/map"
          className="hover-accent inline-flex min-h-11 items-center text-sm underline decoration-rule underline-offset-4"
        >
          See all {snapshot.trackedStoreCount} on the map
        </Link>
      </div>

      <div className="mt-8 grid gap-x-14 gap-y-12 md:grid-cols-2">
        <Leaderboard
          heading="Cheapest right now"
          stores={snapshot.cheapest}
          startRank={1}
        />
        {splitIsMeaningful ? (
          <Leaderboard
            heading="Priciest right now"
            stores={snapshot.priciest}
            startRank={snapshot.pricedStoreCount}
            descending
          />
        ) : null}
      </div>

      {snapshot.staleStoreCount > 0 ? (
        <p className="mt-10 text-sm text-ink-subtle">
          {snapshot.staleStoreCount} more{" "}
          {snapshot.staleStoreCount === 1 ? "store has" : "stores have"} a price on
          file more than three months old. Those are on the map, marked as such,
          and kept out of every figure on this page.
        </p>
      ) : null}
    </section>
  );
}

function Leaderboard({
  heading,
  stores,
  startRank,
  descending = false,
}: {
  heading: string;
  stores: readonly StoreWithId[];
  startRank: number;
  descending?: boolean;
}) {
  return (
    // `min-w-0` is not decoration. A grid item defaults to `min-width: auto`,
    // so the track cannot size below its content's min-content width — and the
    // address inside sets that width. Without this the column measured 457px
    // inside a 335px viewport and pushed the whole page sideways. `min-w-0` on
    // the inner flex item does not help: that governs shrinking during layout,
    // not the intrinsic size that propagates up to the track.
    <div className="min-w-0">
      <Eyebrow>{heading}</Eyebrow>

      <ol className="mt-4 divide-y divide-rule border-t border-rule">
        {stores.map((store, index) => (
          <li key={store.id}>
            <Link
              href={`/store/${store.id}`}
              className="hover-accent flex min-h-16 items-center gap-4 py-3"
            >
              <span
                aria-hidden="true"
                className="tabular w-7 shrink-0 text-sm text-ink-subtle"
              >
                {String(descending ? startRank - index : startRank + index).padStart(2, "0")}
              </span>

              <span className="min-w-0 flex-1">
                {/* Clamped to two lines rather than ellipsed on one. A truncated
                    street address is close to useless on a phone, and two lines
                    fit every address in the dataset. */}
                <span className="line-clamp-2">{storeLabelText(store)}</span>
                <span className="block text-xs text-ink-subtle">
                  {provenanceSummary(store)} · {priceAge(store)}
                </span>
              </span>

              <span className="tabular shrink-0 text-lg">
                {formatCents(store.priceCents ?? 0)}
              </span>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}

/* ------------------------------------------------------------------------ */

const STEPS = [
  {
    title: "Somebody buys a McChicken",
    body: "and looks at the receipt. That is the whole collection method. Nothing is scraped, no corporate feed is read, and not one figure on this site is estimated.",
  },
  {
    title: "They log it against one restaurant",
    body: "Once per store per day, in whole cents, somewhere between a dollar and fifteen. Anything more than 40% away from what that store has been running is held for review instead of counted.",
  },
  {
    title: "That store's price updates",
    body: "Each store shows one price: the newest report that passed the check. A report that would move the price by more than 40% is held until a second person agrees with it, so no single number can swing a store on its own. Delivery prices are recorded and shown but never become the price — the platforms add a markup that has nothing to do with the restaurant.",
  },
] as const;

/**
 * Three steps, composed as a staircase rather than three identical cards.
 *
 * The indent grows and the measure shortens with each step, so the eye walks
 * down and to the right instead of scanning across a row of equal boxes.
 */
function HowItWorks() {
  const indents = ["md:ml-0", "md:ml-16", "md:ml-32"] as const;
  const measures = ["md:max-w-2xl", "md:max-w-xl", "md:max-w-lg"] as const;

  return (
    <section className="mt-24 border-t border-rule pt-10">
      <h2 className="font-display text-2xl sm:text-3xl">How a price gets here</h2>

      <ol className="mt-4">
        {STEPS.map((step, index) => (
          <li
            key={step.title}
            className={`grid gap-x-6 gap-y-1 border-b border-rule py-8 last:border-b-0 sm:grid-cols-[4.5rem_1fr] ${indents[index]} ${measures[index]}`}
          >
            {/* The ordinal is also spelled out in the list semantics, so this
                numeral is purely typographic and hidden from screen readers. */}
            <span
              aria-hidden="true"
              className="font-display text-4xl leading-none text-ink-subtle sm:text-5xl"
            >
              {String(index + 1).padStart(2, "0")}
            </span>

            <div>
              <h3 className="font-display text-xl">{step.title}</h3>
              <p className="mt-2 leading-relaxed text-ink-muted">{step.body}</p>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}

/* ------------------------------------------------------------------------ */

function Contribute({ snapshot }: { snapshot: IndexSnapshot }) {
  const blank = snapshot.trackedStoreCount - snapshot.pricedStoreCount;

  return (
    // The one inverted block on the page. Everything above it is ink on paper;
    // turning the palette over exactly once is what makes this read as the end
    // of the argument rather than as another section.
    <section className="on-ink mt-24 bg-ink text-paper">
      <div className="mx-auto grid w-full max-w-[68rem] gap-8 px-5 py-16 sm:px-8 sm:py-20 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <h2 className="max-w-xl font-display text-3xl leading-tight sm:text-4xl">
            The index is only ever as good as the last receipt.
          </h2>

          <p className="mt-5 max-w-lg leading-relaxed text-paper-muted">
            {blank > 0 ? (
              <>
                {blank} of the {snapshot.trackedStoreCount} restaurants on file have
                no current price at all. They are blank because nobody has been,
                not because there is nothing to report.
              </>
            ) : (
              <>
                Every restaurant on file has a current price. Keeping it that way
                takes about fifteen seconds per visit.
              </>
            )}
          </p>
        </div>

        <div className="flex flex-wrap content-end gap-3 lg:col-span-5 lg:justify-end">
          {/* Points at the logging run rather than the map. Somebody who has
              read this far has agreed to contribute, and the map asks them to
              pick a store first — a step that only makes sense when you are
              standing in one. The map is still linked twice above. */}
          <Link
            href="/log"
            className="press inline-flex min-h-12 items-center justify-center rounded-md bg-paper px-6 py-3 font-medium text-ink"
          >
            Log prices near you
          </Link>
          <Link
            href="/about"
            className="press inline-flex min-h-12 items-center justify-center rounded-md border border-paper-muted px-6 py-3 font-medium text-paper"
          >
            How the data works
          </Link>
        </div>
      </div>
    </section>
  );
}
