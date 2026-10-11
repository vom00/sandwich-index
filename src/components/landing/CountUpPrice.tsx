"use client";

import { useEffect, useLayoutEffect, useRef } from "react";

import { usePrefersReducedMotion } from "@/hooks/usePrefersReducedMotion";
import { formatCents } from "@/lib/money";

/**
 * The hero number, counting up from zero.
 *
 * Three things this deliberately does not do:
 *
 * 1. **It does not hold the value in React state.** Sixty setState calls a
 *    second to animate one string would re-render the tree for no reason; the
 *    count writes straight to `textContent` through a ref.
 * 2. **It does not render a placeholder on the server.** The final figure is in
 *    the HTML, so the number is correct with JavaScript disabled, correct
 *    before hydration, and correct if the animation never runs.
 * 3. **It does not leave the decimal at a fraction.** Every frame rounds to a
 *    whole number of cents and goes through `formatCents`, so the count-up is
 *    made of real prices rather than a float sliding toward one.
 *
 * The layout effect matters: an ordinary effect fires after paint, which would
 * show the final figure for one frame and then snap back to zero to start.
 */
const useBeforePaint = typeof window === "undefined" ? useEffect : useLayoutEffect;

/** The spec's budget for a hero reveal. Earned here; a marketing surface. */
const DURATION_MS = 800;

/** `--ease-out-quart`, evaluated in JS. */
function easeOutQuart(t: number): number {
  return 1 - (1 - t) ** 4;
}

export function CountUpPrice({
  cents,
  className,
}: {
  cents: number;
  className?: string;
}) {
  const ref = useRef<HTMLSpanElement>(null);
  const reducedMotion = usePrefersReducedMotion();

  useBeforePaint(() => {
    if (reducedMotion) return;

    const node = ref.current;
    if (node === null) return;

    let frame = 0;
    let start: number | null = null;

    const step = (now: number) => {
      // The zeroing waits for the first frame on purpose. A page opened in a
      // background tab hydrates, but `requestAnimationFrame` is suspended
      // until the tab is shown — zeroing synchronously left "$0.00" sitting
      // in the DOM the whole time (prints, screenshots, the accessibility
      // tree). Inside the first callback, the server-rendered figure survives
      // until there is an actual paint to animate toward, and rAF runs before
      // that paint, so the answer still never flashes.
      if (start === null) {
        start = now;
        node.textContent = formatCents(0);
      }
      const progress = Math.min(1, Math.max(0, (now - start) / DURATION_MS));
      node.textContent = formatCents(Math.round(cents * easeOutQuart(progress)));
      if (progress < 1) {
        frame = requestAnimationFrame(step);
      } else {
        node.textContent = formatCents(cents);
      }
    };

    frame = requestAnimationFrame(step);

    return () => {
      cancelAnimationFrame(frame);
      // Whatever interrupted this, the correct number is the one to be left on.
      node.textContent = formatCents(cents);
    };
  }, [cents, reducedMotion]);

  return (
    <span ref={ref} className={className}>
      {formatCents(cents)}
    </span>
  );
}
