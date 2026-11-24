import Link from "next/link";

import { NEWEST_STORY_MONTH } from "@/data/monthly";
import { HAS_ACTIVE_FEED } from "@/lib/feeds";

/**
 * Both notices here are load-bearing, not boilerplate.
 *
 * The OpenStreetMap credit is a licence condition — the first stores came from
 * OSM under the ODbL, which requires attribution wherever the data is shown.
 * All The Places (CC0) asks for nothing, and is credited anyway.
 *
 * The disclaimer is there because this site discusses a company's prices using
 * that company's product name. Describing a McChicken accurately is fair use;
 * leaving a visitor unsure whether McDonald's runs the site is not.
 */
export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-rule bg-paper-sunken">
      <div className="mx-auto grid max-w-[68rem] gap-8 px-5 pt-10 pb-6 sm:grid-cols-2 sm:px-8">
        <div className="space-y-3">
          <p className="font-display text-lg">Sandwich Index</p>
          <p className="max-w-sm text-sm leading-relaxed text-ink-muted">
            {HAS_ACTIVE_FEED
              ? "A record of what one sandwich costs, store by store. Every price here was logged by a visitor or listed by a price tracker named beside it, with its date."
              : "A crowdsourced record of what one sandwich costs, store by store. Every price here was submitted by a person who saw it."}
          </p>
        </div>

        <div className="space-y-3 text-sm leading-relaxed text-ink-muted">
          <p>
            Store locations from{" "}
            <a
              className="link-prose"
              href="https://www.alltheplaces.xyz"
              target="_blank"
              rel="noreferrer noopener"
            >
              All The Places
            </a>{" "}
            and{" "}
            <a
              className="link-prose"
              href="https://www.openstreetmap.org/copyright"
              target="_blank"
              rel="noreferrer noopener"
            >
              OpenStreetMap
            </a>{" "}
            contributors, available under the{" "}
            <a
              className="link-prose"
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
          <p className="flex flex-wrap gap-x-6">
            <Link
              className="link-prose inline-flex min-h-11 items-center"
              href="/about"
            >
              How this data works
            </Link>
            {NEWEST_STORY_MONTH !== null ? (
              <Link
                className="link-prose inline-flex min-h-11 items-center"
                href={`/story/${NEWEST_STORY_MONTH}`}
              >
                The month in prices
              </Link>
            ) : null}
          </p>
        </div>
      </div>

      {/* The name set large and cut off by the foot of the page. Pure
          decoration (the same name is in the column above, at full contrast),
          so the letters are generated content: no text node, nothing to read
          out, select or copy. */}
      <div className="mx-auto max-w-[68rem] px-5 sm:px-8">
        <div className="footer-wordmark" aria-hidden="true">
          <span data-text="Sandwich Index" />
        </div>
      </div>
    </footer>
  );
}
