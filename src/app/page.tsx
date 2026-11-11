import type { Metadata } from "next";
import Link from "next/link";

import { CountUpPrice } from "@/components/landing/CountUpPrice";
import { RulerStory, type StoryFacts } from "@/components/landing/story/RulerStory";
import { StaticDotMap } from "@/components/landing/story/StaticDotMap";
import { ACTIVE_FEEDS, HAS_ACTIVE_FEED } from "@/lib/feeds";
import { getCachedIndexSnapshot } from "@/lib/index-snapshot.server";
import { loadPriceMap, priceTier } from "@/lib/landing-map";
import { formatCents, formatCount } from "@/lib/money";
import { priceAge, provenanceSummary } from "@/lib/provenance";
import { storeLabelText } from "@/lib/store-label";
import type { IndexSnapshot } from "@/lib/stores.server";
import type { StoreWithId } from "@/types";

import "./landing.css";

/**
 * The landing page: one object on a price ruler.
 *
 * Mostly type and hairlines. The one 3D thing is the sandwich, in a small
 * canvas pinned behind the story (`RulerStory`). Every figure here is
 * server-rendered text first; the canvas, the ruler and the dot map only
 * restate what the copy already says.
 */

export const dynamic = "force-dynamic";

const LEADER_LIMIT = 3;
const DTI_CREDIT = "Source: Drive Thru Index (https://drivethruindex.com)";

export async function generateMetadata(): Promise<Metadata> {
  const snapshot = await getCachedIndexSnapshot(LEADER_LIMIT);

  return {
    title: "Sandwich Index — what a McChicken actually costs",
    description:
      snapshot.spreadCents === null
        ? `Tracking McChicken prices across ${formatCount(snapshot.trackedStoreCount)} McDonald's locations. ${HAS_ACTIVE_FEED ? "Every price either logged by a visitor or listed by a named price tracker." : "Every price submitted by somebody who saw it."}`
        : `${formatCents(snapshot.spreadCents)} separates the cheapest McChicken in the index from the priciest, across ${formatCount(snapshot.pricedStoreCount)} stores with current prices.`,
  };
}

const SHORT_DATE = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });

