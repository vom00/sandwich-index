"use client";

import { useCallback, useEffect, useRef } from "react";

/**
 * Cloudflare Turnstile, the human check on logging a price.
 *
 * Nothing loads until `NEXT_PUBLIC_TURNSTILE_SITE_KEY` is set; until then
 * `getToken` resolves null at once and the server, which has no secret
 * either, does not ask for one.
 *
 * The widget is rendered into a slot inside the form (not appended to the
 * page) because a modal dialog keeps focus inside itself, and a visitor who
 * is shown a challenge has to be able to reach it. It runs in "execute" mode
 * with "interaction-only" appearance: invisible for nearly everyone, it is
 * run on submit, and it only shows a checkbox to a visitor Cloudflare is
 * unsure about. Each token works once, so it is reset and run again for every
 * submission, which is what a log run of several stores needs.
 */

const SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;
const SCRIPT = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";

interface TurnstileApi {
  render(container: HTMLElement, options: Record<string, unknown>): string;
  execute(widget: string): void;
  reset(widget: string): void;
  remove(widget: string): void;
}

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let loading: Promise<TurnstileApi | null> | null = null;

function loadTurnstile(): Promise<TurnstileApi | null> {
  loading ??= new Promise((resolve) => {
    if (window.turnstile) return resolve(window.turnstile);
    const script = document.createElement("script");
    script.src = SCRIPT;
    script.async = true;
    script.onload = () => resolve(window.turnstile ?? null);
    script.onerror = () => {
      loading = null;
      resolve(null);
    };
    document.head.append(script);
  });
  return loading;
}

export function useTurnstile(): {
  /** Put on an empty element inside the form. */
  slotRef: React.RefObject<HTMLDivElement | null>;
  /** A fresh single-use token, or null when Turnstile is off or failed. */
  getToken: () => Promise<string | null>;
} {
  const slotRef = useRef<HTMLDivElement | null>(null);
  const widget = useRef<string | null>(null);
  const waiting = useRef<((token: string | null) => void) | null>(null);

  const settle = useCallback((token: string | null) => {
    waiting.current?.(token);
    waiting.current = null;
  }, []);

  const getToken = useCallback(async (): Promise<string | null> => {
    if (!SITE_KEY) return null;
    const api = await loadTurnstile();
    const slot = slotRef.current;
    if (api === null || slot === null) return null;

    return new Promise<string | null>((resolve) => {
      waiting.current?.(null);
      waiting.current = resolve;
      if (widget.current === null) {
        widget.current = api.render(slot, {
          sitekey: SITE_KEY,
          execution: "execute",
          appearance: "interaction-only",
          size: "flexible",
          callback: (token: string) => settle(token),
          "error-callback": () => settle(null),
          "timeout-callback": () => settle(null),
        });
      } else {
        api.reset(widget.current);
      }
      api.execute(widget.current);
    });
  }, [settle]);

  useEffect(
    () => () => {
      settle(null);
      if (widget.current !== null) window.turnstile?.remove(widget.current);
      widget.current = null;
    },
    [settle],
  );

  return { slotRef, getToken };
}
