"use client";

import { useSyncExternalStore } from "react";

const QUERY = "(prefers-reduced-motion: reduce)";

function subscribe(callback: () => void): () => void {
  const media = window.matchMedia(QUERY);
  media.addEventListener("change", callback);
  return () => media.removeEventListener("change", callback);
}

function getSnapshot(): boolean {
  return window.matchMedia(QUERY).matches;
}

/**
 * Whether the user has asked for reduced motion.
 *
 * `useSyncExternalStore` rather than an effect so the value is correct on the
 * first client render — an effect would let one animated frame through before
 * correcting itself, which is precisely the frame someone with vestibular
 * sensitivity asked not to see.
 *
 * The server snapshot returns true: if we cannot know yet, the safe default is
 * no motion.
 */
export function usePrefersReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, getSnapshot, () => true);
}
