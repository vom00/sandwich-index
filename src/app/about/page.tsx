import type { Metadata } from "next";

import { PRICE_MAX_CENTS, PRICE_MIN_CENTS, formatCents } from "@/lib/money";
import { BIG_MOVE_PERCENT, CORROBORATION_PERCENT } from "@/lib/pricing";
import { STALE_AFTER_DAYS } from "@/types";

export const metadata: Metadata = {
  title: "How the data works — Sandwich Index",
  description:
    "Where Sandwich Index prices come from, why McDonald's prices vary between franchises, and how submissions are checked.",
};

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-t border-rule pt-8">
      <h2 className="font-display text-2xl">{title}</h2>
      <div className="mt-4 space-y-4 leading-relaxed text-ink-muted">{children}</div>
    </section>
  );
}

export default function AboutPage() {
  return (
    <main id="main" className="mx-auto w-full max-w-2xl px-5 py-16 sm:px-8 sm:py-24">
      <h1 className="font-display text-4xl leading-tight sm:text-5xl">
        How the data works
      </h1>

      <p className="mt-6 text-lg leading-relaxed text-ink-muted">
        Every number on this site was typed in by a person who bought the
        sandwich. There is no feed, no scrape, no official source. That shapes
        everything about how the data should be read.
      </p>

      <div className="mt-12 space-y-10">
        <Section title="Why prices differ between stores">
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
            is not disclosed anywhere central. The only practical way to know
            what a specific store charges is for someone standing in it to say
            so.
          </p>
        </Section>

        <Section title="Where the data comes from">
          <p>
            Store locations come from{" "}
            <a
              className="underline decoration-rule underline-offset-2 hover-accent"
              href="https://www.openstreetmap.org/copyright"
              target="_blank"
              rel="noreferrer noopener"
            >
              OpenStreetMap
            </a>
            , a public map database maintained by volunteers, used under the
            Open Database Licence. Some entries carry a full street address and
            some carry none at all — where an address is missing, it is missing
            upstream, and we would rather show nothing than invent one.
          </p>
          <p>
            Prices come from contributors. Each submission records the store,
            the price in cents, whether it was in store, drive-thru, mobile app,
            or delivery, and a server-side timestamp.
          </p>
        </Section>

        <Section title="How submissions are checked">
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
              Each store shows one price — the most recent report that passed
              the check above — rather than an average of everything anyone has
              ever said. Prices are replaced, not blended.
            </li>
          </ul>
          <p>
            That last choice is deliberate, and it has a cost worth stating.
            Averaging is better at absorbing a single wrong number; replacing is
            better at telling the truth after a real price change, and it means
            the figure on screen is one somebody actually saw on a menu board
            rather than a midpoint nobody was ever charged. The held-report rule
            above is what keeps the first problem in check: no single report can
            move a price far, and two that agree can move it anywhere — which is
            also how a store recovers if its very first report was wrong.
          </p>
          <p>
            Delivery prices are recorded but can never become a store&rsquo;s
            price. Delivery platforms add their own markup, so those numbers
            describe a different transaction than walking in.
          </p>
        </Section>

        <Section title="How to read a price">
          <p>
            Every price is shown with the number of submissions behind it. A
            store with one report and a store with thirty should not be trusted
            equally, and showing the count is the honest way to say so.
          </p>
          <p>
            Prices older than {STALE_AFTER_DAYS} days are marked stale and
            excluded from cheapest-nearby rankings. A stale price is not wrong,
            it is just old, and menu prices move.
          </p>
        </Section>

        <Section title="Who runs this">
          <p>
            Sandwich Index is an independent project. It is not affiliated with,
            endorsed by, or sponsored by McDonald&rsquo;s Corporation.
            &ldquo;McDonald&rsquo;s&rdquo; and &ldquo;McChicken&rdquo; are
            trademarks of McDonald&rsquo;s Corporation and are used here purely
            to describe the product being tracked.
          </p>
          <p>
            No data is collected from McDonald&rsquo;s systems. Nothing on this
            site talks to a McDonald&rsquo;s server.
          </p>
        </Section>
      </div>
    </main>
  );
}
