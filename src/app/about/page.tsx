import type { Metadata } from "next";

import { RailToc, type RailItem } from "@/components/ui/RailToc";
import { ScrollProgress } from "@/components/ui/ScrollProgress";
import { WordRise } from "@/components/ui/WordRise";
import { ACTIVE_FEEDS, HAS_ACTIVE_FEED } from "@/lib/feeds";
import { PRICE_MAX_CENTS, PRICE_MIN_CENTS, formatCents } from "@/lib/money";
import { BIG_MOVE_PERCENT, CORROBORATION_PERCENT } from "@/lib/pricing";
import { STALE_AFTER_DAYS } from "@/types";

export const metadata: Metadata = {
  title: "How the data works — Sandwich Index",
  description:
    "Where Sandwich Index prices come from, why McDonald's prices vary between franchises, and how submissions are checked.",
};

/** The page's sections, in order, for their anchors and the rail beside them. */
const SECTIONS = [
  { id: "why-prices-differ", title: "Why prices differ between stores" },
  { id: "where-the-data-comes-from", title: "Where the data comes from" },
  { id: "reading-a-photo", title: "Reading a price from a photo" },
  { id: "how-submissions-are-checked", title: "How submissions are checked" },
  ...(HAS_ACTIVE_FEED ? [{ id: "price-feeds", title: "Price feeds" }] : []),
  { id: "how-to-read-a-price", title: "How to read a price" },
  { id: "who-runs-this", title: "Who runs this" },
] satisfies RailItem[];

function Section({ id, children }: { id: string; children: React.ReactNode }) {
  const title = SECTIONS.find((section) => section.id === id)?.title ?? "";
  return (
    <section id={id} className="scroll-mt-[calc(var(--site-header-height)+1.5rem)] border-t border-rule pt-8">
      <h2 className="wr font-display text-2xl">
        <WordRise text={title} />
      </h2>
      <div className="mt-4 space-y-4 leading-relaxed text-ink-muted">{children}</div>
    </section>
  );
}

