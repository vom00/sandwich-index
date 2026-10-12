import Link from "next/link";

import { HAS_LICENSED_FEED } from "@/lib/feeds";

/**
 * Both notices here are load-bearing, not boilerplate.
 *
 * The OpenStreetMap credit is a licence condition — store locations come from
 * OSM under the ODbL, which requires attribution wherever the data is shown.
 *
 * The disclaimer is there because this site discusses a company's prices using
 * that company's product name. Describing a McChicken accurately is fair use;
 * leaving a visitor unsure whether McDonald's runs the site is not.
 */
export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-rule bg-paper-sunken">
      <div className="mx-auto grid max-w-6xl gap-8 px-5 py-10 sm:grid-cols-2 sm:px-8">
        <div className="space-y-3">
          <p className="font-display text-lg">Sandwich Index</p>
          <p className="max-w-sm text-sm leading-relaxed text-ink-muted">
            {HAS_LICENSED_FEED
              ? "A record of what one sandwich costs, store by store. Every price here is a receipt from a person who paid it or a dated record from a price feed named beside it."
              : "A crowdsourced record of what one sandwich costs, store by store. Every price here was submitted by a person who paid it."}
          </p>
        </div>

        <div className="space-y-3 text-sm leading-relaxed text-ink-muted">
          <p>
            Store locations from{" "}
            <a
              className="underline decoration-rule underline-offset-2 hover-accent"
              href="https://www.openstreetmap.org/copyright"
              target="_blank"
              rel="noreferrer noopener"
            >
              OpenStreetMap
            </a>{" "}
            contributors, available under the{" "}
            <a
              className="underline decoration-rule underline-offset-2 hover-accent"
              href="https://opendatacommons.org/licenses/odbl/"
              target="_blank"
              rel="noreferrer noopener"
            >
              Open Database Licence
            </a>
            .
          </p>

          <p>
            Sandwich Index is not affiliated with, endorsed by, or sponsored by
            McDonald&rsquo;s Corporation. &ldquo;McDonald&rsquo;s&rdquo; and
            &ldquo;McChicken&rdquo; are trademarks of McDonald&rsquo;s
            Corporation, used here only to describe the product being tracked.
          </p>

          {/* A standalone link, unlike the two above it, so it gets a real
              target rather than the height of one line of text. The inline
              links inside the sentences are exempt under WCAG 2.5.8 — their
              size is constrained by the prose around them. */}
          <p>
            <Link
              className="hover-accent inline-flex min-h-11 items-center underline decoration-rule underline-offset-2"
              href="/about"
            >
              How this data works
            </Link>
          </p>
        </div>
      </div>
    </footer>
  );
}
