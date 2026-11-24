"use client";

import { useEffect, useRef, type ReactNode } from "react";

/**
 * Lets a picture settle into place once, the first time it scrolls into view,
 * and never again. The CSS for what settling means lives with the picture
 * (`[data-settle]` in globals.css); this only says when.
 *
 * Server-rendered in its finished state, so without JavaScript, under reduced
 * motion, or when it is already on screen as the page loads, it simply shows.
 * Only a picture still below the fold is hidden, to be settled on arrival.
 */
export function SettleOnView({ children, className }: { children: ReactNode; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const element = ref.current;
    if (element === null) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (element.getBoundingClientRect().top < window.innerHeight) return;
    element.dataset.settle = "armed";
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting !== true) return;
        observer.disconnect();
        element.dataset.settle = "in";
      },
      { threshold: 0.35 },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className={className}>
      {children}
    </div>
  );
}
