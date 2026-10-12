import type { NextConfig } from "next";

/**
 * Headers every response gets. They restrict what the page may be embedded
 * in and which powerful features it may ask for; none of them restricts
 * scripts, styles or connections. A full Content-Security-Policy needs the
 * production Firebase and tile hosts tested in place, so it waits for a
 * deployment (see README, Deployment).
 */
const SECURITY_HEADERS = [
  // Nobody may frame the site, so a submit button can't be overlaid and
  // clicked on someone's behalf. The CSP directive is the current standard;
  // X-Frame-Options covers older browsers.
  {
    key: "Content-Security-Policy",
    value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'",
  },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  // Other sites see our origin, never the store or page a visitor came from.
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // Location is the one powerful feature the map uses, and only from our own
  // pages. Everything else is off.
  {
    key: "Permissions-Policy",
    // Only features every current browser recognises: an unknown one is
    // logged to the console as an error on every page.
    value: "geolocation=(self), camera=(), microphone=(), payment=(), usb=()",
  },
];

const nextConfig: NextConfig = {
  // A production build must not race the dev server for .next — both writing
  // there corrupts whichever loses. CI and one-off local builds set
  // NEXT_DIST_DIR to build alongside a running `next dev` instead of into it.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",

  headers() {
    return [{ source: "/:path*", headers: SECURITY_HEADERS }];
  },
};

export default nextConfig;
