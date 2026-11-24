import type { Metadata } from "next";
import { Fraunces, IBM_Plex_Mono, IBM_Plex_Sans } from "next/font/google";

import { ConnectionNotice } from "@/components/ui/ConnectionNotice";
import { FirebaseBoot } from "@/components/ui/FirebaseBoot";
import { SiteFooter } from "@/components/ui/SiteFooter";
import { SiteHeader } from "@/components/ui/SiteHeader";
import { HAS_ACTIVE_FEED } from "@/lib/feeds";
import { headerBootScript } from "@/lib/header-boot";
import { loadNationalMedian } from "@/lib/landing-map";
import { siteUrl } from "@/lib/site";
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
  // Makes relative image URLs (a store's share card) absolute, as social cards require.
  metadataBase: new URL(siteUrl()),
  title: "Sandwich Index",
  description:
    `${HAS_ACTIVE_FEED ? "A price index" : "A crowdsourced price index"} for the McChicken. McDonald's franchisees set their own prices. This tracks what they actually charge, store by store.`,
  // No title or description here on purpose: Next fills og:title,
  // og:description and the Twitter pair from each page's own, and setting them
  // here would give every store page the site's instead. Images come from a
  // route's opengraph-image (store pages); Twitter reuses them.
  openGraph: {
    type: "website",
    siteName: "Sandwich Index",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
  },
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // The masthead figure in the header: the same national median the landing
  // page states, from the same file.
  const national = await loadNationalMedian();
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
        {/* Before the header is parsed: holds the logo's layers and the
            masthead's wheels at their start when their once-only moment is
            due, so SiteHeader can play it without a flash (lib/header-boot.ts). */}
        <script dangerouslySetInnerHTML={{ __html: headerBootScript(national === null ? null : String(national.cents)) }} />
        <SiteHeader national={national} />
        {children}
        <SiteFooter />
        <ConnectionNotice />
        <FirebaseBoot />
      </body>
    </html>
  );
}
