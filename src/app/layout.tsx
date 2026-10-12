import type { Metadata } from "next";
import { Fraunces, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";

import { ConnectionNotice } from "@/components/ui/ConnectionNotice";
import { FirebaseBoot } from "@/components/ui/FirebaseBoot";
import { SiteFooter } from "@/components/ui/SiteFooter";
import { HAS_ACTIVE_FEED } from "@/lib/feeds";
import "./globals.css";

/**
 * Three faces, each with a job.
 *
 * Fraunces carries the editorial voice — it has enough character to hold a
 * headline without an illustration propping it up. Plex Sans is the reading
 * face. Plex Mono exists for one reason: prices are compared down a column,
 * and tabular figures keep the decimal points from wandering.
 *
 * next/font self-hosts all three at build time, so there are no external font
 * requests and the fallback metrics are matched to avoid layout shift.
 */
const fraunces = Fraunces({
  subsets: ["latin"],
  variable: "--font-fraunces",
  display: "swap",
});

const plexSans = IBM_Plex_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-plex-sans",
  display: "swap",
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-plex-mono",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Sandwich Index",
  description:
    `${HAS_ACTIVE_FEED ? "A price index" : "A crowdsourced price index"} for the McChicken. McDonald's franchisees set their own prices — this tracks what they actually charge, store by store.`,
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${fraunces.variable} ${plexSans.variable} ${plexMono.variable} h-full`}
    >
      {/*
        `suppressHydrationWarning` here is for browser extensions, not for us.

        Grammarly, password managers and similar extensions write attributes
        onto <body> (`data-gr-ext-installed`, `data-new-gr-c-s-check-loaded`)
        before React hydrates, so React compares HTML that never had them
        against a DOM that does and reports a mismatch. Nothing in this app
        causes it and no user of the app can avoid it.

        It is safe *because* the className below is a static literal. The
        suppression covers attributes on this one element and does not reach a
        single child, so a real hydration mismatch anywhere inside still
        surfaces. If anything dynamic is ever added to this tag, this comment
        stops being true and the attribute has to go.
      */}
      <body className="flex min-h-full flex-col" suppressHydrationWarning>
        <a className="skip-link" href="#main">
          Skip to main content
        </a>
        {children}
        <SiteFooter />
        <ConnectionNotice />
        <FirebaseBoot />
      </body>
    </html>
  );
}
