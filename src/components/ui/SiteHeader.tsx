"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { SandwichMark } from "@/components/ui/SandwichMark";

/**
 * The bar across the top of every page.
 *
 * Without it, the map and the store pages had no way back to the landing page
 * except the browser's back button. The wordmark goes home; the three links
 * cover the rest of the site. The current page is marked with
 * `aria-current="page"` and a drawn underline, so where you are is never shown
 * by colour alone.
 *
 * Pinned to the top while the page scrolls, so the way to the other pages is
 * always in reach. Its height is fixed (`--site-header-height` in globals.css):
 * the map is sized to the viewport minus this bar, the landing story pins its
 * world just below it, and anchor jumps stop short of it. It sits above the
 * map's own layers (Leaflet's controls and the store sheet are at 1000).
 * A client component only because `usePathname` needs one.
 */

const LINKS = [
  { href: "/map", label: "Map", short: "Map" },
  { href: "/log", label: "Log prices", short: "Log" },
  { href: "/about", label: "About the data", short: "About" },
] as const;

function isCurrent(pathname: string, href: string): boolean {
  if (href === "/map") return pathname === "/map" || pathname.startsWith("/store/");
  return pathname === href;
}

export function SiteHeader() {
  const pathname = usePathname();

  return (
    // The paper comes from `.site-header` in globals.css: solid paper with a
    // faint grain, and a soft shadow once the page scrolls.
    <header className="site-header sticky top-0 z-[1500] shrink-0 border-b border-rule">
      <div className="mx-auto flex h-full w-full max-w-[68rem] items-center justify-between gap-3 px-5 sm:px-8">
        <Link
          href="/"
          aria-current={pathname === "/" ? "page" : undefined}
          className="hover-accent -ml-1 inline-flex min-h-11 items-center gap-2 px-1 font-display text-base font-semibold tracking-tight sm:text-lg"
        >
          <SandwichMark className="logo-mark size-7 shrink-0" />
          Sandwich Index
        </Link>

        <nav aria-label="Main">
          <ul className="-mr-2 flex items-center">
            {LINKS.map((link) => {
              const current = isCurrent(pathname, link.href);
              return (
                <li key={link.href}>
                  <Link
                    href={link.href}
                    aria-current={current ? "page" : undefined}
                    // The full label even where the short one shows, so the
                    // accessible name always contains the visible text.
                    aria-label={link.label}
                    // The line under the words wipes in on hover and stays
                    // under the current page (`.wipe` in globals.css).
                    className={`link-wipe hover-accent inline-flex min-h-11 items-center px-2 text-sm sm:px-3 ${
                      current ? "font-medium text-ink" : "text-ink-muted"
                    }`}
                  >
                    <span className="wipe">
                      <span className="sm:hidden">{link.short}</span>
                      <span className="hidden sm:inline">{link.label}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </nav>
      </div>
    </header>
  );
}