export default async function Home() {
  const [snapshot, map] = await Promise.all([getCachedIndexSnapshot(LEADER_LIMIT), loadPriceMap()]);
  const scale = map.priceCents;

  const tiers = { low: 0, mid: 0, high: 0, none: 0 };
  for (const point of map.points) tiers[priceTier(point[2], scale)] += 1;

  const cheapest = snapshot.cheapest[0];
  const priciest = snapshot.priciest[0];

  const facts: StoryFacts = {
    lowCents: snapshot.lowestPriceCents,
    highCents: snapshot.highestPriceCents,
    spreadCents: snapshot.spreadCents,
    lowLabel: cheapest ? storeLabelText(cheapest) : null,
    highLabel: priciest ? storeLabelText(priciest) : null,
    scale,
    mapStores: map.generatedFrom.stores,
    mapPriced: map.generatedFrom.priced,
    tierCounts: tiers,
    dotCount: map.points.length,
  };

  const checkedFrom = SHORT_DATE.format(new Date(map.generatedFrom.oldestObservedAt));
  const checkedTo = SHORT_DATE.format(new Date(map.generatedFrom.newestObservedAt));

  return (
    <main id="main" className="lc-root">
      <RulerStory facts={facts}>
        <Hero snapshot={snapshot} />

        <section data-ch="explode" className="lc-ch lc-ch--explode" aria-labelledby="lc-parts">
          <div className="lc-copy">
            <p className="lc-eyebrow">01 · The sandwich</p>
            <h2 id="lc-parts" className="mt-3 font-display text-[1.75rem] leading-[1.1] sm:text-4xl">
              The same four parts at every counter
            </h2>
            <p className="mt-4 leading-relaxed text-ink-muted">
              Bun, a breaded chicken patty, shredded lettuce, bun. The parts list
              does not change from one restaurant to the next. The price does.
            </p>
            <ol className="lc-parts mt-5 max-lg:sr-only">
              <li><span>01</span>Top bun</li>
              <li><span>02</span>Shredded lettuce</li>
              <li><span>03</span>Breaded chicken patty</li>
              <li><span>04</span>Bottom bun</li>
            </ol>
          </div>
        </section>

        <section data-ch="ruler" className="lc-ch lc-ch--ruler" aria-labelledby="lc-ruler">
          <div className="lc-copy">
            <p className="lc-eyebrow">02 · The price</p>
            <h2 id="lc-ruler" className="mt-3 font-display text-[1.75rem] leading-[1.1] sm:text-4xl">
              Then each counter puts its own number on it
            </h2>
            {snapshot.lowestPriceCents !== null && snapshot.highestPriceCents !== null ? (
              <p className="mt-4 leading-relaxed text-ink-muted">
                Lay every current price in the index along one tape. It starts at{" "}
                <span className="tabular text-ink">{formatCents(snapshot.lowestPriceCents)}</span>
                {facts.lowLabel ? <span className="max-lg:sr-only"> ({facts.lowLabel})</span> : null} and runs to{" "}
                <span className="tabular text-ink">{formatCents(snapshot.highestPriceCents)}</span>
                {facts.highLabel ? <span className="max-lg:sr-only"> ({facts.highLabel})</span> : null}.
              </p>
            ) : (
              <p className="mt-4 leading-relaxed text-ink-muted">No store in the index has a current price yet.</p>
            )}
            <dl className="lc-marks mt-5 max-lg:sr-only">
              <div><dt>Cheapest tenth, nationally</dt><dd>{formatCents(scale.p10)} or less</dd></div>
              <div><dt>National median</dt><dd>{formatCents(scale.median)}</dd></div>
              <div><dt>Dearest tenth, nationally</dt><dd>{formatCents(scale.p90)} or more</dd></div>
            </dl>
            <p className="mt-3 text-xs leading-relaxed text-ink-subtle">
              National figures: {formatCount(map.generatedFrom.priced)} priced stores. {DTI_CREDIT}.
            </p>
            <StaticInterval facts={facts} />
          </div>
        </section>

        <section data-ch="map" className="lc-ch lc-ch--map" aria-labelledby="lc-map">
          <div className="lc-copy">
            <p className="lc-eyebrow">03 · The map</p>
            <h2 id="lc-map" className="mt-3 font-display text-[1.75rem] leading-[1.1] sm:text-4xl">
              Now multiply by {formatCount(map.generatedFrom.stores)}
            </h2>
            <p className="mt-4 leading-relaxed text-ink-muted">
              {formatCount(map.generatedFrom.stores)} restaurants in {formatCount(map.points.length)} dots.
              Each dot is a small patch of the country, coloured by the median
              price of the restaurants in it.
            </p>
            <ul className="lc-key mt-5">
              <li data-tier="low"><i aria-hidden="true" />Cheapest tenth, {formatCents(scale.p10)} or less <span>{formatCount(tiers.low)} dots</span></li>
              <li data-tier="mid"><i aria-hidden="true" />In between <span>{formatCount(tiers.mid)} dots</span></li>
              <li data-tier="high"><i aria-hidden="true" />Dearest tenth, {formatCents(scale.p90)} or more <span>{formatCount(tiers.high)} dots</span></li>
              <li data-tier="none"><i aria-hidden="true" />No price yet <span>{formatCount(tiers.none)} dots</span></li>
            </ul>
            <p className="mt-3 text-xs leading-relaxed text-ink-subtle">
              Prices checked {checkedFrom} to {checkedTo}. {DTI_CREDIT}.
            </p>
            <StaticDotMap />
          </div>
        </section>
      </RulerStory>

      <div className="mx-auto w-full max-w-[68rem] px-5 sm:px-8">
        <Ends snapshot={snapshot} />
        <HowItWorks />
      </div>
      <Contribute snapshot={snapshot} />
    </main>
  );
}

/* ------------------------------------------------------------------------ */

