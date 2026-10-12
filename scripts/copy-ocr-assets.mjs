/**
 * Copies the OCR engine and its English model into public/ocr/, where the
 * receipt reader loads them from (src/lib/ocr.ts).
 *
 * Self-hosted rather than fetched from tesseract.js's default CDN, so reading
 * a photo talks to nobody but this site, and a future Content-Security-Policy
 * has no third-party script host to allow. public/ocr/ is gitignored: these
 * are build outputs of package versions pinned in package.json, ~15 MB of
 * them, and copying is cheaper than committing.
 *
 * Only the LSTM cores are copied, because the reader creates its worker with
 * the LSTM engine (OEM 1), and a browser downloads just one of the three:
 * tesseract.js picks relaxed-SIMD, SIMD or plain by what the browser supports.
 *
 * Runs before `next dev` and `next build`. Skips files already in place.
 */

import { copyFileSync, existsSync, mkdirSync, statSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";

const require = createRequire(import.meta.url);
const tesseract = dirname(require.resolve("tesseract.js/package.json"));
const core = dirname(require.resolve("tesseract.js-core/package.json", { paths: [tesseract] }));
const eng = dirname(require.resolve("@tesseract.js-data/eng/package.json"));

const COPIES = [
  [join(tesseract, "dist/worker.min.js"), "public/ocr/worker.min.js"],
  [join(core, "tesseract-core-lstm.wasm.js"), "public/ocr/core/tesseract-core-lstm.wasm.js"],
  [join(core, "tesseract-core-simd-lstm.wasm.js"), "public/ocr/core/tesseract-core-simd-lstm.wasm.js"],
  [join(core, "tesseract-core-relaxedsimd-lstm.wasm.js"), "public/ocr/core/tesseract-core-relaxedsimd-lstm.wasm.js"],
  [join(eng, "4.0.0_best_int/eng.traineddata.gz"), "public/ocr/lang/eng.traineddata.gz"],
];

let copied = 0;
for (const [from, to] of COPIES) {
  if (existsSync(to) && statSync(to).size === statSync(from).size) continue;
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
  copied += 1;
}
if (copied > 0) console.log(`copy-ocr-assets: ${copied} of ${COPIES.length} files copied to public/ocr/`);
