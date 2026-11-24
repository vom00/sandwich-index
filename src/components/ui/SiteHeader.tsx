"use client";

import { animate, motion, MotionConfig, useMotionValueEvent, useScroll } from "motion/react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";

import { Odometer } from "@/components/ui/Odometer";
import { SandwichMark } from "@/components/ui/SandwichMark";
import { HEADER_BOOT_ID, LOGO_BUILT_KEY } from "@/lib/header-boot";
import type { NationalMedian } from "@/lib/landing-map";
import { formatCents } from "@/lib/money";

/**
 * The bar across the top of every page: one small price board that comes
 * alive once and then holds still.
 *
 * - **Logo.** On the first page of a browser session the mark's four layers
 *   drop into a stack (a spring, bounce 0.2, 60ms apart) and then the wordmark
 *   inks in left to right (600ms). Every later page shows it built.
 *   `lib/header-boot.ts` hides the layers before the first paint so they never
 *   flash built first, and this component takes over from it.
 * - **Masthead.** Beside the wordmark (under it on narrow screens), the
 *   national median and the date of the newest reading behind it: the same
 *   figure the landing page's map chapter states (`loadNationalMedian`). It
 *   rolls in on the Odometer the first time a browser sees it and again only
 *   when it has changed since that browser's last visit; `lib/header-boot.ts`
 *   starts that roll in CSS from the first paint, so the wheels never rest on
 *   a zero that isn't the price.
 * - **Ink stroke.** The current page is marked with `aria-current="page"` and
 *   a hand-drawn stroke under its label: it draws in once when the visit
 *   starts, then glides to the next tab on navigation (Motion `layoutId`,
 *   220ms). Never by colour alone.
 * - **Slim and receipt.** Past 24px of scroll the bar slims by 8px and the
 *   hairline under it becomes a dashed receipt rule, printed left to right the
 *   first time only. Back at the top the hairline returns without a replay.
 * - **Stamp.** "Log prices" is an ink button that presses down like a price
 *   stamp.
 *
 * Under reduced motion every piece is in its final state from the first
 * paint (globals.css). The box keeps a fixed height (`--site-header-height`):
 * the map is sized to the viewport minus this bar, the landing story pins its
 * world just below it, and anchor jumps stop short of it; slimming moves the
 * bar with a transform, so nothing below it reflows. It sits above the map's
 * own layers (Leaflet's controls and the store sheet are at 1000).
 */

const LINKS = [
  { href: "/map", label: "Map", short: "Map", stamp: false },
  { href: "/log", label: "Log prices", short: "Log", stamp: true },
  { href: "/about", label: "About the data", short: "About", stamp: false },
] as const;

/** Scrolled further than this and the bar slims. */
const SLIM_AFTER_PX = 24;

/** --ease-out-quart. */
const QUART = [0.165, 0.84, 0.44, 1] as const;

/** "Nov 15". */
const CHECKED = new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

/** A pen line, slightly uneven, drawn across the label (viewBox 100 × 6). */
const INK_PATH = "M1 3.6C14 2.1 27 4.4 41 3.4S70 2.2 84 3.3 96 3.9 99 3.1";

type Rule = "plain" | "print" | "receipt";

function isCurrent(pathname: string, href: string): boolean {
  if (href === "/map") return pathname === "/map" || pathname.startsWith("/store/");
  return pathname === href;
}

