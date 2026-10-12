import type { NextConfig } from "next";

/**
 * The full policy: what the page may load and talk to. Every outside host a
 * browser reaches is listed and why; the server's own calls (Overpass,
 * Photon, Zippopotam) aren't, since a CSP only governs the browser.
 *
 * Scripts allow 'unsafe-inline' because Next streams its payload in inline
 * <script> tags. A nonce would remove that, but it needs a per-request
 * header and turns every static page dynamic; the host allow-list below is
 * what this policy buys, and that is still most of the value: injected
 * markup can't pull a script, image or connection from anywhere else.
 */
const CONTENT_SECURITY_POLICY = [
  "default-src 'self'",
  // 'wasm-unsafe-eval': the photo reader's OCR engine is WebAssembly.
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'",
  // React style attributes and Leaflet's positioning are inline styles.
  "style-src 'self' 'unsafe-inline'",
  // Map tiles; data: for Leaflet's icons; blob: for the photo being read.
  "img-src 'self' data: blob: https://tile.openstreetmap.org",
  "font-src 'self' data:",
  // Firestore, anonymous sign-in and its token refresh, and App Check; the
  // local emulators when a local production build points at them.
  "connect-src 'self' https://firestore.googleapis.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://firebaseinstallations.googleapis.com https://content-firebaseappcheck.googleapis.com" +
    (process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATOR === "true" ? " http://127.0.0.1:8080 http://127.0.0.1:9099" : ""),
  // tesseract.js starts its worker from a blob: URL.
  "worker-src 'self' blob:",
  // reCAPTCHA, for App Check once a site key is set.
  "frame-src https://www.google.com https://recaptcha.google.com",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

const SECURITY_HEADERS = [
  // Nobody may frame the site, so a submit button can't be overlaid and
  // clicked on someone's behalf. The CSP directive is the current standard;
  // X-Frame-Options covers older browsers.
  //
  // Production builds get the full policy. It ran report-only on the live site
  // first (2026-10-12): every page, the 3D scenes, the map and its tiles, and
  // the photo reader's worker and WebAssembly, with no violations. Development
  // keeps only the framing rules, because hot reload needs eval and a socket.
  {
    key: "Content-Security-Policy",
    value:
      process.env.NODE_ENV === "production"
        ? CONTENT_SECURITY_POLICY
        : "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'",
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
