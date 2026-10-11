import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // A production build must not race the dev server for .next — both writing
  // there corrupts whichever loses. CI and one-off local builds set
  // NEXT_DIST_DIR to build alongside a running `next dev` instead of into it.
  distDir: process.env.NEXT_DIST_DIR ?? ".next",
};

export default nextConfig;