export function SiteHeader({ national }: { national: NationalMedian | null }) {
  const pathname = usePathname();
  const logoRef = useRef<HTMLAnchorElement>(null);

  // --- The logo build, held at its start by the pre-paint snippet. Whether it
  // is due is read from the snippet's style once and kept, so a second run of
  // this effect (React runs effects twice in development) replays the build
  // instead of finding the style gone and skipping it.
  const buildDue = useRef<boolean | null>(null);
  useEffect(() => {
    const logo = logoRef.current;
    if (logo === null) return;
    const gate = document.getElementById(HEADER_BOOT_ID);
    buildDue.current ??= gate !== null;
    if (!buildDue.current) return;
    const layers = [...logo.querySelectorAll<SVGGElement>(".logo-layer")];
    const word = logo.querySelector<HTMLElement>(".logo-word");
    // Take over from the snippet's style without a frame in between.
    for (const layer of layers) {
      layer.style.opacity = "0";
      layer.style.transform = "translateY(-9px)";
    }
    if (word !== null) word.style.clipPath = "inset(0 100% 0 0)";
    if (gate !== null) {
      gate.remove();
      try {
        sessionStorage.setItem(LOGO_BUILT_KEY, "1");
      } catch {
        // Storage blocked: the logo builds again next page, which is harmless.
      }
    }

    // Bottom first, 60ms apart: each layer drops onto the one below.
    const running = layers.map((layer, index) => {
      const delay = index * 0.06;
      return animate(
        layer,
        { opacity: [0, 1], y: [-9, 0] },
        {
          y: { type: "spring", bounce: 0.2, visualDuration: 0.36, delay },
          opacity: { duration: 0.12, ease: "linear", delay },
        },
      );
    });
    if (word !== null) {
      running.push(animate(word, { clipPath: ["inset(0 100% 0 0)", "inset(0 0% 0 0)"] }, { duration: 0.6, ease: QUART, delay: 0.42 }));
    }
    return () => {
      for (const animation of running) animation.stop();
    };
  }, []);

  // --- Ink stroke: after the first draw, later strokes arrive settled.
  const [inkSettled, setInkSettled] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setInkSettled(true), 400);
    return () => window.clearTimeout(timer);
  }, []);

  // --- Slim bar and receipt rule.
  const [slim, setSlim] = useState(false);
  const [rule, setRule] = useState<Rule>("plain");
  const slimRef = useRef(false);
  const printedRef = useRef(false);
  const apply = useCallback((y: number) => {
    const next = y > SLIM_AFTER_PX;
    if (next === slimRef.current) return;
    slimRef.current = next;
    setSlim(next);
    if (!next) {
      setRule("plain");
      return;
    }
    setRule(printedRef.current ? "receipt" : "print");
    printedRef.current = true;
  }, []);
  const { scrollY } = useScroll();
  useMotionValueEvent(scrollY, "change", apply);
  // A page opened part-way down, or the scroll reset that comes with a new page.
  useEffect(() => {
    const frame = window.requestAnimationFrame(() => apply(window.scrollY));
    return () => window.cancelAnimationFrame(frame);
  }, [apply, pathname]);
  // The page's reading-progress line sits under the bar and follows it up.
  useEffect(() => {
    document.documentElement.toggleAttribute("data-header-slim", slim);
  }, [slim]);

  return (
    <header
      className="site-header sticky top-0 z-[1500] shrink-0"
      data-slim={slim ? "" : undefined}
      data-rule={rule}
    >
      <div className="site-header-row mx-auto flex h-full w-full max-w-[68rem] items-center justify-between gap-3 px-5 sm:px-8">
        <div className="logo-block relative flex items-center" data-masthead={national === null ? undefined : ""}>
          <Link
            ref={logoRef}
            href="/"
            aria-current={pathname === "/" ? "page" : undefined}
            className="hover-accent -ml-1 inline-flex min-h-11 items-center gap-2 px-1 font-display text-base font-semibold tracking-tight sm:text-lg"
          >
            <SandwichMark className="size-7 shrink-0" />
            <span className="logo-type">
              <span className="logo-word inline-block">Sandwich Index</span>
            </span>
          </Link>
          {national !== null ? (
            // The figure is the Odometer's own text for screen readers; the
            // short labels around it are spelled out for them.
            <p className="masthead">
              <span className="sr-only">National McChicken median </span>
              <span aria-hidden="true">
                <span className="hidden md:inline">US </span>Median{" "}
              </span>
              <Odometer value={formatCents(national.cents)} className="masthead-figure" />
              <span aria-hidden="true"> · </span>
              <span className="sr-only">, prices checked </span>
              <time dateTime={national.checkedAt.slice(0, 10)}>{CHECKED.format(new Date(national.checkedAt))}</time>
            </p>
          ) : null}
        </div>

        <MotionConfig reducedMotion="user">
          <nav aria-label="Main">
            <ul className="-mr-2 flex items-center">
              {LINKS.map((link) => {
                const current = isCurrent(pathname, link.href);
                const label = (
                  <>
                    <span className="sm:hidden">{link.short}</span>
                    <span className="hidden sm:inline">{link.label}</span>
                  </>
                );
                const ink = current ? (
                  // Motion projects layout only for HTML elements, so the
                  // glide is on a span and the stroke is drawn inside it.
                  <motion.span
                    layoutId="nav-ink"
                    className="nav-ink"
                    aria-hidden="true"
                    data-settled={inkSettled ? "" : undefined}
                    transition={{ layout: { duration: 0.22, ease: QUART } }}
                  >
                    <svg viewBox="0 0 100 6" preserveAspectRatio="none" focusable="false">
                      <path d={INK_PATH} pathLength={1} />
                    </svg>
                  </motion.span>
                ) : null;
                return (
                  <li key={link.href}>
                    <Link
                      href={link.href}
                      aria-current={current ? "page" : undefined}
                      // The full label even where the short one shows, so the
                      // accessible name always contains the visible text.
                      aria-label={link.label}
                      className={
                        link.stamp
                          ? "stamp inline-flex min-h-11 items-center px-1 text-sm font-medium sm:mx-2"
                          : `link-wipe hover-accent inline-flex min-h-11 items-center px-2 text-sm sm:px-3 ${
                              current ? "font-medium text-ink" : "text-ink-muted"
                            }`
                      }
                    >
                      {link.stamp ? (
                        <span className="stamp-face">
                          {label}
                          {ink}
                        </span>
                      ) : (
                        // The line under the words wipes in on hover and
                        // focus (`.wipe` in globals.css); the ink stroke
                        // marks the current page.
                        <span className="wipe">
                          {label}
                          {ink}
                        </span>
                      )}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>
        </MotionConfig>
      </div>
      <span className="site-header-rule" aria-hidden="true">
        <i className="rule-plain" />
        <i className="rule-receipt" />
      </span>
    </header>
  );
}
