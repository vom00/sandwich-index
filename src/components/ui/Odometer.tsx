"use client";

import { useEffect, useRef, type CSSProperties } from "react";

/**
 * A figure whose digits roll up on wheels (`.odo` in globals.css).
 *
 * The real figure is plain text in a visually hidden span, so screen readers,
 * tests, search engines and `textContent` all get exactly `value`. The wheels
 * beside it are hidden from assistive technology and drawn with generated
 * content, so they add no text of their own.
 *
 * Two ways to start:
 * - `roll="load"`: for a figure that is on screen when the page opens (a
 *   store's price). A CSS animation rolls it from the first paint, with no
 *   JavaScript, so there is never a moment where it shows a wrong number.
 * - `roll="view"` (the default): for a figure further down the page. Once the
 *   page has loaded, a figure still below the fold is set to zero and rolls up
 *   when it scrolls into view. A figure already on screen is left alone.
 *
 * The server always renders the final digits; zero is only ever shown to a
 * figure that is out of sight. Under reduced motion nothing moves.
 *
 * Idea from Rare UI's Animated Counter; written here from scratch.
 */
export function Odometer({
  value,
  className,
  roll = "view",
}: {
  value: string;
  className?: string;
  roll?: "view" | "load";
}) {
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (roll !== "view" || element === null) return;
    if (typeof IntersectionObserver === "undefined") return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const box = element.getBoundingClientRect();
    if (box.top < window.innerHeight && box.bottom > 0) return;

    element.setAttribute("data-armed", "");
    const observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        observer.disconnect();
        // The wheels have sat at zero since the page loaded, so dropping the
        // attribute is enough for the transition to run up to the digits.
        element.removeAttribute("data-armed");
      },
      { threshold: 0.5 },
    );
    observer.observe(element);
    return () => {
      observer.disconnect();
      element.removeAttribute("data-armed");
    };
  }, [roll]);

  let column = 0;
  return (
    <span ref={ref} className={className ? `odo ${className}` : "odo"} data-roll={roll}>
      <span className="sr-only">{value}</span>
      <span className="odo-row" aria-hidden="true">
        {Array.from(value).map((character, index) =>
          /\d/.test(character) ? (
            <span
              key={index}
              className="odo-col"
              style={{ "--d": Number(character), "--k": column++ } as CSSProperties}
            />
          ) : (
            <span key={index} className="odo-ch" data-c={character} />
          ),
        )}
      </span>
    </span>
  );
}