function Hero({ snapshot }: { snapshot: IndexSnapshot }) {
  const { spreadCents, lowestPriceCents, highestPriceCents } = snapshot;

  return (
    <header data-ch="hero" className="lc-hero">
      <div className="lc-hero-copy">
        <p className="lc-eyebrow reveal">
          McChicken prices · {formatCount(snapshot.trackedStoreCount)} restaurants tracked
        </p>
        {spreadCents === null ? (
          <h1 className="mt-6 font-display text-5xl leading-[1.02] sm:text-7xl">Nothing to measure yet.</h1>
        ) : (
          <h1 className="mt-5 grid gap-y-3">
            <span className="reveal block" style={{ animationDelay: "70ms" }}>
              <CountUpPrice cents={spreadCents} className="hero-figure" />
            </span>
            <span
              className="reveal block max-w-md font-display text-[1.375rem] leading-[1.2] sm:text-[1.75rem]"
              style={{ animationDelay: "170ms" }}
            >
              separates the cheapest McChicken in the index from the priciest.
            </span>
          </h1>
        )}
        <p className="reveal mt-5 max-w-md leading-relaxed text-ink-muted" style={{ animationDelay: "250ms" }}>
          Each franchisee prices the same sandwich differently, and nothing
          official publishes those prices. This site collects them, store by store.
        </p>
        <div className="reveal mt-6 flex flex-wrap items-center gap-x-6 gap-y-3" style={{ animationDelay: "330ms" }}>
          <Link
            href="/map"
            className="press inline-flex min-h-12 shrink-0 items-center justify-center rounded-md bg-accent px-6 py-3 font-medium text-accent-ink"
          >
            Find prices near you
          </Link>
          {lowestPriceCents !== null && highestPriceCents !== null ? (
            <p className="lc-hero-range">
              <span>Cheapest <b className="tabular">{formatCents(lowestPriceCents)}</b></span>
              <span>Priciest <b className="tabular">{formatCents(highestPriceCents)}</b></span>
              <span>{formatCount(snapshot.pricedStoreCount)} priced</span>
            </p>
          ) : null}
        </div>
        {HAS_ACTIVE_FEED ? (
          <p className="mt-4 max-w-md text-xs leading-relaxed text-ink-subtle">
            Source: visitors&rsquo; reports and{" "}
            {ACTIVE_FEEDS.map((feed) => `${feed.name} (${feed.homepage})`).join(", ")}.
          </p>
        ) : null}
      </div>
      {/* Reserved room for the sandwich. The pinned canvas measures this box
          and starts the story inside it. */}
      <div data-slot="hero" className="lc-hero-slot" aria-hidden="true" />
    </header>
  );
}

/**
 * The ruler, flattened: shown only with reduced motion (and without
 * JavaScript's pinned stage), so the measurements still have a drawing.
 */
function StaticInterval({ facts }: { facts: StoryFacts }) {
  const { lowCents, highCents, scale } = facts;
  if (lowCents === null || highCents === null || highCents <= lowCents) return null;
  const at = (cents: number) => `${((cents - lowCents) / (highCents - lowCents)) * 100}%`;
  const marks = [
    { cents: scale.p10, label: "p10" },
    { cents: scale.median, label: "median" },
    { cents: scale.p90, label: "p90" },
  ].filter((mark) => mark.cents >= lowCents && mark.cents <= highCents);

  return (
    <figure className="lc-static lc-interval mt-8" aria-hidden="true">
      <div className="lc-interval-bar">
        {marks.map((mark) => (
          <span key={mark.label} className="lc-interval-mark" style={{ left: at(mark.cents) }}>
            <em>{mark.label}</em>
            {formatCents(mark.cents)}
          </span>
        ))}
      </div>
      <div className="lc-interval-ends">
        <span>{formatCents(lowCents)}</span>
        <span>{formatCents(highCents)}</span>
      </div>
    </figure>
  );
}

/* ------------------------------------------------------------------------ */

function FeedSources() {
  if (!HAS_ACTIVE_FEED) return null;
  return (
    <p className="mt-8 text-sm text-ink-subtle">
      Source: visitors&rsquo; reports and{" "}
      {ACTIVE_FEEDS.map((feed, index) => (
        <span key={feed.id}>
          {index > 0 ? ", " : null}
          {feed.name} (
          <a
            href={feed.homepage}
            target="_blank"
            rel="noreferrer noopener"
            className="hover-accent inline-flex min-h-11 items-center underline decoration-rule underline-offset-2"
          >
            {feed.homepage}
          </a>
          )
        </span>
      ))}
      . Each store&rsquo;s page gives the day its price was checked.
    </p>
  );
}

function Ends({ snapshot }: { snapshot: IndexSnapshot }) {
  if (snapshot.pricedStoreCount === 0) return null;
  const split = snapshot.pricedStoreCount >= LEADER_LIMIT * 2;

  return (
    <section className="lc-ends" aria-labelledby="lc-ends">
      <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-3">
        <h2 id="lc-ends" className="font-display text-[1.75rem] leading-[1.1] sm:text-4xl">
          {split ? "The two ends of the tape" : "What is on file"}
        </h2>
        <Link
          href="/map"
          className="hover-accent inline-flex min-h-11 items-center text-sm underline decoration-rule underline-offset-4"
        >
          See all {formatCount(snapshot.trackedStoreCount)} on the map
        </Link>
      </div>

      <div className="mt-10 grid gap-x-14 gap-y-14 md:grid-cols-2">
        <Leaderboard heading="Cheapest right now" tier="low" stores={snapshot.cheapest} startRank={1} />
        {split ? (
          <Leaderboard
            heading="Priciest right now"
            tier="high"
            stores={snapshot.priciest}
            startRank={snapshot.pricedStoreCount}
            descending
          />
        ) : null}
      </div>

      <FeedSources />

      {snapshot.staleStoreCount > 0 ? (
        <p className="mt-6 max-w-2xl text-sm text-ink-subtle">
          {formatCount(snapshot.staleStoreCount)} more{" "}
          {snapshot.staleStoreCount === 1 ? "store has" : "stores have"} a price on file more than
          three months old. Those are on the map, marked as such, and kept out of every figure on
          this page.
        </p>
      ) : null}
    </section>
  );
}

