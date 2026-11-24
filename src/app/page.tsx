import type { Metadata } from "next";
import Link from "next/link";
import type { CSSProperties } from "react";

import { CountUpPrice } from "@/components/landing/CountUpPrice";
import { StaticDotMap } from "@/components/landing/world/StaticDotMap";
import { WorldStory } from "@/components/landing/world/WorldStory";
import { Odometer } from "@/components/ui/Odometer";
import { ScrollProgress } from "@/components/ui/ScrollProgress";
import { WordRise } from "@/components/ui/WordRise";
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
 * The landing page: one world, one camera.
 *
 * A clay world is pinned behind the opening chapters and the camera pulls back
 * through it as the page scrolls: the sandwich, the counter and its price
 * board, the restaurant, a street of restaurants, the whole country. Then the
 * page becomes a document again: the cheapest and priciest stores, how a price
 * gets here, and the band asking for prices.
 *
 * Everything on it is live. Every figure is server-rendered text first; the
 * scene restates what the copy already says, and nothing in it is invented.
 * The board and the street's tags show the same six real prices that the
 * first chapter lists, store by store.
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

/** The stores the board and the street show: the cheapest and the priciest, low to high, each once. */
function boardStores(snapshot: IndexSnapshot): StoreWithId[] {
  const seen = new Set<string>();
  const stores: StoreWithId[] = [];
  for (const store of [...snapshot.cheapest, ...[...snapshot.priciest].reverse()]) {
    if (store.priceCents === null || seen.has(store.id)) continue;
    seen.add(store.id);
    stores.push(store);
  }
  return stores.sort((a, b) => (a.priceCents ?? 0) - (b.priceCents ?? 0));
}

