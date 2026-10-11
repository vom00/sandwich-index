/**
 * The canonical origin for absolute URLs (robots, sitemap, future OG tags).
 *
 * Comes from NEXT_PUBLIC_SITE_URL so each deployment names itself; the
 * localhost fallback keeps dev honest rather than emitting a production
 * hostname from a machine that is not production.
 */
export function siteUrl(): string {
  return (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");
}