function Leaderboard({
  heading,
  tier,
  stores,
  startRank,
  descending = false,
}: {
  heading: string;
  tier: "low" | "high";
  stores: readonly StoreWithId[];
  startRank: number;
  descending?: boolean;
}) {
  const first = stores[0];
  return (
    <div className="min-w-0">
      <p className="lc-eyebrow">{heading}</p>
      {first ? (
        <p className={`lc-end-figure lc-rise ${tier === "low" ? "text-tier-low" : "text-tier-high"}`}>
          {formatCents(first.priceCents ?? 0)}
        </p>
      ) : null}
      <ol className="mt-4 border-t border-rule">
        {stores.map((store, index) => (
          <li key={store.id} className="lc-row lc-rise">
            <Link href={`/store/${store.id}`} className="hover-accent flex min-h-16 items-center gap-4 py-3">
              <span aria-hidden="true" className="tabular w-8 shrink-0 text-sm text-ink-subtle">
                {String(descending ? startRank - index : startRank + index).padStart(2, "0")}
              </span>
              <span className="min-w-0 flex-1">
                <span className="line-clamp-2">{storeLabelText(store)}</span>
                <span className="block text-xs text-ink-subtle">
                  {provenanceSummary(store)} · {priceAge(store)}
                </span>
              </span>
              <span className="tabular shrink-0 text-lg">{formatCents(store.priceCents ?? 0)}</span>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}

/* ------------------------------------------------------------------------ */

const FIRST_STEP = HAS_ACTIVE_FEED
  ? {
      title: "Somebody sees a McChicken price",
      body: "on a receipt, a menu board or in the app. Stores nobody has logged yet can show a price from an outside tracker instead, always under the tracker's name and with the day it was checked. Not one figure on this site is estimated.",
    }
  : {
      title: "Somebody sees a McChicken price",
      body: "on a receipt, a menu board or in the app. That is the whole collection method. Nothing is scraped, no corporate feed is read, and not one figure on this site is estimated.",
    };

const STEPS = [
  FIRST_STEP,
  {
    title: "They log it against one restaurant",
    body: "Once per store per day, in whole cents, somewhere between a dollar and fifteen. Anything more than 40% away from what that store has been running is held for review instead of counted.",
  },
  {
    title: "That store's price updates",
    body: "Each store shows one price: the newest that passed the check, whether a visitor's or a tracker's. A report that would move the price by more than 40% is held until a second person agrees with it. Delivery prices are recorded and shown but never become the price, because the platforms add their own markup.",
  },
] as const;

function HowItWorks() {
  return (
    <section className="lc-how" aria-labelledby="lc-how">
      <h2 id="lc-how" className="font-display text-[1.75rem] leading-[1.1] sm:text-4xl lg:col-span-4">
        How a price gets here
      </h2>
      <ol className="lg:col-span-7 lg:col-start-6">
        {STEPS.map((step, index) => (
          <li key={step.title} className="lc-step lc-rise">
            <span aria-hidden="true" className="lc-step-n">
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

function Contribute({ snapshot }: { snapshot: IndexSnapshot }) {
  const blank = snapshot.trackedStoreCount - snapshot.pricedStoreCount;
  return (
    <section className="on-ink mt-28 bg-ink text-paper" aria-labelledby="lc-add">
      <div className="mx-auto grid w-full max-w-[68rem] gap-8 px-5 py-16 sm:px-8 sm:py-24 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <p className="lc-eyebrow lc-eyebrow--ink">Your turn</p>
          <h2 id="lc-add" className="mt-3 max-w-xl font-display text-3xl leading-tight sm:text-5xl">
            Seen a McChicken price lately? Add it.
          </h2>
          <p className="mt-5 max-w-lg leading-relaxed text-paper-muted">
            {blank > 0 ? (
              <>
                <span className="tabular text-paper">{formatCount(blank)}</span> of the{" "}
                {formatCount(snapshot.trackedStoreCount)} restaurants on file have no current price at
                all. Each one is blank because nobody has logged a price there yet.
              </>
            ) : (
              <>Every restaurant on file has a current price. Keeping it that way takes about fifteen seconds per visit.</>
            )}
          </p>
        </div>
        <div className="flex flex-wrap content-end gap-3 lg:col-span-5 lg:justify-end">
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
