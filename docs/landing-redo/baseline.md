# Landing page baseline (before redesign)

Branch `landing-redo`, Next.js 16.3.8 (Turbopack). Measured against a production build served by `next start -p 3200` (Firestore emulator at 8180, 235 stores / 201 with a price). Machine: Windows 11, Microsoft Edge (Lighthouse and Playwright via `channel: 'msedge'`).

## Lighthouse mobile (default emulation and throttling, headless, 3 runs)

| Metric | Run 1 | Run 2 | Run 3 | Median |
|---|---|---|---|---|
| Performance score | 82 | 75 | 76 | **76** |
| LCP | 3669 ms | 4413 ms | 4257 ms | **4257 ms** |
| CLS | 0 | 0 | 0 | **0** |
| TBT | 345 ms | 399 ms | 400 ms | **399 ms** |
| Speed Index | 1764 ms | 1773 ms | 1803 ms | **1773 ms** |
| FCP (extra) | 761 ms | 759 ms | 756 ms | 759 ms |
| Total transferred | 715,164 B | 715,163 B | 715,164 B | **715,164 B (698 KB)** |
| JS transferred | 567,081 B | 567,081 B | 567,081 B | **567,081 B (554 KB)** |

Raw files: `baseline/lighthouse-1.json` to `-3.json`. Summary script: `baseline/tools/lh-summary.js`. No runtime errors in any run.

## JS transferred on `/` (Playwright, 375x812, after idle + one scroll pass, CDP encoded sizes)

19 script requests, 574,353 B total (Lighthouse counts 567,081 B; small difference is timing/chunk set). All requests on the page: 43, 742,083 B.

| Bytes | Chunk |
|---|---|
| 185,758 | 2s05re-82d2f9.js (626 KB raw; likely the Firebase/shared client bundle, not identified) |
| **141,111** | **10yddoj-br3bp.js (560 KB raw) - contains three.js (`WebGLRenderer`)** |
| 74,764 | 3sg07wnn969xq.js |
| 44,398 | 0p6f26edf3v8b.js |
| 43,295 | 0e11ge4c-c71n.js |
| 12,946 | 2jh14ceum_bt3.js |
| 11,191 | 1x86m1wmi5vo6.js |
| 10,461 | 2vfq3s8hxkx4b.js |
| 10,382 | 43_i2zxn4wddb.js |
| 9,733 | 2i51e627rllld.js |
| 5,693 | turbopack-3b6avao33na-8.js |
| 4,611 | 276ah2bn8nd86.js |
| 3,727 | 342uaigbyxeub.js |
| 3,545 | 0nyz9e8h4aco1.js |
| 3,413 | 1_jj_yocjq59s.js |
| 3,352 | 0oeds6xg-zier.js |
| 2,273 | 2i3mf3niqsaff.js |
| 2,114 | 0wcya4zade_7x.js |
| 1,586 | 1gnk7hmlerbfx.js |

three.js chunk is 141 KB transferred (about 25% of all JS). All three canvases reached `data-status="ready"`.

`next build` printed no per-route size table (Turbopack build in 16.3 lists routes only: `/` is dynamic, `/about`, `/log`, `/map` static). Log: `baseline/tools/build.log`.

## Console and CSP (port 3200, `/`)

No console errors or warnings, no page errors, no failed requests, no CSP violation messages. The CSP header is present: `default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' + recaptcha; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: tile.openstreetmap.org; connect-src self + Firebase hosts + http://127.0.0.1:8180/9198; worker-src 'self' blob:; frame-ancestors 'none'; upgrade-insecure-requests`.

## Screenshots (`docs/landing-redo/baseline/`)

- `landing-375.png`, `landing-768.png`, `landing-1440.png` (full page, dev server :3100)
- `landing-375-top.png`, `landing-768-top.png`, `landing-1440-top.png` (first viewport, dev server :3100)
- `landing-prod-375.png`, `landing-prod-1440.png` (full page, prod build :3200, populated data; extra)

Full-page heights on :3100: 375 px wide 4376 px, 768 px wide 4542 px, 1440 px wide 2760 px.

## Current page, top to bottom

1. Header: logo "Sandwich Index", links Map, Log prices, About the data.
2. Hero: a small mono counter line ("N stores tracked, N with a current price"), a big serif headline built from the data (spread between cheapest and priciest McChicken, or "Nothing to report yet." when empty), a short sourced sentence and a link to find prices; on the right an isometric 3D scene of a sandwich conveyor line with price tags. With data, a cheapest/priciest figure with source note appears.
3. "Why it moves": an isometric corporate-tower scene beside a serif statement that franchisees set prices, plus two paragraphs; then a "ends of the range" block listing the three cheapest and three priciest stores with prices, source and age, and a link to the map.
4. "How a price gets here": three numbered steps (somebody sees a price, logs it against one restaurant, the store's price updates) beside an isometric menu-board/phone/map-pin scene.
5. Dark call-to-action band ("Seen a McChicken price lately? Add it." with Log prices near you / How the data works buttons), then a footer with data attribution and a non-affiliation disclaimer.

## Things that did not work or differ

- The dev server (:3100) rendered the EMPTY state (0 stores, headline "Nothing to report yet."), while the prod build on :3200 saw 235 stores. The dev screenshots therefore show the empty-state hero and no cheapest/priciest block; `landing-prod-*` show the populated page. The cause (different Firestore data or env for the dev server) was not investigated. Any redesign comparison must use the same data state on both sides.
- Lighthouse run 1 scored noticeably higher (82) than runs 2 and 3 (75, 76); LCP variance of about 750 ms between runs.
- The next-start process initially had the wrong PID picked by my first cleanup command (empty PID, harmless); the correct PID 33544 was verified by its command line and stopped. `.next-build` deleted. Dev server on 3100 untouched.
- Not identified: which library fills the 186 KB chunk (no bundle analyzer run). No Lighthouse fallback needed; Lighthouse drove Edge on the first attempt.
