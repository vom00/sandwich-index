"use client";

import { useEffect, useState } from "react";

export type RailItem = { id: string; title: string };

/**
 * A table of contents on a rail beside a long page (`.rail-toc` in
 * globals.css), shown on wide screens only. The section being read is marked
 * with `aria-current="location"` and an accent bar that grows in beside it.
 *
 * "Being read" is the first section, in page order, that crosses a band a
 * little below the header; when no section is in that band (in the gap
 * between two), the last one marked stays marked.
 *
 * Idea from Rare UI's Rail TOC; written here from scratch.
 */
export function RailToc({ items, label = "On this page" }: { items: readonly RailItem[]; label?: string }) {
  const [active, setActive] = useState<string | null>(items[0]?.id ?? null);

  useEffect(() => {
    const sections = items
      .map((item) => document.getElementById(item.id))
      .filter((element): element is HTMLElement => element !== null);
    if (sections.length === 0 || typeof IntersectionObserver === "undefined") return;

    const inBand = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) inBand.add(entry.target.id);
          else inBand.delete(entry.target.id);
        }
        const first = sections.find((section) => inBand.has(section.id));
        if (first !== undefined) setActive(first.id);
      },
      { rootMargin: "-18% 0px -62% 0px" },
    );
    for (const section of sections) observer.observe(section);
    return () => observer.disconnect();
  }, [items]);

  return (
    <nav aria-label={label} className="rail-toc">
      <p className="font-mono text-xs uppercase tracking-[0.18em] text-ink-subtle">{label}</p>
      <ol className="mt-3">
        {items.map((item) => (
          <li key={item.id}>
            <a
              href={`#${item.id}`}
              className="rail-link"
              aria-current={active === item.id ? "location" : undefined}
            >
              {item.title}
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
