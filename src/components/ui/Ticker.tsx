"use client";

import { Pause, Play } from "lucide-react";
import { useState, type CSSProperties } from "react";

export type TickerItem = {
  key: string;
  label: string;
  value: string;
  /** Colours the dot beside the item: the price tier, or none for a plain figure. */
  tier?: "low" | "mid" | "high";
};

const DOT: Record<NonNullable<TickerItem["tier"]>, string> = {
  low: "var(--color-tier-low)",
  mid: "var(--color-tier-mid)",
  high: "var(--color-tier-high)",
};

/**
 * A slow, edge-faded marquee of real figures (`.ticker` in globals.css).
 *
 * The list is rendered twice and the track slides by exactly one copy, so the
 * loop has no seam; the second copy is hidden from assistive technology, which
 * reads the list once. It pauses while hovered or focused, and the button
 * beside it stops it for good (WCAG 2.2.2: anything that moves for more than
 * five seconds needs a way to stop it). Under reduced motion it does not move
 * at all: the items simply wrap onto as many lines as they need.
 *
 * Pattern from the brand marquee on ashenoneport.com; written here from scratch.
 */
export function Ticker({ items, label }: { items: readonly TickerItem[]; label: string }) {
  const [paused, setPaused] = useState(false);

  const list = (copy: boolean) => (
    <ul className="ticker-set" aria-hidden={copy || undefined}>
      {items.map((item) => (
        <li key={item.key} className="ticker-item">
          <i
            className="chip-dot"
            aria-hidden="true"
            style={item.tier ? ({ "--dot": DOT[item.tier] } as CSSProperties) : undefined}
          />
          <span className="tabular text-ink">{item.value}</span>
          <span>{item.label}</span>
        </li>
      ))}
    </ul>
  );

  return (
    <section className="ticker-band" aria-label={label}>
      <div className="ticker" data-paused={paused ? "" : undefined}>
        <div className="ticker-track">
          {list(false)}
          {list(true)}
        </div>
      </div>
      <button
        type="button"
        className="ticker-toggle"
        aria-pressed={paused}
        aria-label="Pause the moving prices"
        onClick={() => setPaused((value) => !value)}
      >
        {paused ? <Play className="size-4" aria-hidden="true" /> : <Pause className="size-4" aria-hidden="true" />}
      </button>
    </section>
  );
}