export default async function Home() {
  const [snapshot, map] = await Promise.all([getCachedIndexSnapshot(LEADER_LIMIT), loadPriceMap()]);
  const scale = map.priceCents;

  const tiers = { low: 0, mid: 0, high: 0, none: 0 };
  for (const point of map.points) tiers[priceTier(point[2], scale)] += 1;

  const board = boardStores(snapshot);
  const prices = board.map((store) => store.priceCents ?? 0);
  const lowest = prices[0] ?? 0;
  const highest = prices[prices.length - 1] ?? 0;
  const checkedFrom = SHORT_DATE.format(new Date(map.generatedFrom.oldestObservedAt));
  const checkedTo = SHORT_DATE.format(new Date(map.generatedFrom.newestObservedAt));

  return (
    <main id="main" className="lp-root">
      <ScrollProgress />
      <WorldStory prices={prices}>
        <Hero snapshot={snapshot} />

        <section data-beat="1" className="lp-ch" aria-labelledby="lp-counter">
          <div className="lp-copy">
            <p className="lp-eyebrow">01 · The counter</p>
            <h2 id="lp-counter" className="wr mt-3 font-display text-[1.75rem] leading-[1.1] sm:text-4xl">
              <WordRise text="Same sandwich, different number on the board" />
            </h2>
            {board.length > 0 ? (
              <>
                <p className="mt-4 leading-relaxed text-ink-muted">
                  The price on the board is whatever that restaurant decided. Run the
                  board through the index and it climbs from{" "}
                  <span className="tabular text-ink">{formatCents(lowest)}</span> to{" "}
                  <span className="tabular text-ink">{formatCents(highest)}</span>.
                </p>
                <ol className="lp-board lp-detail mt-5">
                  {board.map((store) => (
                    <li key={store.id}>
                      <span className="tabular">{formatCents(store.priceCents ?? 0)}</span>
                      <span className="min-w-0 truncate">{storeLabelText(store)}</span>
                    </li>
                  ))}
                </ol>
              </>
            ) : (
              <p className="mt-4 leading-relaxed text-ink-muted">No store in the index has a current price yet.</p>
            )}
          </div>
        </section>

        <section data-beat="2" className="lp-ch" aria-labelledby="lp-outside">
          <div className="lp-copy">
            <p className="lp-eyebrow">02 · The restaurant</p>
            <h2 id="lp-outside" className="wr mt-3 font-display text-[1.75rem] leading-[1.1] sm:text-4xl">
              <WordRise text="Every counter is its own decision" />
            </h2>
            <p className="mt-4 leading-relaxed text-ink-muted">
              Most McDonald&rsquo;s restaurants in the US are run by franchisees, and each
              one sets the price at its own counter. Nothing official publishes those
              prices. Step outside, and this restaurant is one of many.
            </p>
          </div>
        </section>

        <section data-beat="3" className="lp-ch" aria-labelledby="lp-street">
          <div className="lp-copy">
            <p className="lp-eyebrow">03 · The street</p>
            <h2 id="lp-street" className="wr mt-3 font-display text-[1.75rem] leading-[1.1] sm:text-4xl">
              <WordRise text="Next door, a different tag" />
            </h2>
            <p className="mt-4 leading-relaxed text-ink-muted">
              The tags on this street carry the same{" "}
              {board.length > 0 ? formatCount(board.length) : null} prices as the board:
              the cheapest and the priciest stores in the index, put side by side.
            </p>
          </div>
        </section>

        <section data-beat="4" className="lp-ch lp-ch--map" aria-labelledby="lp-map">
          <div className="lp-copy">
            <p className="lp-eyebrow">04 · The country</p>
            <h2 id="lp-map" className="wr mt-3 font-display text-[1.75rem] leading-[1.1] sm:text-4xl">
              <WordRise text={`Now multiply by ${formatCount(snapshot.trackedStoreCount)}`} />
            </h2>
            {/* Store counts come from the live snapshot, the same figures as the
                hero and the lists below. The map file is built from the price
                feed when the site deploys, so its own counts drift from the
                database between deploys; only its patches and median are used. */}
            <p className="mt-4 leading-relaxed text-ink-muted">
              {formatCount(snapshot.trackedStoreCount)} restaurants in {formatCount(map.points.length)} patches
              of the country. Each patch is coloured by the median price of the
              restaurants in it, and the dearer the price, the taller it stands.
            </p>
            <ul className="lp-key mt-5">
              <li data-tier="low"><i aria-hidden="true" />Cheapest tenth, {formatCents(scale.p10)} or less <span>{formatCount(tiers.low)}</span></li>
              <li data-tier="mid"><i aria-hidden="true" />In between <span>{formatCount(tiers.mid)}</span></li>
              <li data-tier="high"><i aria-hidden="true" />Dearest tenth, {formatCents(scale.p90)} or more <span>{formatCount(tiers.high)}</span></li>
              <li data-tier="none"><i aria-hidden="true" />No price yet <span>{formatCount(tiers.none)}</span></li>
            </ul>
            <p className="mt-3 text-xs leading-relaxed text-ink-subtle">
              National median {formatCents(scale.median)}, from prices checked {checkedFrom} to{" "}
              {checkedTo}. {formatCount(snapshot.pricedStoreCount)} restaurants have a current price.{" "}
              {DTI_CREDIT}.
            </p>
            <StaticDotMap />
          </div>
        </section>
      </WorldStory>

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
    <header data-beat="0" className="lp-hero">
      <div className="lp-hero-copy">
        <p className="lp-eyebrow reveal">
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
            className="btn-primary press inline-flex min-h-12 shrink-0 items-center justify-center rounded-md bg-accent px-6 py-3 font-medium text-accent-ink"
          >
            Find prices near you
            <span className="btn-arrow ml-2" aria-hidden="true">→</span>
          </Link>
          {lowestPriceCents !== null && highestPriceCents !== null ? (
            <p className="lp-hero-range">
              <span className="chip">
                <i className="chip-dot" aria-hidden="true" style={{ "--dot": "var(--color-tier-low)" } as CSSProperties} />
                Cheapest <b className="tabular">{formatCents(lowestPriceCents)}</b>
              </span>
              <span className="chip">
                <i className="chip-dot" aria-hidden="true" style={{ "--dot": "var(--color-tier-high)" } as CSSProperties} />
                Priciest <b className="tabular">{formatCents(highestPriceCents)}</b>
              </span>
              <span className="chip">
                {/* Not a <b>: the two prices in <b> are the ones the counter chapter lists. */}
                <span className="tabular font-medium text-ink">{formatCount(snapshot.pricedStoreCount)}</span> priced
              </span>
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
      {/* Room for the sandwich on a phone: the camera frames it inside this box. */}
      <div data-hero-room className="lp-hero-room" aria-hidden="true" />
    </header>
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
            className="link-prose inline-flex min-h-11 items-center"
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
  // One width for both lists, so their names line up side by side.
  const rankDigits = Math.max(2, String(snapshot.pricedStoreCount).length);

  return (
    <section className="lp-ends" aria-labelledby="lp-ends">
      <div className="flex flex-wrap items-baseline justify-between gap-x-8 gap-y-3">
        <h2 id="lp-ends" className="wr font-display text-[1.75rem] leading-[1.1] sm:text-4xl">
          <WordRise text={split ? "The two ends of the range" : "What is on file"} />
        </h2>
        <Link href="/map" className="link-prose inline-flex min-h-11 items-center text-sm">
          See all {formatCount(snapshot.trackedStoreCount)} on the map
        </Link>
      </div>

      <div className="mt-10 grid gap-x-14 gap-y-14 md:grid-cols-2">
        <Leaderboard heading="Cheapest right now" tier="low" stores={snapshot.cheapest} startRank={1} rankDigits={rankDigits} />
        {split ? (
          <Leaderboard
            heading="Priciest right now"
            tier="high"
            stores={snapshot.priciest}
            startRank={snapshot.pricedStoreCount}
            rankDigits={rankDigits}
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
  rankDigits,
  descending = false,
}: {
  heading: string;
  tier: "low" | "high";
  stores: readonly StoreWithId[];
  startRank: number;
  rankDigits: number;
  descending?: boolean;
}) {
  const first = stores[0];
  return (
    <div className="min-w-0">
      <p className="lp-eyebrow">{heading}</p>
      {first ? (
        <p className={`lp-end-figure lp-rise ${tier === "low" ? "text-tier-low" : "text-tier-high"}`}>
          <Odometer value={formatCents(first.priceCents ?? 0)} />
        </p>
      ) : null}
      <ol className="mt-4 border-t border-rule">
        {stores.map((store, index) => (
          <li key={store.id} className="lp-row lp-rise">
            {/* The row nudges right and an arrow appears on hover (`.row-go`). */}
            <Link href={`/store/${store.id}`} className="row-go hover-accent flex min-h-16 items-center gap-3 py-3">
              <span className="row-body flex min-w-0 flex-1 items-center gap-4">
                {/* Wide enough for the longest rank on the page: a priciest
                    rank runs to five digits, which a fixed 2rem column
                    pushed into the store name. `ch` is one digit's width. */}
                <span
                  aria-hidden="true"
                  className="tabular shrink-0 text-sm text-ink-subtle"
                  style={{ width: `${rankDigits}ch` }}
                >
                  {String(descending ? startRank - index : startRank + index).padStart(2, "0")}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="line-clamp-2">{storeLabelText(store)}</span>
                  <span className="block text-xs text-ink-subtle">
                    {provenanceSummary(store)} · {priceAge(store)}
                  </span>
                </span>
                <span className="tabular shrink-0 text-lg">{formatCents(store.priceCents ?? 0)}</span>
              </span>
              <span className="row-arrow shrink-0 text-ink-subtle" aria-hidden="true">→</span>
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
    <section className="lp-how" aria-labelledby="lp-how">
      <h2 id="lp-how" className="wr font-display text-[1.75rem] leading-[1.1] sm:text-4xl lg:col-span-4">
        <WordRise text="How a price gets here" />
      </h2>
      <ol className="lg:col-span-7 lg:col-start-6">
        {STEPS.map((step, index) => (
          <li key={step.title} className="lp-step lp-rise">
            <span aria-hidden="true" className="lp-step-n">
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
    <section className="on-ink paper-grain mt-28 bg-ink text-paper" aria-labelledby="lp-add">
      <div className="mx-auto grid w-full max-w-[68rem] gap-8 px-5 py-16 sm:px-8 sm:py-24 lg:grid-cols-12">
        <div className="lg:col-span-7">
          <p className="lp-eyebrow lp-eyebrow--ink">Your turn</p>
          <h2 id="lp-add" className="wr mt-3 max-w-xl font-display text-3xl leading-tight sm:text-5xl">
            <WordRise text="Seen a McChicken price lately? Add it." />
          </h2>
          <p className="mt-5 max-w-lg leading-relaxed text-paper-muted">
            {blank > 0 ? (
              <>
                <Odometer value={formatCount(blank)} className="tabular text-paper" /> of the{" "}
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
            className="btn-paper press inline-flex min-h-12 items-center justify-center rounded-md bg-paper px-6 py-3 font-medium text-ink"
          >
            Log prices near you
            <span className="btn-arrow ml-2" aria-hidden="true">→</span>
          </Link>
          <Link
            href="/about"
            className="btn-quiet-ink press inline-flex min-h-12 items-center justify-center rounded-md border border-paper-muted px-6 py-3 font-medium text-paper"
          >
            How the data works
          </Link>
        </div>
      </div>
    </section>
  );
}
