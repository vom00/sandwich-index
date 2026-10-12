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
 * `aria-current="page"` and an underline, so where you are is never shown by
 * colour alone.
 *
 * Not sticky. On the map, every pixel of height belongs to the map, which is
 * sized to the viewport minus this bar (`--site-header-height` in globals.css).
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
    <header className="site-header shrink-0 border-b border-rule bg-paper">
      <div className="mx-auto flex h-full w-full max-w-[68rem] items-center justify-between gap-3 px-5 sm:px-8">
        <Link
          href="/"
          aria-current={pathname === "/" ? "page" : undefined}
          className="hover-accent -ml-1 inline-flex min-h-11 items-center gap-2 px-1 font-display text-base font-semibold tracking-tight sm:text-lg"
        >
          <SandwichMark className="size-7 shrink-0" />
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
                    className={`hover-accent inline-flex min-h-11 items-center px-2 text-sm sm:px-3 ${
                      current
                        ? "font-medium text-ink underline decoration-2 underline-offset-[6px]"
                        : "text-ink-muted"
                    }`}
                  >
                    <span className="sm:hidden">{link.short}</span>
                    <span className="hidden sm:inline">{link.label}</span>
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
