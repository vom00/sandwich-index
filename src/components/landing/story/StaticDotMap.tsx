"use client";

import { useEffect, useRef } from "react";

import { loadPriceMap } from "@/lib/landing-map";

import { createDotMap, tierColors } from "./dotmap";

/**
 * The dot map as a still picture, for reduced motion only (the stylesheet
 * hides it otherwise, and it loads nothing unless it is shown). The pinned
 * story's flying version is skipped entirely in that mode.
 */
export function StaticDotMap() {
  const frameRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const frame = frameRef.current;
    const canvas = canvasRef.current;
    if (frame === null || canvas === null) return;
    if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    let cancelled = false;
    const seen = new IntersectionObserver(
      ([entry]) => {
        if (!entry?.isIntersecting) return;
        seen.disconnect();
        void loadPriceMap().then((data) => {
          if (cancelled) return;
          const map = createDotMap(canvas, data, tierColors());
          const width = frame.clientWidth;
          map.resize(width, width * (data.height / data.width), Math.min(2, window.devicePixelRatio || 1));
          map.draw({ flight: 1, origin: 0, alpha: { none: 1, mid: 1, low: 1, high: 1 } });
        });
      },
      { rootMargin: "300px" },
    );
    seen.observe(frame);
    return () => {
      cancelled = true;
      seen.disconnect();
    };
  }, []);

  return (
    <div ref={frameRef} className="lc-static mt-8 aspect-[1000/620] w-full" aria-hidden="true">
      <canvas ref={canvasRef} className="block h-full w-full" />
    </div>
  );
}
