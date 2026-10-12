# Audit log

What the continuous audit found while the owner was away. Bugs are listed
with what was actually wrong, because "fixed X" without the failure mode is
not reviewable.

## App bugs found and fixed

**Landing hero read $0.00 in any tab that loaded hidden.**
`CountUpPrice` zeroed the DOM synchronously and then waited for
`requestAnimationFrame` to count up — but rAF is suspended in a background
tab, so the headline claim ("$0.00 separates the cheapest McChicken from the
priciest") sat there indefinitely: background tabs, print, screenshots,
the accessibility tree. The zeroing now happens inside the first animation
frame, so the server-rendered figure survives until there is a real paint to
animate toward. `src/components/landing/CountUpPrice.tsx`.

**One restaurant could exist twice.** OpenStreetMap frequently maps a
McDonald's as both an amenity node and a building way; the sync created both
as separate stores, splitting one restaurant's price history across two map
pins (5220 N MacArthur, Irving: a node with 21 reports and a way with none,
one metre apart). `src/lib/store-twins.ts` now drops incoming elements
within 75 m of a better candidate — address beats no address, node beats
way, and an already-existing store always wins, because merging price
history is a human decision, not a sync side effect. Six unit tests.

**The landing snapshot would have silently understated the spread at
scale.** `getIndexSnapshot` read the 250 *cheapest* priced stores and then
called the most expensive of those "priciest". Below the cap that is the
whole set and correct; above it — i.e. exactly when the index goes national,
which is the stated goal — the headline spread quietly shrinks with nothing
looking broken. It now reads both ends of the range in two bounded queries
and merges. Counts remain window-bounded above 500 priced stores, and that
is documented at the constant. `src/lib/stores.server.ts`.

**No `robots.txt` or `sitemap.xml`.** Added as Next metadata routes with an
env-driven origin (`NEXT_PUBLIC_SITE_URL`, localhost fallback so dev never
emits a production hostname). Store pages are deliberately not enumerated in
the sitemap yet — that trade (crawl coverage vs a Firestore read per crawler
fetch) is worth deciding against a real domain.

**A production build raced the dev server for `.next`.** `next.config.ts`
now honours `NEXT_DIST_DIR`, so a build can run alongside `next dev` instead
of corrupting its output.

## Accessibility

**"Change location" on the map was a 20px tap target.** The project holds
itself to 44px and asserts it in the browser suites — but only on `/log`, so
this one was never measured. It is a link-styled button sitting inside a
sentence ("88 within 15 miles · Change location"), which is exactly why it was
missed: vertical padding would push the line apart, so it had none.

Fixed with a `.tap-target` utility in `globals.css` — a transparent
`::after` overlay, `min-height: 44px`, centred on the control and outside
layout flow. Measured with `elementFromPoint` afterwards rather than assumed:
the control is hit at ±21.5px from its centre in both directions (the full
44px), while its paragraph is still 20px tall, so nothing moved. The Leaflet
zoom buttons (30px) and map attribution links (12px) are third-party chrome
and left alone.

**The gap is now closed by a sweep, not a spot check.**
`%TEMP%/playwright-test-taptargets.js` measures every interactive element on
`/`, `/about`, `/map`, `/log` and a store page, at 375px and 1280px — 586
controls, 10/10 passing.

Building it was a lesson in what a target check has to know before it is worth
running. The first version failed all eight cases, and **every failure was
wrong**:

- The four source radios on `/log` are 16px inputs — inside 44px `<label>`
  elements that activate them. Measuring the input instead of its label
  condemned controls that were built correctly.
- The footer's "OpenStreetMap" and "Open Database Licence" links sit inside a
  sentence about licensing. WCAG 2.5.5 and 2.5.8 both carve out an explicit
  exception for links inline in prose, because a 44px box cannot be put around
  a word mid-sentence without wrecking the line.

Both corrections are now in the measurement, along with the ::after overlay
case. The exemption is deliberately narrow — *links in flowing text*, not
anything styled to look like one, which is why "Change location" was fixed
rather than excused by it.

A check that fails on correct code teaches people to ignore it, and being
ignored is exactly how a real 20px button survived this long. So the outcome
of this sweep is: one genuine defect (fixed above), zero others across the
app, and a regression guard that can be trusted the next time it goes red.

## Keyboard navigation

`%TEMP%/playwright-test-keyboard.js` walks the app with Tab alone — skip
link, focus order, focus rings, and the submit dialog's trap and restoration.
**13/13, no app defects.** The skip link is the first stop and moves past the
header; all 14 landing-page stops are labelled and ringed; the dialog takes
focus on open, keeps the background unreachable, closes on Escape and hands
focus back to the button that opened it.

Both initial failures were the *test* being wrong, which is worth recording
because each is a trap that would have caused a bogus "fix":

- **"Focus jumps back up the page."** It measured `getBoundingClientRect().y`,
  which is viewport-relative. The page scrolls as focus advances, so elements
  further down report *smaller* y values and every stop after the first scroll
  looks like a backwards jump. Fixed by adding `window.scrollY` for document
  coordinates — and by excusing an upward move that also moves right, since
  that is just the top of the next column.
- **"Focus escapes the dialog after 4 tabs."** Instrumenting the actual cycle
  showed: price → radios → Log → Cancel → `document.body` for exactly one tab
  → back to the dialog's close button. That single body frame is normal
  `showModal()` wrap-around; the background is inert and the dialog stays
  `:modal` throughout. The assertion "focus is always inside" fails a correct
  dialog; the right assertion is "focus never reaches a control *behind* it".

That is two sweeps running where the new check was wrong and the app was
right. Both were caught by instrumenting the failure before touching source —
the cheaper habit by a wide margin, since "fixing" either would have meant
editing working code to satisfy a broken measurement.

## Screen-reader semantics

`%TEMP%/playwright-test-semantics.js` — **45/45, clean on the first run**, no
false positives and no defects. Landmarks, heading hierarchy, live regions,
list and table structure across `/`, `/about`, `/map` (gated and loaded),
`/log` and a store page.

The gap it fills is specific. The phase suites run axe with the `wcag2a` and
`wcag2aa` tags, and axe's structural rules — `heading-order`,
`landmark-one-main`, `landmark-unique`, `region` — are tagged
**best-practice**, outside both. So a skipped heading level, a second
`<main>`, or content stranded outside any landmark would have passed every
accessibility check the app had. This runs that tier explicitly, plus
structure axe does not judge: exactly one h1 per page, documents starting at
h1 rather than h2, lists containing only `<li>`, tables having header cells,
and live regions being mounted *before* they have anything to say — a region
created at the moment of the message is never announced, because screen
readers watch nodes that already exist.

The app was already right on all of it, including the subtle one: `/log`
mounts two `role="status"` regions up front, both polite, neither assertive.

## The contrast work had a hole underneath it

`scripts/check-contrast.mjs` verifies 22 colour pairs against the palette as
authored. Nothing guaranteed users saw that palette: `color-scheme` was never
declared, and an undeclared scheme is exactly what lets **Chrome on Android
apply its Auto Dark Theme**, inverting a light page wholesale for anyone whose
phone is in dark mode. Every ratio the script proves would then be measured
against a design nobody was looking at.

`color-scheme: light` is now declared on `html`. It is the honest declaration
rather than a new decision — `globals.css` already opens by committing to "a
single light treatment... a dark variant would be a second design, not a
toggle". It also pins natively-rendered controls (radios, scrollbars) to the
light rendering the rest of the design assumes.

Scope stated honestly: **auto-darkening could not be reproduced in this
browser.** Emulating OS dark showed `color-scheme: normal` still rendering
the page light, with every control explicitly styled by the app anyway. The
fix targets a platform behaviour this desktop browser does not exhibit, and
is a one-line declaration that changes nothing for anyone else — verified by
re-running contrast (22/22), the three accessibility sweeps (68) and the
motion/hardening suite (37) after the change.

Dark mode itself was **not** added. The palette is a deliberate print-derived
choice and a dark variant is a design decision belonging to the owner, not a
defect to fix in an audit.

## An unauthenticated endpoint that spent money

`POST /api/stores/[id]/recompute` is deliberately open, and its comment
argued the case: it takes only a store id, the answer is derived from
submissions that already exist, so "the worst an abuser achieves is making us
do arithmetic." Right about integrity, incomplete about cost. Every call read
the store plus all its submissions **and committed a write unconditionally**,
even when the recomputed rollup was identical to the stored one. On a billed
Firestore that turns a public URL into a way to spend someone else's money,
one guaranteed write at a time.

`recomputeStoreRollup` now compares the derived rollup against what is stored
and returns early when nothing differs, so a repeat call costs reads only.
This is not a behaviour change — the function already promised that running
it twice produces the same answer, and this makes the second run act like it.

Proven rather than asserted: two integration tests use the document's
Firestore `updateTime`, which moves if and only if a write actually happened.
A no-op recompute leaves it identical; a recompute after a real new
submission moves it and the price updates. 166 emulated tests green.

## A test suite that was poisoning its own fixtures

Phase 4 failed four checks immediately after the change above, which looked
like a regression and was not. Its "unmeasured" fixture — `node-8372094803`,
commented "no prices at all" — had a $2.89 price and one submission, written
earlier in this same session by the `/log` bulk-run suite, which logs prices
to whatever stores sit nearest Coppell.

All the browser suites share one emulator and write to it, so hardcoded
fixture ids decay as soon as another suite runs. The fix is for the suite to
ask the database which store is currently unmeasured instead of pinning an
id, and to fail with a clear message if the seed no longer contains one.
Phase 4 is back to 77/77 and now survives its neighbours.

**Then the same fix, applied before the next one broke.** Auditing the
remaining pinned ids showed the risk is not uniform, and the distinction is
what matters: suites only ever *add* prices, so a fixture defined by
*presence* ("many reports", "an established price") stays true forever, while
one defined by *absence* is a single write from false. Two more were in that
category — `STALE` ("newest price ~120 days old") and `SINGLE` ("exactly one
price"). Both still held when checked, and both would have broken the first
time `/log` happened to reach them.

All three absence-defined fixtures are now looked up at run time; the two
presence-defined ones stay pinned, because pinning them costs nothing. The
run confirms the point — successive runs bind the unmeasured fixture to
different stores (`way-643448995`, then `way-666746636`) and pass either way.
`RICH`'s comment also claimed "21 reports, 17 counted" against a real 28/24,
so it now describes the property being exercised rather than a count that
drifts.

Worth noting the near-miss: the obvious reading was "my recompute change broke
the store page". Checking the fixture's actual data first — one query — is
what separated a data problem from a code problem.

## Bundle weight — measured, one finding, no fix applied

Measured against a real production build (`next build` + `next start`), not
the dev server, because dev bundles are unminified and carry HMR:

| route        | JS     | fonts | total  |
|--------------|--------|-------|--------|
| `/`          | 330 KB | 96 KB | 467 KB |
| `/about`     | 329 KB | 96 KB | 463 KB |
| `/map` gate  | 442 KB | 96 KB | 580 KB |
| `/log` gate  | 442 KB | 96 KB | 584 KB |
| `/map` loaded| —      | —     | 660 KB |

Leaflet and Recharts are correctly absent from the landing page — the dynamic
imports work, and the +112 KB on `/map` is Leaflet arriving where it is used.

**The finding:** roughly 180 KB of the landing page's 330 KB is the Firebase
browser SDK — app, auth, firestore, App Check — shipped to a page that reads
nothing from the client. `FirebaseBoot` sits in the root layout, so it reaches
every route.

**The fix that did not work, recorded so nobody repeats it.** Converting the
static import to a dynamic `import()` inside the effect looked obviously
right and changed nothing: measured at DOMContentLoaded rather than
networkidle — networkidle waits for lazy chunks too and so cannot tell a
code-split from a no-op — all 330 KB still arrived within 300 ms, with *no*
chunk starting late. Next preloads its chunk graph. The change was reverted
rather than kept, because indirection that buys nothing is worse than the
plain import, and the comment justifying it would have been a claim already
disproved.

The only fix that would move bytes is not mounting `FirebaseBoot` on routes
that cannot write. That trades away having an App Check token ready before
the user reaches a form, so it is a decision about security posture and
first-submission latency — the owner's call, not an audit's.

## Deployment readiness

**A stale Firestore index survived the set-price rename.**
`firestore.indexes.json` declared `stores (geohash ASC, medianPriceCents ASC)`
— and `medianPriceCents` was the *last* reference to the old field name
anywhere in the repo. Nothing local caught it because the emulator does not
enforce index requirements at all, so this class of drift is invisible until
production. That index was also unnecessary: every query the app makes is
served by automatic single-field indexes. It is gone, and the reasoning is
written down in the README so the next rename knows to look here.

**A production deploy could authenticate against the demo project.**
`FIREBASE_PROJECT_ID` defaulted to `demo-sandwich-index`. Supplying real
Admin credentials while forgetting that one variable would have produced an
opaque authentication failure against a project that does not exist. The
Admin SDK now refuses to start in that combination and says which variable is
missing. `src/lib/firebase/admin.ts`.

**Two undocumented environment variables.** `NEXT_PUBLIC_SITE_URL` (unset in
production means `robots.txt` and `sitemap.xml` advertise localhost to
crawlers) and `NEXT_DIST_DIR`. Both now in the README table and the example
env file, along with a pre-flight checklist covering the five things that
have to happen before a first deploy.

## Infrastructure bugs found and fixed

**The test suites were deleting the development database.** Two independent
causes, both silent — every test passed while the data vanished:

1. `npm test` included `tests/integration`, whose `clearFirestore()` wipes
   every document, wired to the dev emulator on 8080.
2. `tests/rules` hardcoded `port: 8080` inside `initializeTestEnvironment`,
   so even running under `emulators:exec` on the throwaway instance, its
   33 per-test clears hit the dev database.

Now: `npm test` is unit-only and touches no emulator; `test:emulated` and
`test:rules` boot their own Firestore on 8085 via the committed
`firebase.itest.json`; `vitest.config.mts` points at 8085 so a stray run
fails loudly rather than reaching for dev data; the rules suite derives its
port from the environment like the integration helper already did.

**Overpass seeding was blocked.** Both configured mirrors were faulting
(HTTP 406 / timeout). Added VK's `maps.mail.ru` instance after verifying it
by *payload* — 88 elements for the DFW query — rather than by status code,
which is the rule that already exists in that file because a Switzerland-only
mirror once answered a Texas query with a cheerful empty 200.

## Coverage gap closed

**Corroboration had no integration test.** The promotion path — a held report
becomes the price once a second one lands within 5% — was covered only as a
pure function. That leaves the riskiest half untested: `reconcile` returns
indices into the submission list *as fetched* (newest first) while it walks
the reports *oldest first*, and the recompute uses those indices to rewrite
the status of specific documents. The pure function can be perfectly correct
while the write-back rewrites the wrong rows, and nothing would have caught
it. Three integration tests now cover promotion (both submissions become
`accepted` and the price moves), an uncorroborated outlier staying `pending`
in the database rather than only in the returned rollup, and a held report
being dropped when the price moves for unrelated reasons. The index mapping
was in fact correct — original positions are captured before the sort — but
that is now a verified property rather than a reading of the code.

A fourth test covers the batch's odd corner: when both outliers arrive
claiming `accepted` (what a client that guessed wrong sends), one replay
settles the first to `pending` and then promotes it back, so `changed` holds
two entries for the *same* document and the batch writes it twice. Firestore
applies them in order and the last wins, but "the corroboration path throws
whenever the reports arrive this way" is not something to leave to inference.
The test also re-runs the replay to prove it settles rather than oscillates
between the statuses it just wrote.

## Documentation that had stopped being true

The set-price refactor renamed the code but left the README describing the
median model in the places where accuracy matters most.

**The abuse section overclaimed.** It still implied the price is protected by
arithmetic robustness. It is not, and the change is material: under a median,
one false report among ten barely moved the number; under set-price, the
newest report that clears the gate *becomes* the price, so a single plausible
lie moves a store's displayed price outright — up to 40% of it, once per day,
from one device — and two reports that agree can move it arbitrarily far,
where "two reports" means two anonymous identities, which is a browser profile
apart. That is the deliberate cost of never showing a midpoint nobody was
charged, and it is now written down as such rather than glossed. What holds
the numbers up is correctability, not robustness: a wiki, not a poll.

**Stale specifics**: the test tables cited 152 tests and described "median
arithmetic"; the agreement note pointed at `src/lib/median.ts`, a file that no
longer exists; the store page was described as showing "the median"; the chart
plotted "median-eligible" submissions; the offline note predicted status
"against a median". All corrected against the code, including confirming
`AREA_RADIUS_MILES = 10` and `AREA_MIN_PEERS = 3` still match the prose.

The area comparison genuinely is still a median and stays one — it summarises
*across restaurants*, where a midpoint fairly describes a market, rather than
across reports about one restaurant, where it described nothing anybody paid.
That distinction is now stated where a reader will hit it.

**The same drift ran through the code comments**, across 15 files. This
codebase explains *why* rather than *what*, so a comment describing a deleted
model is worse than no comment — it is confident and wrong. Two were doing
real damage: `firebase/client.ts` repeated the abuse overclaim verbatim ("the
median is what actually protects the numbers"), and `comparison.ts` opened by
stating "a store no longer has a median" and then named its own parameter
`storeMedianCents`. Both fixed, along with stale references in the tiers,
confidence, sparkline, chart, submission-log, offline-notice, history-route,
admin-SDK and store-page headers. User-facing copy was checked and was already
correct throughout — the drift was entirely in comments and one parameter
name. Every surviving mention of "median" is now either the area comparison,
which is genuinely one, or a deliberate before/after contrast.

## Verification state

490 checks green: 100 unit, 33 rules, 31 integration, and the Playwright
suites (phase 1: 16, phase 3: 32, phase 4: 77, phase 5: 51, phase 6: 37,
`/log`: 36, hydration: 9, tap targets: 10, keyboard: 13, semantics: 45).
Contrast 22/22. `next build` compiles every route.

The three accessibility sweeps are new in this session and now live in
`tests/browser/`, run by `npm run test:a11y` against a dev server on :3000.
They were written to `%TEMP%` like the phase suites and then moved in,
because they are the only coverage of tap targets outside `/log`, of keyboard
navigation at all, and of axe's best-practice tier — losing them to a machine
wipe would silently undo this session's accessibility work. The `axe-core`
path is resolved through `require.resolve` rather than hardcoded, so nothing
is pinned to one home directory.

**All ten browser suites now live in `tests/browser/`** (`npm run
test:browser` and `npm run test:a11y`), 268 checks that previously existed
only as scratch files in `%TEMP%` — one machine wipe from gone, including
everything proving the write path and the pricing model work in a real
browser.

Moving them meant removing what pinned them to one desktop:

- `axe-core` was read from a hardcoded
  `C:\Users\Vyom\...\node_modules\axe-core\axe.min.js`; now `require.resolve`.
- Screenshots wrote to `/tmp`, which **Node resolves to `C:\tmp`** on this
  machine while Git Bash resolves it somewhere else entirely — so every
  screenshot the suites produced was being written somewhere nobody looks.
  They now land in `tests/browser/screenshots/` (gitignored), and that was
  verified by finding the four files there after a run rather than assuming.
- Two dead `PROJECT` constants still holding the absolute home path were
  deleted.

A `.claude/launch.json` was added so the dev server starts by name rather
than by remembering the command.

**The move broke `npm run lint`, which had been clean.** Bringing the suites
inside the repo brought them under an ESLint config written for TypeScript
ESM application code, and they are CommonJS Node scripts — every
`require('playwright')` became a `no-require-imports` error. Fixed with an
override scoped to `tests/browser/**/*.js` rather than by relaxing the rule
globally, so app code keeps the stricter setting. Worth stating plainly: this
was a regression I introduced, caught only because the verification sweep
runs lint rather than assuming it.

Three warnings surfaced with it, all genuine dead code:
`tests/browser/logrun.js` still carried `setAddress` and
`pickPricedStoreNearCoppell` — helpers for an emulator fixture that mutated
the developer's browsable store data, an approach abandoned earlier in the
session. One of them still read `medianPriceCents`, a field deleted in the
set-price refactor. Both removed, with a note left explaining why the suite
skips the unmatchable-row case honestly instead of manufacturing it.

Five Playwright failures during this session were **stale harness
assertions, not app bugs**, and are recorded here so they are not
re-diagnosed: the map panel orders by distance (it once ranked by median);
the store page says "current price" and "price from now on" (it once said
median); the page title grew a descriptive tail; and the outlier test used a
fixed $5.99 that corroborated the previous run's held $5.99 — promoting both
to accepted, which is the corroboration model working correctly. That test
now computes a price relative to the store's current and held values.

## Known non-issues

- Two "Terminal A, DFW Airport" stores are >120 m apart and appear to be
  genuinely separate food-court locations. Left alone.
- Unauthenticated REST reads of `syncLog` return PERMISSION_DENIED. That is
  the security rules working; count via the Admin SDK.
- `firebase emulators:exec` leaks its Java process on this machine after
  SIGINT. Check `netstat -ano | grep 8085` and kill the orphan, or the next
  run dies with "port taken".

## README numeric-claim audit (2026-08-11)

Every number the README asserts about behaviour was checked against source
rather than trusted. Verified correct: the 100–1500 cent range
(`money.ts:10,12`), the 24-hour rate limit (`firestore.rules:105`), the
90-day staleness window (`types/index.ts:127`), the 30-day reverse-geocode
cache (`reverse-geocode.ts:31`), the 40% move gate, the 5% corroboration
band, and the motion budget — `--duration-ui` 200ms against
`--duration-ui-exit` 160ms is exactly the "about 20% faster" the prose
claims, and only `--duration-hero` exceeds 300ms, which is not product UI.

Two things were wrong.

**The cross-check claim was false.** The README said `pricing.ts` and
`firestore.rules` "are asserted against the same boundary values (127 cents
from a 319 price is inside the band; 128 is outside)". Only the rules suite
used 319. The unit suite tested the gate at a base of 300, where 40% is
exactly 120 — an integer threshold that a float implementation gets right by
accident. Nothing in the unit suite exercised a fractional threshold, so the
two implementations were both tested but never checked against each other at
the point where they could actually diverge. Fixed by making the claim true
rather than softening it: `tests/unit/pricing.test.ts` now asserts 319±127
inside and 319±128 outside, the same values the rules suite uses.

**The two test-count tables disagreed with each other.** The summary table
said `tests/integration` = 33; the testing-section table said 30, and its
"163 tests across three suites" header had been computed from the stale
number. An emulated run settled it at 66 for rules+integration, i.e. 33 each.
Both tables and both totals now reconcile: 493 overall, 167 across the three
non-browser suites, and the summary table sums to its own stated figure.

## Environment note — disk exhaustion

Mid-audit, three README edits failed with `ENOSPC`. C: was at 0 bytes free of
477 GB. Not caused by this project: `Downloads` is 190 GB and `AppData` 90 GB,
against ~5 GB for `.next`, `node_modules`, the Playwright browsers and the
emulator jars combined. Deleting npm's `_cacache` (content-addressable and
fully regenerable — `npm cache clean` itself could not run, as it needs free
space to work) reclaimed 1.23 GB, which was enough to finish.

Free space then recovered on its own to 69 GB within minutes, without any
further deletion on my part — almost certainly Windows Storage Sense firing
on the zero-space condition. So this is not currently blocking anything. It
is recorded because the machine reached genuine exhaustion once during a
routine session, and the headroom that absorbed it is automatic cleanup
rather than actual free capacity. Worth the owner's attention before the next
long run; the 190 GB in `Downloads` is where the space actually is, and that
is theirs to triage, not mine.

## API boundary audit (2026-08-11)

The five route handlers were probed with deliberately hostile query strings
rather than read for plausibility. Thirteen cases against `/api/stores` and
eleven against `/api/geocode`, `/history` and `/recompute`.

**One real bug: whitespace coordinates reached the Gulf of Guinea.**
`?lat=%20%20&lng=-96.99` answered **200 with an empty list**. The
`coordinate()` preprocessor in `validation.ts` mapped `null` and `""` to
undefined so zod's required check could fire — the doc comment says so
explicitly, and names Null Island as the failure it prevents. But `""` is not
the only spelling of absent: `Number("")`, `Number(" ")` and `Number("\t\n")`
are all `0`, so any whitespace-only value slipped past the guard, became
latitude 0, and produced a cheerful empty result from the Atlantic instead of
a 400. The guard was written against one symptom rather than the coercion
rule underneath it. Now trims before the emptiness test, via a shared
`blankToUndefined` also used by `radiusMilesSchema`.

Worth being precise about severity: no shipped client sends whitespace here,
so this was hardening rather than a live outage. What makes it worth fixing
is that the code documented an intent it did not achieve, which is the kind
of gap that survives review indefinitely.

**Everything else held.** Missing, empty, `abc`, `Infinity`, out-of-range and
oversized-radius inputs all 400. `?lat=0x20` returns 200, which is correct
rather than a leak — that is 32, a real latitude, and `count=0` is honest.
`zipSchema` was never exposed to the same bug because it trims before its
regex. Store ids reject path traversal (`..%2F..%2Fstores` → 400) and unknown
ids 404 rather than 500.

`tests/unit/validation.test.ts` is new — 17 cases, and the first coverage
these schemas have had. It asserts every spelling of blank is refused while a
genuine `lat=0, lng=0` still parses, since the guard must reject absence, not
the value. Unit suite 118, total 510.


---

# 2026-10-11 — audit after the move to `C:\dev`, then the price-feed build

The project moved out of OneDrive (the old copy no longer exists) and gained a
git repo: one commit, private remote. A full audit came first. The owner then
asked for accurate prices that do not depend on visitors, which is the
research in `price-sources.md` and the provenance build below.

## Security: `next` was pinned to a version with nine advisories

`package.json` pinned `next` to exactly `16.3.0`, the create-next-app default,
so no routine update ever moved it. `npm audit` listed nine advisories against
it, one critical: "Unauthenticated Remote Code Execution on Windows-hosted
servers" (GHSA-p293-qw3h-jr36, fixed in 16.3.3). This machine is Windows, and
`next dev` binds `0.0.0.0` and `[::]`. It announced itself on the LAN at
`192.168.75.1:3000` during the audit. Whether that advisory covers dev mode
was not established, so it was treated as exposed.

Fixed by pinning `16.3.8`, the patch release that clears all nine, rather
than `16.4.0`, which would also have brought in a minor version's new
behaviour. `eslint-config-next` was moved to match. `npm audit fix` (no
`--force`) took the rest of the transitive issues: 46 findings with 2 critical
became 20 with none. Production dependencies went from 15 to 4.

The four left are one chain. `firebase` pins `@grpc/grpc-js ~1.9.0`, and no
patched 1.9.x exists. The advisories concern grpc *servers* (mTLS auth context,
server error messages), and this app is only ever a grpc client; in the
browser, Firestore does not use grpc at all. Forcing 1.14 under Firebase
would be an untested override of its internals, so it was left alone, with the
reason recorded here.

## The sync gate covered a fraction of the area it vouched for

`syncAreaIfStale` keyed freshness on a precision-4 geohash cell, and its
comment called that "comparable to a 15-mile search radius". It isn't. The
Coppell cell measures 19.5 x 32.8 km; a 15-mile circle is about 48 km across.
Two visitors in one cell can stand 37.9 km apart. A sync centred on the first
of them covers 11.5% of the second visitor's search area. That was computed by
Monte Carlo and then checked by hand with the circle-intersection formula. The
gate then told the second visitor the area was fresh for seven days.

Two further problems were in the same function. It ignored the radius, so one
request with `radiusMiles=0.1` marked a whole cell as synced for a week while
fetching almost nothing. And nothing limited how many Overpass queries the
unauthenticated route could cause in total, so posting a new cell's
coordinates every second would have made this server an amplifier aimed at
donated infrastructure.

Fixed:

- Each sync now fetches around the cell's centre, out to the radius plus the
  cell's half-diagonal (`cellCoverage`, 43.2 km for 15 miles at DFW). The unit
  tests sample random points at four latitudes, including Anchorage and
  Ushuaia where the corners are least symmetric, to prove every point in the
  cell gets its whole circle.
- `syncLog` records `coverageMeters`, and a cell only counts as fresh if its
  last sync reached at least as far as the request needs. Entries written
  before this count as covering nothing and re-sync once.
- A site-wide budget of 60 Overpass queries an hour, kept in a Firestore
  transaction. Past it, the route answers 429 with `Retry-After`. A query is
  spent even when Overpass then fails, because the failed request still landed
  on someone's server.

Verified against real Overpass, not only the tests. The first call hit all
three mirrors failing (406 / 500 / 504, the flakiness already on record from
August); it returned 503 and, correctly, did not mark the cell synced. The
next call, from the opposite corner, synced the whole coverage (222 stores).
A call from the first corner then got a cached answer.

## The dev snapshot was half-migrated, so every price check failed on a fresh start

`.emulator-data` still held the 15 seeded stores in the *median* model:
`medianPriceCents`, `priceCount` and `latestPriceCents`, with no set-price
rollup. Every price-dependent browser check failed against it. The failures
were in the data, not the app: on a clean start the map showed 83 stores and
zero prices.

The repair path already existed: `POST /api/stores/{id}/recompute` derives the
rollup from submissions. Running it on all 15 migrated them cleanly. The new
set prices sit within a few cents of the old medians, as they should, and one
store correctly shows a held $8.65 outlier. The dead median fields were
removed. Two never-priced stores were missing rollup fields altogether, which
the rules tolerate (`data.get('priceCents', null)`), but they now carry the
same zeroed fields as every other store.

The snapshot was then exported with `firebase emulators:export` *before* any
test ran, so it holds the migration and nothing else. The pre-migration copy
went to the session scratchpad, which does not outlive the session. That is
acceptable because the migration is derived and repeatable, but it means the
old snapshot is gone.

## `map-race.js` depended on data the seed never creates

The stale-load race suite from 2026-08-11 used Los Angeles as its second
location. LA had been synced by hand on 2026-08-10, so the suite passed then
and timed out on any fresh setup. It was also missing from every npm script
and from the README's counts, so nothing ran it. It now serves the second
location as a fixture (real DFW records with new ids, moved to LA), which
makes "no store from the abandoned location is on screen" a meaningful check.
It is wired into `test:browser`. A scratch copy was run first to confirm the
race guard itself still holds: 7/7.

## The leaked emulator is now cleaned up by the project, not by hand

`firebase emulators:exec` on Windows leaves the Firestore Java process on 8085
after every `test:emulated` and `test:rules` run, and the next run dies with
"port taken". It leaked three times in this session alone.
`scripts/stop-test-emulator.mjs` now runs as `pre` and `post` hooks on both
scripts. It only touches a process that listens on the *test* port read from
`firebase.itest.json`, so never the dev emulator, and whose command line says
`cloud-firestore-emulator`. The `pre` hook matters because npm skips `post`
hooks when tests fail.

## Price feeds: provenance before any feed

Research concluded that no free, automated, per-store, usable source exists
(see `price-sources.md`). What was built is the part every option needs:

- An `observations` collection, kept apart from `submissions`: public read,
  Admin SDK write.
- `priceFeed` on every store.
- A feed registry with a `licence` field.
- A replay that merges observations into the set-price timeline. An
  observation is never held, can corroborate a held report, and never counts
  toward `confirmedCount`.
- An import script that dry-runs by default and refuses to write an
  unlicensed feed anywhere but the emulator.
- Provenance on every surface that shows a price.

Site copy promising "every price was paid by a person" is keyed off whether
any feed is licensed.

End to end on the emulator: the August sample file matched 4 of 4 priced rows
against 222 stores, with nothing ambiguous. A second import wrote nothing,
and re-imports never refresh `importedAt`. Pointing `--write` at a non-demo
project id refused before touching the database. Coppell now shows "$2.49 ·
from MenuPriceTracker · observed 2 months ago", with a link to the source.

## Noticed, not changed

- The seed's synthetic prices average about $3.46 around Coppell, roughly a
  dollar above the $1.99 to $2.59 MenuPriceTracker reports for the same area.
  It's synthetic by design, but a dev demo now shows a real feed price as
  "28% cheaper than the area". Several browser suites pin the seed's values,
  so recalibrating it is its own change.
- MenuPriceTracker's trustworthiness went *down* on re-inspection: dates
  contradict each other across its own pages. See `price-sources.md`.

## Second sweep: accurate prices that need nothing from the owner

The owner asked for accurate prices without any work on their side.
`price-sources.md` now scores 21 candidates on five tests. Nothing passes in
practice. Open Prices passes on paper but has no US McDonald's data and
cannot name a McChicken. No price code was written, and the reasons are
recorded there. A Flickr API-key draft joined `feed-outreach.md` as a "needs
owner" item with a low expected yield.

The app itself needed no fixes. With the dev emulator started from the
snapshot (no export on exit) and `next dev` on port 3000, every check passed:
lint, typecheck, `npm test` (152), `test:emulated` (235: unit, rules and
integration), `test:rules` (37), `next build`, `test:browser` (265),
`test:a11y` (68) and `check:contrast` (22 pairs). That is the README's 568,
unchanged.

## MenuPriceTracker in use; visitors log what they see

The owner chose to show MenuPriceTracker's prices now, without a licence, while
the licensing email is outstanding. The site also now asks visitors for the
price they paid *or saw*, not only a receipt.

- **Copy that would have become false.** The landing page promised "Nothing is
  scraped, no corporate feed is read", and the footer, about page and metadata
  said every price was paid by a person. All of it was keyed off "a feed is
  licensed", which stays false. It is now keyed off `HAS_ACTIVE_FEED`: a licence
  *or* the owner's dated `unlicensedUse`.
- **Dates.** MenuPriceTracker's store pages give a month, and the footer date is
  site-wide. Showing either as "observed" would overstate it, so its prices are
  dated by when the page was read, and say "checked" (`dateVerb`).
- **Two changes stopped by the coding agent's safety check.** Opening the import
  script's guard to `unlicensedUse`, and running the real fetch. Both were left
  as they are. Production imports and a live fetch wait for the owner.

Checks after the change: lint, typecheck and build clean; `npm test` 172,
`test:emulated` 255, `test:rules` 37, `test:browser` 265, `test:a11y` 68. That
makes 588.

## Design pass, site header, clay scenes, and the first real MenuPriceTracker run

- **No way back to the landing page.** Once a visitor went to `/map` there was
  no link home. Every page now has a header with the wordmark (linking to `/`)
  and Map, Log prices and About the data, the current one marked with
  `aria-current="page"`. `tests/browser/nav.js` (32 checks) walks it.
- **Three clay scenes on the landing page**: the kitchen line, headquarters,
  and somebody logging a price. They share one stage (`scenes/stage.ts`), load
  three.js only on `/`, and hold a still frame under reduced motion.
  `tests/browser/scenes.js` (30 checks) replaced `kitchen.js`. On review, the
  logging scene's phone text was wider than its screen and the flying price
  card crossed the menu board in the still frame. The phone is now larger, its
  lines fit, and the card takes a flatter path between the board and the map.
- **MenuPriceTracker, run for real (2026-10-12).** 197 store pages read at the
  10-second crawl delay robots.txt asks for, all 197 with a McChicken price,
  all 197 matched to exactly one store. They were imported into a clean copy of
  the emulator data, which was then saved.
- **What the import broke, and the fixes.** Three checks failed against the new
  data, and none of them was a code bug:
  - Phase 3 found no stale store. The seed's stale stores are on
    MenuPriceTracker, so they now have fresh prices. `npm run seed:stale` gives
    two unpriced stores an old, invented history, emulator only, and never
    touches a store with a price.
  - Phase 4's pinned "long visitor history" store now shows the feed's price.
    It and the outlier target are now looked up at run time among stores with
    no feed price.
  - Phase 5 rejected rank "201". Ranks are padded to two digits and there are
    now more than 99 priced stores; the check accepts three digits.
- **Still open:** the saved data ages. The visitor prices phase 4 relies on go
  stale between 2026-10-17 and 2026-10-31 (see README, MenuPriceTracker).

Checks after the change: lint, typecheck and build clean; `npm test` 172,
`test:emulated` 255 (including rules and integration), `test:rules` 37,
`test:browser` 327, `test:a11y` 68, `check:contrast` 22 pairs. That makes the
README's 650.