export default function AboutPage() {
  return (
    // On wide screens a two-column grid: the rail on the left spanning the
    // page's three rows (title, introduction, sections), the text on the right.
    <main
      id="main"
      className="mx-auto w-full max-w-2xl px-5 py-16 sm:px-8 sm:py-24 lg:grid lg:max-w-[68rem] lg:grid-cols-[12rem_minmax(0,42rem)] lg:content-start lg:justify-center lg:gap-x-16"
    >
      <ScrollProgress />

      <div className="hidden lg:row-span-3 lg:block">
        <div className="sticky top-[calc(var(--site-header-height)+2.5rem)]">
          <RailToc items={SECTIONS} />
        </div>
      </div>

      <h1 className="reveal font-display text-4xl leading-tight sm:text-5xl lg:col-start-2">
        How the data works
      </h1>

      <p className="reveal mt-6 text-lg leading-relaxed text-ink-muted lg:col-start-2" style={{ animationDelay: "90ms" }}>
        {HAS_ACTIVE_FEED ? (
          <>
            Every number on this site is either a price a visitor logged, from
            a receipt, a menu board or the app, or a dated price listed by an
            outside tracker, and every one says which. There is no official
            source, so read each figure alongside where it came from and how old
            it is.
          </>
        ) : (
          <>
            Every number on this site was typed in by a person who saw it on a
            receipt, a menu board or the app. There is no feed and no official
            source, so read each figure alongside how old it is.
          </>
        )}
      </p>

      <div className="mt-12 space-y-10 lg:col-start-2">
        <Section id="why-prices-differ">
          <p>
            Most McDonald&rsquo;s locations in the United States are owned by
            independent franchisees rather than the corporation. Those owners
            set their own menu prices, which is why a store in one suburb can
            charge a dollar more than a store fifteen minutes away for an
            identical sandwich. Rent, labour costs, and local competition all
            push the number around.
          </p>
          <p>
            Corporate publishes no per-store price list, and franchise pricing
            is not disclosed anywhere central. Short of the McDonald&rsquo;s
            app, the practical way to know what a store charges is for somebody
            who has been there to say so.
          </p>
        </Section>

        <Section id="where-the-data-comes-from">
          <p>
            Store locations in the US come from{" "}
            <a
              className="link-prose"
              href="https://www.alltheplaces.xyz"
              target="_blank"
              rel="noreferrer noopener"
            >
              All The Places
            </a>
            , a public-domain dataset of store locations, which lists nearly
            every McDonald&rsquo;s in the country with its address and
            restaurant number. The few it misses are placed where Drive Thru
            Index&rsquo;s page for the store puts them, and their pages say so.
            The first stores on the site, around Dallas, came from{" "}
            <a
              className="link-prose"
              href="https://www.openstreetmap.org/copyright"
              target="_blank"
              rel="noreferrer noopener"
            >
              OpenStreetMap
            </a>
            , a public map database maintained by volunteers, used under the
            Open Database Licence, and so do any outside the US. Where an
            address is missing upstream, the site shows nothing rather than
            inventing one.
          </p>
          <p>
            {HAS_ACTIVE_FEED
              ? "Prices come from two places: contributors, and the outside price feeds listed below. "
              : "Prices come from contributors. "}
            Each submission records the store, the price in cents, whether it
            was in store, drive-thru, mobile app, or delivery, and a server-side
            timestamp.
          </p>
        </Section>

        <Section id="reading-a-photo">
          <p>
            The form on each store&rsquo;s page can read the price from a photo
            of your receipt, or from a screenshot of the McChicken in the
            McDonald&rsquo;s app. Your browser does the reading; the photo is
            never uploaded, to this site or anyone else. Only the price you then
            log is sent, exactly as if you had typed it, so the card digits and
            order number on a receipt stay on your phone.
          </p>
          <p>
            It fills in the price for you to check, and nothing is logged until
            you press the button. It fills in nothing if the photo is from a
            different store, if the receipt is more than a week old (a price is
            recorded as today&rsquo;s), or if all it shows is a meal or a Spicy
            McChicken. Stores are matched by the restaurant number every receipt
            prints, using McDonald&rsquo;s locations as published by{" "}
            <a
              className="link-prose"
              href="https://www.alltheplaces.xyz/"
              target="_blank"
              rel="noreferrer noopener"
            >
              All The Places
            </a>{" "}
            under CC0.
          </p>
        </Section>

        <Section id="how-submissions-are-checked">
          <p>
            Crowdsourced data attracts bad entries, some careless and some
            deliberate. Four things push back:
          </p>
          <ul className="ml-5 list-disc space-y-2">
            <li>
              Anything outside {formatCents(PRICE_MIN_CENTS)} to{" "}
              {formatCents(PRICE_MAX_CENTS)} is rejected outright, at the
              database level rather than only in the form.
            </li>
            <li>
              One submission per device per store per day, also enforced at the
              database level.
            </li>
            <li>
              A report more than {BIG_MOVE_PERCENT}% away from what a store is
              currently listed at does not change the price on its own. It is
              held until a second report agrees with it, within{" "}
              {CORROBORATION_PERCENT}%.
            </li>
            <li>
              Each store shows one price: the most recent report that passed the
              check above. A newer price replaces the old one, and nothing is
              averaged.
            </li>
          </ul>
          <p>
            Replacing has a cost. An average absorbs a single wrong number
            better. Replacing catches a real price change sooner, and the figure
            on screen is one somebody actually saw on a menu board instead of a
            midpoint nobody was ever charged. The held-report rule limits the
            cost: no single report can move a price far, while two that agree
            can move it anywhere. That is also how a store recovers if its very
            first report was wrong.
          </p>
          <p>
            Delivery prices are recorded but can never become a store&rsquo;s
            price. Delivery platforms add their own markup, so those numbers
            describe a different transaction than walking in.
          </p>
        </Section>

        {HAS_ACTIVE_FEED ? (
          <Section id="price-feeds">
            <p>
              Some prices come from outside feeds rather than from visitors.
              Each is shown under the feed&rsquo;s name with a date, links back
              to the feed&rsquo;s own page for that store, and is never counted
              as a visitor&rsquo;s report. A visitor&rsquo;s price logged after
              a feed&rsquo;s replaces it, and a feed&rsquo;s price can also
              confirm a report that was being held for a second opinion.
            </p>
            <ul className="ml-5 list-disc space-y-2">
              {ACTIVE_FEEDS.map((feed) => (
                <li key={feed.id}>
                  <a
                    href={feed.homepage}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="link-prose"
                  >
                    {feed.name}
                  </a>
                  , {feed.method}.{" "}
                  {feed.licence !== null
                    ? `Used under: ${feed.licence}.`
                    : "Shown without a licence while we ask for one, and removed if the answer is no. Its prices are read from its public store pages, at the pace its robots.txt asks for."}
                  {feed.dateNote !== null ? ` ${feed.dateNote}` : null}
                </li>
              ))}
            </ul>
          </Section>
        ) : null}

        <Section id="how-to-read-a-price">
          <p>
            A visitor&rsquo;s price is shown with the number of reports behind
            it. A store with one report and a store with thirty should not be
            trusted equally, and showing the count is the honest way to say so.
            {HAS_ACTIVE_FEED
              ? " A feed's price is shown with the feed's name and the day it was dated instead, because it is one listing, not a count of people."
              : null}
          </p>
          <p>
            Prices older than {STALE_AFTER_DAYS} days are marked stale and
            excluded from cheapest-nearby rankings. A stale price may still be
            right, but menu prices move, so it is labelled as old.
          </p>
        </Section>

        <Section id="who-runs-this">
          <p>
            Sandwich Index is an independent project. It is not affiliated with,
            endorsed by, or sponsored by McDonald&rsquo;s Corporation.
            &ldquo;McDonald&rsquo;s&rdquo; and &ldquo;McChicken&rdquo; are
            trademarks of McDonald&rsquo;s Corporation and are used here purely
            to describe the product being tracked.
          </p>
          <p>
            Nothing on this site talks to a McDonald&rsquo;s server.
            {HAS_ACTIVE_FEED
              ? " A feed’s prices are that feed’s own record; how it gathers them is stated beside its name above."
              : " No data is collected from McDonald’s systems."}
          </p>
        </Section>
      </div>
    </main>
  );
}
