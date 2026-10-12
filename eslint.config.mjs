import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    ".next-build/**",
    // Minified OCR engine copied from node_modules (scripts/copy-ocr-assets.mjs).
    "public/ocr/**",
  ]),
  {
    /*
     * The browser suites are standalone CommonJS scripts run by `node`, not
     * application modules — they drive Playwright against a dev server and
     * never enter the bundle. The TypeScript/ESM rules the app is linted
     * with therefore do not apply: `require()` is how these load Playwright,
     * and their in-page callbacks reference browser globals that exist only
     * inside `page.evaluate`.
     *
     * Scoped to this directory rather than switched off globally, so app code
     * keeps the stricter rules.
     */
    files: ["tests/browser/**/*.js"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
      "@typescript-eslint/no-unused-vars": "warn",
    },
  },
]);

export default eslintConfig;
