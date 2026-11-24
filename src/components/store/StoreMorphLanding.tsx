"use client";

import { useLayoutEffect } from "react";

import { landMorph } from "@/lib/store-morph";

/**
 * Tells a map-to-store morph (`lib/store-morph`) that this page's header is
 * now in the document. A layout effect, so the browser captures the page
 * before it is first painted. Renders nothing, and does nothing when the page
 * was reached any other way.
 */
export function StoreMorphLanding() {
  useLayoutEffect(landMorph, []);
  return null;
}
