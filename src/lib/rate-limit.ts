import { NextResponse } from "next/server";

/**
 * A per-client request limit for the public API routes.
 *
 * Each route that costs Firestore reads or outside lookups (/api/stores,
 * /api/stores/sync, /api/stores/[id]/recompute) is open to anyone, and the
 * project runs on Firestore's free tier: 50,000 reads a day for every visitor
 * combined. One script hammering one of these routes could spend that for
 * everybody. This caps how often one address may call each route.
 *
 * The count lives in this server instance's memory, so it needs no database
 * and no new service. The cost is that it is per instance: a client whose
 * requests land on several instances at once gets the limit once per
 * instance. That still turns "unlimited" into "a small multiple of the limit",
 * which is what protects the quota; a platform firewall rule would be the
 * stricter, shared version of the same thing.
 */

export interface RateLimitRule {
  /** Short name of the route, so two routes never share a counter. */
  name: string;
  /** Requests allowed per window. */
  limit: number;
  /** Window length in milliseconds. */
  windowMs: number;
}

export type RateLimitResult =
  | { ok: true; remaining: number }
  | { ok: false; retryAfterSeconds: number };

interface Window {
  startedAt: number;
  count: number;
}

/** More keys than this and expired windows are swept before adding another. */
const MAX_KEYS = 10_000;

const windows = new Map<string, Window>();

/**
 * The caller's address. On Vercel `x-forwarded-for` is set by the platform
 * (any value the client sent is replaced), and its first entry is the client.
 * Locally there is no proxy, so every request shares one bucket.
 */
export function clientAddress(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  const first = forwarded?.split(",")[0]?.trim();
  if (first) return first;
  return request.headers.get("x-real-ip")?.trim() || "local";
}

function sweep(now: number, windowMs: number): void {
  for (const [key, window] of windows) {
    if (now - window.startedAt >= windowMs) windows.delete(key);
  }
  // Still full of live windows: drop the oldest (Map keeps insertion order).
  while (windows.size >= MAX_KEYS) {
    const oldest = windows.keys().next().value;
    if (oldest === undefined) break;
    windows.delete(oldest);
  }
}

/** Count one request from `address` against `rule`. */
export function takeToken(rule: RateLimitRule, address: string, now: number = Date.now()): RateLimitResult {
  const key = `${rule.name}|${address}`;
  let window = windows.get(key);

  if (window === undefined || now - window.startedAt >= rule.windowMs) {
    if (window === undefined && windows.size >= MAX_KEYS) sweep(now, rule.windowMs);
    window = { startedAt: now, count: 0 };
    windows.delete(key);
    windows.set(key, window);
  }

  if (window.count >= rule.limit) {
    const retryAfterSeconds = Math.max(1, Math.ceil((window.startedAt + rule.windowMs - now) / 1000));
    return { ok: false, retryAfterSeconds };
  }

  window.count += 1;
  return { ok: true, remaining: rule.limit - window.count };
}

/**
 * The 429 a route returns when `takeToken` says no, or null to carry on.
 * `Retry-After` tells a well-behaved client (and the site's own scripts) how
 * long to wait.
 */
export function rateLimited(rule: RateLimitRule, request: Request): NextResponse | null {
  const address = clientAddress(request);
  // No proxy in front: a local dev server, where the test suites call these
  // routes far faster than any visitor. Vercel always sets the header.
  if (address === "local") return null;
  const result = takeToken(rule, address);
  if (result.ok) return null;
  return NextResponse.json(
    { error: "Too many requests. Try again shortly." },
    { status: 429, headers: { "Retry-After": String(result.retryAfterSeconds) } },
  );
}

/** Test hook: forget every window. */
export function resetRateLimits(): void {
  windows.clear();
}

/**
 * The limits, per address per minute. A visitor choosing a location makes one
 * store read and one sync; logging a price makes one recompute. The ceilings
 * leave room for several of those a minute and stop a loop.
 */
export const STORES_RATE: RateLimitRule = { name: "stores", limit: 60, windowMs: 60_000 };
export const SYNC_RATE: RateLimitRule = { name: "sync", limit: 12, windowMs: 60_000 };
export const RECOMPUTE_RATE: RateLimitRule = { name: "recompute", limit: 12, windowMs: 60_000 };
/** A log run submits one store after another, so this allows a brisk run. */
export const SUBMIT_RATE: RateLimitRule = { name: "submit", limit: 20, windowMs: 60_000 };
