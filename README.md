# Sandwich Index

A price index for the McChicken, store by store.

McDonald's locations in the US are mostly franchisee-owned, and franchisees set
their own menu prices. Two stores four miles apart can differ by more than a
dollar for an identical sandwich. Nobody publishes that data. This builds it
from two kinds of evidence, always labelled apart: prices visitors logged from
a receipt, a menu board or the app, and dated prices from outside price feeds.
One feed is in use: MenuPriceTracker, shown under its own name with a link to
its page, by the owner's decision of 2026-10-11 while a licensing request is
outstanding. See [Price feeds](#price-feeds).

> Sandwich Index is not affiliated with, endorsed by, or sponsored by
> McDonald's Corporation. "McDonald's" and "McChicken" are trademarks of
> McDonald's Corporation, used here only to describe the product being tracked.
>
> **Nothing in this codebase makes a request to a McDonald's-owned domain.**
> Store locations come from OpenStreetMap; prices come from contributors and
> from price feeds named beside every figure they supply.

---

## Status

| Phase | Scope | State |
| --- | --- | --- |
| 1 | Foundation: scaffold, types, money, pricing, security rules, tokens, layout | Done |
| 2 | Data layer: Overpass sync, submission write path, price recompute, seed | Done |
| 3 | Map view: Leaflet, geolocation + ZIP fallback, markers, side panel | Done |
| 4 | Store detail: price history chart, comparison strip, full log, submit modal | Done |
| 5 | Landing page: live hero figure, leaderboards, editorial treatment | Done |
| 6 | Polish: motion sweep, axe audit, error/empty states, offline | Done |
| 7 | Price feeds: provenance, feed registry, import pipeline, labelled UI, MenuPriceTracker reader | Built; MenuPriceTracker in use, unlicensed |
| 8 | Design pass: three clay 3D scenes on the landing page, a site header, copy edit across the site | Done |
| 9 | Reading a price from a photo: on-device OCR of receipts and app screenshots, store numbers | Built; tested on mock photos only |

All nine phases are built. Three items are open:

- **A licence for MenuPriceTracker**, or its answer. The request bounced on
  2026-10-12: their mail server refuses all inbound mail, and the site lists
  no other contact (`research/feed-outreach.md`). Nobody there has seen it.
- **[Deployment](#deployment)** needs a Firebase project and credentials.
- **Production imports of MenuPriceTracker.** The import script still refuses
  to write an unlicensed feed anywhere but the local emulator. Opening that
  guard to the owner's recorded decision was attempted on 2026-10-11 and
  stopped by the coding agent's safety check, so it waits for the owner. See
  [MenuPriceTracker](#menupricetracker).

On 2026-10-11, a search for an accurate price source that needs nothing from
the owner found none (see `research/price-sources.md`).

### Test results

| Suite | Count | Runner |
| --- | --- | --- |
| `tests/unit` | 198 | `npm test` |
| `tests/rules` | 37 | `npm run test:emulated` |
| `tests/integration` | 46 | `npm run test:emulated` |
| Phase 1 — foundation | 16 | `npm run test:browser` |
| Phase 3 — map view | 32 | `npm run test:browser` |
| Phase 4 — store detail and submit | 80 | `npm run test:browser` |
| Phase 5 — landing page | 51 | `npm run test:browser` |
| Phase 6 — hardening | 37 | `npm run test:browser` |
| Bulk logging — `/log` | 36 | `npm run test:browser` |
| Hydration | 9 | `npm run test:browser` |
| Stale-load race on `/map` | 7 | `npm run test:browser` |
| Clay scenes on `/` | 30 | `npm run test:browser` |
| Navigation — the site header | 32 | `npm run test:browser` |
| Photo reader — receipts and app screenshots | 19 | `npm run test:browser` |
| Store search on the map | 18 | `npm run test:browser` |
| Tap targets — every route, 2 viewports | 10 | `npm run test:a11y` |
| Keyboard navigation | 13 | `npm run test:a11y` |
| Screen-reader semantics | 45 | `npm run test:a11y` |

716 checks, all passing on 2026-10-12 against `next dev` and the saved
emulator data with all 197 MenuPriceTracker prices loaded; the browser suite
passes twice in a row in one session; the production
`next build` compiles all routes clean.

The last three are accessibility sweeps added after the phase suites, each
covering something the earlier ones could not see. Tap targets were only ever
asserted on `/log`; nothing walked the app by keyboard; and the axe scans run
with `wcag2a`/`wcag2aa` tags, which exclude axe's *best-practice* tier —
`heading-order`, `landmark-one-main`, `region` and friends live outside those
tags, so a skipped heading level or a duplicate `<main>` would have passed
every check the app had.

Every browser suite lives in `tests/browser/` and drives a real browser
against a dev server on port 3000, so `npm run dev` (and the emulator) must
be running first:

```bash
npm run test:browser
```

```bash
npm run test:a11y
```

They were scratch files in `%TEMP%` until 2026-08-10 — 258 checks with no
home, one machine wipe from gone. Moving them in meant removing what pinned
them to one desktop: `axe-core` is now located with `require.resolve` instead
of a hardcoded project path, and screenshots write to
`tests/browser/screenshots/` (gitignored) rather than `/tmp`, which Node
resolves to `C:\tmp` on Windows while Git Bash means something else entirely
— so the screenshots were being written somewhere nobody was looking.

---

## Setup

Requires **Node 20.9+** (built on 24) and **Java** (the Firestore emulator is a
JAR).

```bash
npm install
cp .env.local.example .env.local
```

The defaults in `.env.local.example` run entirely against the Firebase emulator
suite. The project id is `demo-sandwich-index`, and the `demo-` prefix is
load-bearing: Firebase SDKs refuse to contact production for a demo project, so
local work cannot accidentally write to a real database.

### Running

```bash
npm run dev
```

```bash
npm run emulators
```

Run both. The app talks to the emulator whenever
`NEXT_PUBLIC_USE_FIREBASE_EMULATOR=true`.

### Checks

```bash
npm run build
```

```bash
npm run typecheck
```

```bash
npm run check:contrast
```

```bash
npm run lint
```

```bash
npm run test:emulated
```

The last one is the important one — see [Abuse and data quality](#abuse-and-data-quality).
It needs the emulator running.

Browser tests are standalone Playwright scripts in `tests/browser/`, run headed
against a dev server. Each takes `TARGET_URL` from the environment, so a single
suite can be pointed anywhere:

```bash
TARGET_URL=http://localhost:3000 node tests/browser/phase6.js
```

### Seeding local data

With the emulator running, in a second terminal:

```bash
npm run seed
```

This pulls **real** store locations from OpenStreetMap around Coppell, TX and
attaches **synthetic** price history to them. It refuses to run against
anything but the emulator — see [Deployment](#deployment) for why that matters.

`npm run emulators` imports from and exports to `.emulator-data`, so a seeded
database survives a restart. Use `npm run emulators:clean` to start empty, which
is how to see the genuine no-data states.

The seed centres on Coppell, TX by default. Since the app is a national index,
the area is overridable — useful for seeing what a city with no reports yet
actually looks like:

```bash
SEED_LAT=34.0522 SEED_LNG=-118.2437 npm run seed
```

`SEED_RADIUS_MILES` and `SEED_MAX_STORES` move too. Only the coordinates
change; the prices stay synthetic and the emulator-only guard stays absolute.

**The emulator-backed suites run on a throwaway instance.** `tests/integration`
clears Firestore before every test and after the last one — which is why it is
kept away from your data: `npm test` is unit-only and touches no emulator, while
`npm run test:emulated` and `npm run test:rules` boot their own Firestore on
port 8085 (`firebase.itest.json`), wipe *that*, and leave the dev emulator on
8080 — and your seed — alone. If nothing is listening on 8085 those suites fail
loudly rather than reaching for the dev instance.

Seeding needs Overpass, which is donated infrastructure and does go down; the
script fails loudly with "Every Overpass mirror failed" rather than writing a
partial dataset. Wait a minute and run it again.

### A Windows quirk

The Firestore emulator's Java process does not always die when the CLI shuts it
down, which makes the next start fail with "port taken". `firebase
emulators:exec` leaves it behind after *every* run on Windows.

For the test suites this is handled. `test:emulated` and `test:rules` run
`scripts/stop-test-emulator.mjs` before and after, and it stops only a
Firestore emulator listening on the test port from `firebase.itest.json`. The
"before" matters: npm skips `post` hooks when tests fail.

For the dev emulator, clear a leftover by hand:

```bash
powershell -Command "Get-CimInstance Win32_Process -Filter \"Name='java.exe'\" | Where-Object { $_.CommandLine -like '*cloud-firestore-emulator*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"
```

That stops **every** Firestore emulator, the running dev one included, and a
hard kill skips `--export-on-exit`. Anything written since the last export is
lost. Export first if it matters: `npx firebase emulators:export .emulator-data`.

---

## Environment variables

| Variable | Required | Purpose |
| --- | --- | --- |
| `NEXT_PUBLIC_USE_FIREBASE_EMULATOR` | yes | `true` routes the browser SDK to the local emulator. |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | yes | Firebase project id. `demo-` prefix forces emulator-only behaviour. |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | yes | Client SDK key. Any placeholder works against the emulator. |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | yes | Client SDK config. |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | yes | Client SDK config. |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | yes | Client SDK config. |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | yes | Client SDK config. |
| `NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY` | no | reCAPTCHA v3 site key. Unset keeps App Check inert. |
| `FIREBASE_PROJECT_ID` | yes | Admin SDK project id. |
| `FIRESTORE_EMULATOR_HOST` | dev | Presence of this puts the Admin SDK in emulator mode; no credentials needed. |
| `FIREBASE_AUTH_EMULATOR_HOST` | dev | Same, for auth. |
| `FIREBASE_CLIENT_EMAIL` | prod | Service account email. Only when pointing at a real project, and not on App Hosting, where the server's own identity is used. |
| `FIREBASE_PRIVATE_KEY` | prod | Service account key, newlines escaped as `\n`. |
| `OVERPASS_CONTACT_EMAIL` | no | Added to the Overpass `User-Agent` beside the site URL. Overpass is donated infrastructure and asks clients to identify themselves. |
| `NEXT_PUBLIC_SITE_URL` | prod | Canonical origin for `robots.txt` and `sitemap.xml`. Falls back to `http://localhost:3000`, so an unset value in production advertises localhost to crawlers. |
| `NEXT_DIST_DIR` | no | Build output directory. Set it to build while `next dev` is running, so the two do not fight over `.next`. |

### App Check

App Check is wired and inert. `initAppCheck()` runs on every page load from
`src/components/ui/FirebaseBoot.tsx` and returns immediately unless
`NEXT_PUBLIC_FIREBASE_APPCHECK_SITE_KEY` is set — so setting that variable is
the whole of turning enforcement on, with no code change.

It is left unset here because a headless browser cannot solve a reCAPTCHA
challenge, so enabling it against the emulator would break every browser test
and protect nothing. Against a real project, local runs need a debug token:

```js
// in the browser console, before the first Firestore call
self.FIREBASE_APPCHECK_DEBUG_TOKEN = true;
```

Then register the token Firebase logs, in the Firebase console under
App Check → Apps → Manage debug tokens.

---

## The data model

Two collections a client can see, plus one it mostly cannot.

### Money is integer cents. Always.

Never a float, never a string. `src/lib/money.ts` is the only module that
converts cents into a decimal, and only to build a display string. The security
rules enforce `priceCents is int`, so a float submission is rejected by the
database, not just by the form.

### Timestamps

Firestore stores native `Timestamp` values; everything above the converter
boundary uses ISO 8601 strings. This is not stylistic. Security rules compare
against `request.time` and cannot do date arithmetic on a string, so the 24-hour
rate limit would be unenforceable if these were stored as text.

### `stores/{storeId}`

Document id is the OSM element id prefixed with its type, e.g.
`node-1234567890`.

```jsonc
{
  "osmId": "node-1234567890",
  "name": "McDonald's",
  "address": "120 S Denton Tap Rd, Coppell, TX 75019", // nullable — see below
  "locality": "Coppell, TX 75019",  // fallback when there is no street
  "lat": 32.9546,
  "lng": -96.99,
  "geohash": "9vfsz3n",
  "addressCheckedAt": "<Timestamp>", // null until the geocoder has been asked
  "reportCount": 14,         // every report, any source or status
  "confirmedCount": 11,      // only those eligible to set the price
  "priceCents": 319,         // what this store charges. Not an average.
  "heldPriceCents": null,    // a claim awaiting a second opinion
  "pricedAt": "<Timestamp>",
  "priceFeed": null,         // feed id when a feed set the price; null for a visitor
  "lastSyncedAt": "<Timestamp>"
}
```

Two notes on shape:

**`address` is nullable, and there is a ladder behind it.** A share of OSM
entries carry no address tags at all. Those stores are put through a reverse
geocoder (see [Filling in missing addresses](#filling-in-missing-addresses)),
and what is left over falls back to `locality` — a town and a postcode, labelled
as such so it is never mistaken for a street. `lib/store-label.ts` owns that
ladder, and every surface that renders a store's identity goes through it rather
than reaching for `address` directly. `addressCheckedAt` records when the
geocoder was last asked, so a store it genuinely cannot place is not looked up
again on every sync forever.

**`reportCount` and `confirmedCount` are separate on purpose.** Delivery and
held reports cannot set a price, so a single count would make the confidence
display lie — a store with twelve delivery reports and one in-store price would
appear to have twelve prices behind it. `confirmedCount` is what gets shown
next to a price.

**`priceCents` is one number, not a summary.** It is the most recent report
that passed the move gate, or the most recent feed observation if that is
newer. Either way it is a figure somebody actually saw on a menu board, not a
midpoint nobody was ever charged, and `priceFeed` says which kind of evidence
it is so every surface can label it.

Rollup fields are denormalized so the map and list render from one query, and
are written **exclusively by the Admin SDK**. Clients cannot write to `stores`
at all. This is not tidiness: the move gate reads `priceCents` from this
collection, so a client that could edit a store's price could set it to match
their own report and walk anything past the gate.

### `submissions/{submissionId}`

```jsonc
{
  "storeId": "node-1234567890",
  "priceCents": 319,
  "submittedAt": "<Timestamp>", // server clock; clients cannot backdate
  "source": "in_store",         // in_store | drive_thru | app | delivery
  "status": "accepted",         // accepted | pending | rejected
  "flagCount": 0
}
```

Append-only. Updates and deletes are refused by the rules; a correction is a new
submission.

`submittedBy` is deliberately **not** stored. Submissions are publicly readable
so the store page can render its history, and Firestore has no field-level read
security — a UID on a public document would let anyone correlate every
submission from one device. The rate limit does not need it, because ownership
lives in the private ledger below.

`status: "rejected"` and `flagCount` are reserved. Nothing in v1 sets them —
there is no moderation UI yet. They are in the schema so adding one later is not
a migration.

### `observations/{observationId}`

```jsonc
{
  "storeId": "way-30288130",
  "priceCents": 249,
  "observedAt": "<Timestamp>",  // when the FEED saw it, not when we imported it
  "feed": "menupricetracker",   // id from src/lib/feeds.ts
  "sourceUrl": "https://…",     // the feed's own page for this store, or null
  "importedAt": "<Timestamp>"   // first import; re-imports never refresh it
}
```

A price a feed observed, kept apart from `submissions` because the two are
different kinds of claim: a submission is a person vouching for a receipt, an
observation is a third party's record. Merging them would either inflate the
"N prices" a store rests on or hide where a number came from. Document id is
`{feed}_{storeId}_{YYYY-MM-DD}`, so importing the same file twice writes nothing
new. Public read, Admin SDK write only: an observation can set a store's
price, so a client-writable one would skip the move gate entirely.

### `rateLimits/{uid}_{storeId}`

```jsonc
{ "storeId": "node-1234567890", "lastSubmittedAt": "<Timestamp>" }
```

Private to the device that owns it. Exists because **security rules cannot run
queries** — there is no way to ask "what was this device's last submission for
this store?" from a rule. The answer has to live at a path a rule can `get()`
directly, and a deterministic document id is that path.

### Indexes

`firestore.indexes.json` declares one composite index, and that is deliberate —
every query the app makes today is served by Firestore's automatic single-field
indexes:

- the geohash range scan orders by `geohash` and filters on the same field;
- the landing snapshot filters `priceCents > 0` and orders by `priceCents`,
  ascending and descending, which single-field indexes cover in both directions;
- submissions are fetched by `storeId` alone and sorted in memory.

The one declared index — `submissions (storeId ASC, submittedAt DESC)` — is the
access pattern that outgrows the in-memory sort first, so it is kept ready.

**Watch this file during a rename.** The emulator does not enforce index
requirements, so nothing local fails when this drifts. It held a
`stores (geohash, medianPriceCents)` index for a field the set-price refactor
had deleted — the last reference to the old name anywhere in the repo, and one
that a deploy would have happily built against a field that never gets written.

---

## Abuse and data quality

Crowdsourced price data is only worth anything if the numbers survive contact
with people who want to break them. Six mechanisms, all enforced where a client
cannot reach them.

**1. Range validation.** Anything outside 100–1500 cents is rejected. Enforced
in `firestore.rules`, not only in the form. Client-side validation exists to
give honest contributors a fast error message; it stops nobody with a console
open.

**2. Rate limit — one submission per device, per store, per 24 hours.** The
mechanism is worth understanding, because the obvious implementation does not
work. Rules cannot query, so the limit lives in `rateLimits/{uid}_{storeId}`.
But a client could simply write the submission and never stamp the ledger — so
the submission rule uses `getAfter()` to require that both documents land in the
same atomic batch:

```
function ledgerStampedInSameBatch() {
  return getAfter(rateLimitPath(data().storeId)).data.lastSubmittedAt == request.time;
}
```

`lastSubmittedAt == request.time` is what blocks backdating. The value is the
server's clock, not the client's claim. Deleting the ledger is also refused,
since that would reset the window.

**3. Move gate.** A report more than 40% from a store's current price becomes
`pending` instead of `accepted`, and a held report does not change the price.
There is no minimum-sample threshold — a store has a price or it does not.
Status is *derived, not chosen*: the rule computes what the status must be and
rejects any report claiming a different one, including an ordinary price trying
to mark itself pending, which would otherwise let someone keep honest prices
out. The comparison uses integer math (`deviation * 100 > current * 40`) so the
rule and `src/lib/pricing.ts` cannot disagree on a boundary value.

**4. Corroboration.** A held report becomes the price once a second report
lands within 5% of it. Promotion happens server-side in the recompute, never
from a client — it is a judgement about the whole history, not about one write.
This is also what rescues a store whose very first report was a typo: no single
report can beat a wrong price, but two that agree with each other always can.

**5. Staleness.** Prices older than 90 days get a visible stale treatment —
icon plus text label, never colour alone — and drop out of cheapest-nearby
rankings. A store with no prices at all is *unmeasured*, which is a different
state and gets different treatment.

**6. Confidence display.** Every price is shown with the submission count behind
it. A store with one report and a store with thirty must not look equally
authoritative.

### What this does not solve

Anonymous auth means clearing site data mints a fresh UID and resets the rate
limit. App Check raises the cost of scripted abuse but does not close that hole.
The rate limit is friction, not security.

**Showing one real price costs robustness, and the trade is real.** Under the
old median model a single false report among ten barely moved the number.
Under this one the newest report that clears the gate *becomes* the price, so
one plausible-looking lie moves a store's displayed price outright — by up to
40% of it, once per day, from one device. Two reports that agree with each
other can move it arbitrarily far, and "two reports" means two anonymous
identities, which is a browser profile apart.

That is the deliberate cost of never showing a midpoint nobody was ever
charged. What holds the numbers up is not arithmetic robustness but the fact
that a wrong price is visible, attributable to a moment, and correctable by
the next person who walks in. It is a wiki, not a poll — and the honest
summary is that this model trusts its contributors more than the median did,
because the alternative was publishing a number that was never true anywhere.

### Verifying it

The rules are tested directly against the emulator with a raw SDK, the way an
abuser would approach them, rather than through the UI:

```bash
npm run test:emulated
```

**235 tests across three suites:**

| Suite | Count | Covers |
| --- | --- | --- |
| `tests/rules` | 37 | Range boundaries, float and string prices, backdated timestamps, ledger-skipping, cross-device tampering, ledger deletion, move-gate band edges, read visibility, feed observations readable but never client-writable, and the server-only sync log and Overpass budget. |
| `tests/unit` | 198 | Set-price reconciliation, the move gate and corroboration bands, delivery exclusion, staleness vs. unmeasured, cents parsing and formatting, area comparison, OSM twin filtering, address composition and the store-label ladder, query-parameter coercion at the API boundary, feed observations in the replay, feed parsing and store matching, MenuPriceTracker page parsing and robots.txt rules, feed date wording, reading receipts and app screenshots (the plain McChicken only, per-unit price, OCR's colon-for-point), checking a photo's store by restaurant or street number, receipt age, store search (abbreviations, word-start matching, restaurant numbers), and sync-cell coverage at four latitudes. |
| `tests/integration` | 46 | Rollup recomputation, corroboration promotion written through to submission status, idempotency, re-sync not clobbering prices or addresses, geohash proximity, the Overpass sync gate including whole-cell coverage and the radius it reached, the site-wide Overpass budget, feed observations written through to the rollup, the address backfill's cap and retry window, index snapshot including stale exclusion. |

The browser suites attack the same machinery from the outside: Phase 4 submits
a real price and asserts the store's price moved, submits a second one to the
same store and asserts the rate limit refused it, and submits a wildly off
price and asserts it landed as `pending` without changing the price.

The unit suite exists specifically to keep `src/lib/pricing.ts` and
`firestore.rules` in agreement — both implement the same move gate in integer
math, and both are asserted against the same boundary values (127 cents from a
319 price is inside the band; 128 is outside).

---

## Price feeds

Visitors' receipts are accurate but slow: a store has no price until somebody
logs one. The owner asked for accurate prices that don't depend on that.
`research/price-sources.md` has the full survey (2026-10-11). In short:

- **The only primary source is the McDonald's app**, and reading it
  automatically means signing in to a private API whose terms bar automated
  extraction. This project does not do that, and the research explains why it
  is the wrong side of the line courts have drawn.
- **Every per-store alternative is secondhand.** It's either somebody else's
  scrape of that app (MenuPriceTracker, whose freshness dates did not survive
  inspection) or an enterprise data contract (Datassential Price Monitor, RMS
  Competitor Price Intelligence).
- **Delivery menus are not a shortcut.** They run about 27% above in-store
  prices, and the markup varies by franchisee, so it can't be backed out.
- **Nothing accurate is free for the taking.** A second sweep the same day
  scored 21 candidates on five tests: per store, dated, in-store, free to
  republish, and needing nothing from the owner. Only Open Prices (Open Food
  Facts) passes all five, and it has no US McDonald's data and no way to name
  a McChicken, so no importer was written for it.

So the app takes feed data the one way it can take it honestly, as a labelled,
dated observation. On 2026-10-11 the owner chose MenuPriceTracker for now, in
use without a licence while one is requested (see
[MenuPriceTracker](#menupricetracker)). Drafts for the licensing emails, and
what each reply has to settle, are in `research/feed-outreach.md`.

### How a feed price behaves

- **Newest wins, both ways.** A receipt dated after a feed's observation
  replaces it, and a newer observation replaces an older receipt.
- **An observation is never held.** The move gate exists to make one
  unvouched-for visitor prove a big jump; a feed's dated record of the menu is
  not that. A *visitor* report that moves a feed-set price by more than 40% is
  still held, exactly as it would be against a visitor-set price.
- **An observation can be the second opinion.** If a feed sees the price a held
  report claimed (within 5%), the report is promoted, as an agreeing second
  visitor would have done.
- **Observations never count toward `confirmedCount`.** "3 prices" still means
  three people.
- **Staleness is the same 90 days**, measured from the feed price's date, not
  from when it was imported.

Every surface that shows a price says where it came from. The store page reads
"from MenuPriceTracker · checked 2 days ago" with a link to the feed's own
page, and lists every feed price in a table of its own. The verb is the feed's
`dateVerb`: "observed" for a feed that dates each price itself, "checked" for
one, like MenuPriceTracker, whose only honest date is the day we read its page.
Site copy that would otherwise promise "every price was submitted by a person
who saw it" is keyed off `HAS_ACTIVE_FEED` in `src/lib/feeds.ts`, so it
changes by itself when a feed goes in or out of use.

### Importing a feed

```bash
npm run import:observations -- --feed menupricetracker --file research/tracker-samples.json
```

A dry run by default. Every row is printed as `MATCH` (with what we show now
next to what the feed says), `AMBIG`, `MISS`, `SKIP` or `REJECT` before anything
is written; add `--write` to record. Rows are matched on (street number, city),
and `src/lib/feed-match.ts` explains why that key and not the street name. An
undated row, a future date, or a price outside the app's own $1.00–$15.00 range
is rejected rather than guessed at.

**An unlicensed feed never leaves the emulator.** Feeds are declared in
`src/lib/feeds.ts` with a `licence` field, and while it is null `--write`
refuses anything that is not the local emulator. That includes
MenuPriceTracker: its `unlicensedUse` changes what the site says, not what
this script will write.

To add a real feed: get the licence; declare the feed with its name, method and
licence; export its data in the `parseFeedFile` format, with an observation
date on every row; dry-run; spot-check the matches against real receipts; then
write.

### MenuPriceTracker

In use by the owner's decision of 2026-10-11, recorded as `unlicensedUse` in
`src/lib/feeds.ts`. The licensing email in `research/feed-outreach.md`
bounced on 2026-10-12: their domain refuses all inbound mail, and the site
publishes no other contact, so no request is actually pending. If they say no, set `unlicensedUse` to null and the
site's copy reverts by itself; delete the observations to remove the prices.

```bash
npm run fetch:menupricetracker
```

```bash
npm run import:observations -- --feed menupricetracker --file feeds/menupricetracker-YYYY-MM-DD.json --write
```

The fetch reads the stores in whichever Firestore the environment points at,
then reads MenuPriceTracker's public pages for them. It follows the site's
robots.txt: it skips disallowed paths and waits the crawl-delay it asks of
unnamed bots (10 seconds), never less than 10. It fetches one city page per
city we have stores in, and then only the store pages whose street number and
city match one of ours, so about one request per store. Prices come from each
store page's schema.org data, where the item reads exactly "McChicken — $2.49".
A meal or a Spicy McChicken never counts. Output goes to `feeds/`, which is
gitignored, because it is their data, not ours to commit.

The site gives each store a month ("last verified October 2026"), never a day,
and its footer's "Last updated" date is site-wide. So each price is dated by
the moment its page was read, and the UI says "checked", not "observed". The
month the site claims is kept in the file as `listedAs`. Visitors can always
log their own price, and a newer visitor price replaces the feed's.

First full run on 2026-10-12: 197 of our 222 Dallas–Fort Worth stores are on
MenuPriceTracker, and all 197 had a McChicken price ($1.49 to $2.99). Every
row matched exactly one store, and the import recorded 197 observations into
the emulator, which was then saved as `.emulator-data`. The 25 stores it
doesn't list (mostly airport terminals) keep whatever visitors reported. The
parsers are tested against trimmed copies of real pages
(`tests/unit/menupricetracker.test.ts`).

A feed import also erases states the test suites need, and the saved data
ages. `npm run seed:fixtures` keeps both in shape, and runs by itself before
`npm run test:browser`. It is idempotent and emulator-only, and every price
it writes is invented, like the seed's:

- **Stale.** If fewer than two stores within 14 miles of Coppell are stale,
  it gives an old history to the farthest unpriced stores still on the map's
  15-mile view, leaving at least two unpriced. It never touches a priced store.
- **Fresh.** A visitor-priced store (no feed) whose price is 30 to 89 days old
  gets one more report at its current price, dated in the last three days, so
  the "long visitor history" fixtures never turn stale. The price doesn't
  change. On 2026-10-12 that caught the four airport stores at 70 to 84 days.

Phase 4 looks up its "long visitor history" and "established price" stores at
run time, among stores with no feed price. The bulk-logging suite runs in
**Waco**, about 100 miles from Coppell: `/log` lists unpriced stores first,
so wherever it stands it logs prices to the nearest unpriced ones, and in
Coppell those were the stores phase 3 needs unpriced. The saved data holds 13
Waco stores for it, none on MenuPriceTracker. With that, the browser suite
passes twice in a row in one session, which it didn't before.

## Reading a price from a photo

The store page's "Log a price" form has a **Read the price from a photo**
button. A visitor picks a photo of their receipt, or a screenshot of the
McChicken in the McDonald's app with their store selected, and the form fills
in the price for them to check. Those are the two places an exact price
exists: a receipt is what that store charged that day, and the app is what
MenuPriceTracker says it copies. Researched and spiked on 2026-10-12; see
`research/price-sources.md`, "Third sweep".

- **On the device.** [tesseract.js](https://www.npmjs.com/package/tesseract.js)
  7.0.0 reads the photo in a Web Worker (`src/lib/ocr.ts`). The photo is
  never uploaded; only the price the person then logs is sent, exactly as if
  typed, so card digits and order numbers stay on their phone. The browser
  suite checks that no request carries the photo.
- **Loaded on first use, from this site.** `scripts/copy-ocr-assets.mjs` runs
  before `dev` and `build` and copies the worker, the three LSTM engine
  builds (a browser fetches one, about 3.9 MB) and the 2.95 MB English model
  into `public/ocr/`, which is gitignored. None of it is in a page bundle:
  the store page gains a 6 KB chunk that loads when the button is pressed.
- **The parser** (`src/lib/receipt.ts`) takes only the plain McChicken: a
  Spicy McChicken, a meal or a biscuit is refused by name, "2 McChicken 5.98"
  is $2.99 each, and a decimal point OCR read as a colon is accepted.
- **It fills in nothing**, and says why, when the photo is from another store
  (with a link to that store's page when the number is on file), when a
  receipt is more than 7 days old (a report is stamped with today's date by
  the security rules, so an old receipt would be recorded as today's price),
  or when only a meal or a Spicy McChicken is on it. Otherwise the person
  still checks the price and presses the button, and every rule a typed price
  meets still applies.
- **Store numbers.** Every receipt prints "McDonald's Restaurant #" and a
  number. `npm run import:store-numbers -- --file <mcdonalds.geojson>`
  matches All The Places' McDonald's locations (CC0, from the company's own
  store locator; download `output/mcdonalds.geojson` from the latest
  complete run at https://data.alltheplaces.xyz, about 21 MB; the 2026-10-03
  run was cut short at 11 MB) to our stores: one location within 150 m with
  the same street number, or within 60 m when either has none, and never one
  number for two stores. 220 of 235 stores have one in the saved data. Without
  a number, the check falls back to the street number. `GET
  /api/stores/by-number/[number]` finds the store for the link.

**Not yet proven on real photos.** The spike and the browser suite use mock
receipts and a mock app screen, because no freely licensed photo of a US
McDonald's receipt exists. The item-line wording and the app layout are
inferred. The first real receipts will show how it does on curled, faded or
glary photos; until then it only ever fills in a box the person checks.

---

## The site header

Every page has a header (`src/components/ui/SiteHeader.tsx`): the wordmark
links home, and Map, Log prices and About the data link to the rest. It was
added on 2026-10-12 after the owner found that the map had no way back to the
landing page except the browser's back button.

The current section carries `aria-current="page"` and an underline, so it is
never shown by colour alone; a store page counts as part of the map. On a phone
the labels shorten to Map, Log and About, while each link's accessible name
stays the full label, so the visible text is always part of it (WCAG 2.5.3). The
header has a fixed height, `--site-header-height` in `globals.css`, and the map
sizes itself to the viewport minus that height. `tests/browser/nav.js` checks
every route at both widths, including the trip from the map back home.

## The map

**Search.** A box above the list filters the stores already loaded, by
street, city, ZIP or the restaurant number on a receipt
(`src/lib/store-search.ts`). The list and the markers filter together, the
map zooms to the matches, and a polite live region says "10 of 86 stores
match". Abbreviations are expanded on both sides, so "S MacArthur Blvd" finds
"South MacArthur Boulevard", and a term must start a word but may run across
spaces, so "macarthur" finds "Mac Arthur" while "rving" doesn't find Irving.
A search never re-ranks: tiers are computed across the whole area, so a
store's "cheapest third" doesn't change with what is typed. It doesn't fetch
either; "Change location" is how to look somewhere else. The query is kept in
the address bar as `?q=` (written with `replaceState`, so typing doesn't
fill the back button), and a shared link opens with it applied.

Three encodings carry the same information, so none of them is doing the job
alone:

| State | Colour | Glyph | Text |
| --- | --- | --- | --- |
| Cheapest third | teal | ▼ | "Cheapest third" |
| Middle third | ochre | ● | "Middle third" |
| Priciest third | maroon | ▲ | "Priciest third" |
| Stale (>90 days) | grey + hatching | ◷ | "Stale · last seen 4 months ago" |
| Unmeasured | grey + hatching | ? | "No prices yet" |

Tiers are computed over the **loaded 15-mile result set, not the visible
viewport**. Viewport-relative buckets would recolour markers as the user pans
with no underlying price change, which reads as a bug rather than as
information.

Stale and unmeasured are deliberately separate states. "We have not checked
lately" and "nobody has ever told us" are different claims, and merging them
would label every brand-new store as out of date. Stale stores also drop out of
the cheapest-nearby ranking, while still showing their price.

### The side panel is ordered by distance

Nearest first, not cheapest first. The price sort it started with put a store
twelve miles away at the top of the list while the McDonald's across the road
sat below the fold — the list was answering a question the header already
answers. The list says *what is near me*; the tier badge on each row, the marker
colours, and the cheapest-nearby figure in the header say *what is cheap*.
Ordering by distance lets a reader scan outward from where they are and watch
the price fall out against it.

Unmeasured and stale stores stay in place in that order rather than sinking to
the bottom. A store with no prices two blocks away is the single most useful row
on the list for somebody willing to log one.

### The tab remembers where you asked about

Opening a store page and pressing "Back to the map" used to land on the
permission gate: the position lived in React state, and the navigation threw it
away. The map now writes the position to `sessionStorage`
(`lib/remembered-location.ts`) and adopts it on mount, so returning to the map
returns to the same map.

`sessionStorage` rather than a cookie, deliberately. A cookie rides along on
every request to the server, which would make the promise on the location gate
— that a position is only ever sent to look up nearby stores — false. This copy
never leaves the browser and dies with the tab.

Two consequences worth knowing:

- **A "Change location" control is not optional.** A remembered position with no
  way to clear it is a trap, so the map header carries one; it forgets the
  stored position and returns to the gate.
- **There is a brief neutral state on mount.** The server cannot read
  `sessionStorage`, so the component does not know whether a location exists
  until it has hydrated. It renders a spinner for that frame rather than
  guessing, because guessing wrong means flashing the permission gate at
  somebody who just came back from a store page.

### Known limitation: marker overlap

At metro zoom, stores clustered near one another — DFW Airport has five within a
couple of miles — produce overlapping markers, and only the topmost is
clickable. The side panel is a complete alternative selection path, and both
directions stay in sync, so nothing is unreachable. The standard fix is marker
clustering (`leaflet.markercluster` or a spiderfier); it is not implemented.

---

## The store page

Four things, in the order somebody reads them: the price, how it compares to
the area, how it got there, and every report behind it.

### The comparison strip

The store shows one price. The *area* it is compared against is a median —
each store within 10 miles contributes its own single price once, however many
people reported it. Pooling raw submissions instead would let one heavily
reported store define the whole area.

This is the one place a median survived the move away from them, and for a
different reason than before: it is summarising *across restaurants*, where a
midpoint is a fair description of a market, rather than across reports about
one restaurant, where it was a number nobody had ever been charged.

Two exclusions decide whether it means anything:

- **The store never contributes to its own baseline.** Including it drags the
  comparison toward zero, hardest when there are fewest neighbours — exactly
  when the comparison is already weakest.
- **Stale and unmeasured neighbours are dropped.** A price nobody has confirmed
  in three months is not evidence of what the area charges today.

Below three comparable neighbours the strip refuses to compute anything and
says so, because the midpoint of two stores is not an area price.

10 miles rather than the map's 15: fifteen is "stores I could drive to", ten is
closer to "the same market", which is the only thing a comparison can honestly
claim.

### The chart

Recharts, loaded only in the browser and only on this route. Values stay in
integer cents through the axis domain and the tick values; `formatCents` runs
in the tick and tooltip formatters, which is the render layer.

Only counted submissions are plotted. A delivery price sitting a dollar
above the counter price would draw a spike that looks like a price rise and is
nothing of the sort — the table below the chart carries every submission,
counted or not, with the reason each excluded one was excluded.

The line draws itself in once, on first mount, and never again. Recharts
re-runs its entrance animation on every data change, so without latching it the
chart would redraw from zero each time a submission landed and the route
refreshed.

One compromise worth naming: Recharts takes an easing keyword, not a
`cubic-bezier`, so the chart cannot be handed `--ease-out-quart`. It uses
`ease-out`, which shares the property that matters.

### The submit modal

Built on the native `<dialog>` element opened with `showModal()`, which supplies
the focus trap, the top layer (no z-index argument with Leaflet), background
inertness, and focus restoration to the launching button. Reimplementing those
by hand is where accessible modals usually go wrong.

The animation sits on top rather than replacing any of it: the dialog's own
`::backdrop` is left transparent and a backdrop element is rendered inside, so
the backdrop and panel share **one transition object** — literally the same
values, not two definitions that happen to match. Escape is intercepted via
`oncancel` so the exit animation runs before `close()`.

`size-full` on the dialog is load-bearing. The UA stylesheet sizes a dialog
`fit-content`, every child is out of flow, and without an explicit size the
dialog box collapses to 0×0 — fine to look at, invisible to hit testing and to
assistive technology.

There is no store picker in the modal. You arrive from one store's page; a
searchable selector inside a dialog would be a second, worse version of the map.

### Async states

Every async surface has an explicit loading, empty and failure state: the map's
dynamic import, the store lookup, the Overpass reconciliation, the chart's
import, geolocation, the ZIP lookup, and the submission itself. The two
exceptions are route-level navigation into `/` and `/store/[id]`, which are
server-rendered — a route skeleton there costs either a correct 404 status or
0.28 of layout shift, both documented above, and buys a few hundred
milliseconds.

---

## The landing page

Every figure on it is live. No placeholder copy, no illustrative number, and no
`$1.42` hardcoded anywhere — if the database is empty the page says so in as
many words.

The hero counts up from zero over 800ms. It does not hold the value in React
state (sixty re-renders a second to animate one string), does not render a
placeholder on the server (the final figure is in the HTML, so it is correct
with JavaScript disabled), and rounds every frame to a whole number of cents
through `formatCents`, so the count is made of real prices rather than a float
sliding toward one.

Deliberately **not** named after a metro area. The data is Dallas–Fort Worth
today, but nothing in the schema knows that, and a hardcoded region becomes a
lie the first time somebody syncs a different one.

`getIndexSnapshot` excludes stale stores from the headline spread and both
leaderboards. Staleness cannot be filtered in the query — it is an inequality on
a different field than the `orderBy`, which Firestore rejects — so the cut
happens in memory over at most 250 priced stores. A national index would need a
maintained aggregate document instead.

There is no `loading.tsx` for this route, and that is measured rather than
missing. A skeleton was built and scored **0.28 cumulative layout shift** at
1440px, nearly three times the budget, because a hero whose type wraps and whose
figure is `clamp()`-sized cannot be predicted by a static placeholder. Without
it the page measures 0.0000.

Related trap, in case one is added back: a `loading.tsx` at the app root puts a
Suspense boundary above *every* route, and a streamed response has already sent
its 200 by the time `/store/<unknown>` calls `notFound()`. It briefly made every
404 on the site answer 200.

### The clay scenes

The landing page has three small 3D scenes, added on 2026-10-11 and modelled
on the clay, isometric style of a [Sendoso animation on
Dribbble](https://dribbble.com/shots/26613831-3D-Animation-For-Sendoso-com).
They are built from primitives in three.js: no model files, no logos, and the
site's own palette, so no red or yellow anywhere.

- **The kitchen line**, beside the headline: three cooks on a conveyor belt
  build the same chicken sandwich over and over, a press pins a price flag in
  each one, and it drops into a bag. Identical sandwiches, different flags.
- **Headquarters**, in "Why it moves": a tall corporate tower with people in
  suits going in and out, and two small franchise shops beside it, each with
  its own price on the sign.
- **Logging a price**, in "How a price gets here": somebody reads the menu
  board, types $2.49 into their phone, and a price card flies onto that
  store's pin on a small map.

- **Code:** `src/components/landing/scenes/`. `stage.ts` holds the shared
  renderer, camera, lights, clay materials and people; `kitchen.ts`,
  `headquarters.ts` and `logging.ts` are the scenes; `ClayScene.tsx` is
  the React wrapper.
- **Loading:** each figure and its caption are server-rendered at a fixed
  ratio, so nothing moves when the scene arrives. `three` (pinned at 0.186.1)
  is imported with `import()` only on the client, only on `/`, and only once
  the browser is idle and a figure is on screen; the three scenes share it. The headline number still
  paints first.
- **Motion:** in each scene one clock drives everything: every position is a
  function of time, so nothing drifts. In the kitchen, the belt runs at a
  constant speed and every cook's movement follows the next sandwich. It renders only while on screen and while the tab is visible.
  Under `prefers-reduced-motion` or data saver it draws one still frame and
  never animates; without WebGL the canvas stays empty and the caption stands
  alone.
- **Accessibility:** the canvas is `aria-hidden`. The caption says in words
  what the animation shows.

`tests/browser/scenes.js` checks all of that from the outside, for all three.

---

## Offline

`navigator.onLine` is only trustworthy when it says false, which is the case
worth acting on. A banner appears, fixed to the bottom so it costs no layout
shift, in a permanently-mounted `role="status"` region so the change is
announced rather than the arrival of an element. A submission attempted offline
fails in about 250ms instead of sitting on a Firestore timeout.

**Firestore offline persistence is deliberately not enabled.** It would queue
that submission and replay it on reconnect, which sounds strictly better and is
not: the queued document carries a `status` predicted against a price that may
have moved by the time it commits, so the security rule would reject it on
replay — silently, long after the contributor was told it had saved. Failing now
and saying "nothing is queued" is the honest option.

---

## Store locations

Store data comes from OpenStreetMap via the Overpass API — free, no key, and
licensed for this use under the ODbL, which requires the attribution carried in
the site footer.

Three constraints shape the implementation (Phase 2):

- **Overpass is proxied server-side and cached.** Querying it from the browser
  on every map pan would get the app rate-limited, and deservedly so.
- **Locations are matched on `brand:wikidata=Q38076`**, not a name regex. A name
  match catches "McDonald Street" and misses renamed franchises.
- **The query uses `nwr` with `out center`.** Plenty of locations are mapped as
  building ways rather than points.
- **A sync covers the whole cell, not just the visitor's circle.** Freshness
  is tracked per precision-4 geohash cell, roughly 20 x 33 km. Fetching a
  15-mile circle around whoever asked first left a visitor elsewhere in the
  same cell with up to 89% of their search area never queried, while the gate
  told them the area was fresh for a week. A sync now fetches around the
  cell's centre, out to the radius plus the cell's half-diagonal (about 43 km
  for 15 miles at DFW), and `syncLog` records how far it reached. A cell is
  fresh only if its last sync reached at least as far as the current request
  needs, so a request with a tiny radius can no longer mark a whole cell as
  synced. Log entries from before coverage was recorded count as covering
  nothing, and re-sync once.
- **The whole site has an Overpass budget**: 60 queries an hour, counted in a
  Firestore transaction (`syncBudget/overpass`) and spent only on real
  queries, never cached answers. Past it, `/api/stores/sync` answers 429 with
  `Retry-After` and the map shows what is already in the database. The sync
  route is unauthenticated, so without a ceiling anyone posting a new cell's
  coordinates every second could turn this server into an amplifier aimed at
  donated infrastructure. Neither `syncLog` nor `syncBudget` is named in the
  rules, so clients can neither read nor write them; `tests/rules` pins that.

### Filling in missing addresses

Roughly one store in nine comes back from Overpass with no `addr:*` tags at all,
even where the surrounding OSM data knows perfectly well what street the
building is on. Those rendered as "no address on file" — accurate about our
record, useless to somebody deciding which McDonald's to walk to.

`/api/stores/sync` now runs a second pass over the area
(`backfillMissingAddresses`) that asks [Photon](https://photon.komoot.io) the
reverse question: what is at this coordinate? Photon is OSM-backed, so the
address stays OSM-derived and the ODbL attribution in the footer still covers
it. In practice it resolves the very same OSM element the store record came
from.

Four constraints, all of them the fair-use obligation Overpass already carries:

- **Fifteen lookups per sync call, three at a time.** An area heals over a
  handful of visits instead of one burst. `remaining` in the response says how
  many are still queued.
- **`addressCheckedAt` is stamped even when the answer is nothing.** A store the
  geocoder cannot place stays unplaceable tomorrow; without the stamp it would
  be looked up on every sync forever, which is what gets a donated service to
  block you. Thirty days before it is asked about again.
- **A geocoder outage is not an answer.** A thrown lookup leaves the store in
  the queue rather than banking a false negative.
- **The answer must actually be at the coordinate.** Reverse geocoding returns
  the *nearest* addressable feature, and "nearest" across a car park is a
  different building on a different street. Results more than 150m from the
  store are discarded — the same discipline as the ZIP lookup below.

Two things this deliberately does not do. It never overwrites an address that is
already on file, and the weekly OSM refresh never writes its own null back over
a backfilled one (`upsertStores` omits the field rather than clearing it) — the
alternative is addresses disappearing on a seven-day cycle. And where even
Photon has no street, the result is recorded as a `locality` rather than dressed
up as an address.

### ZIP geocoding is not Nominatim

The ZIP fallback needs a postal-code centroid. Nominatim was the obvious choice
— same OpenStreetMap project — but it returns **403 Forbidden** for this client
under the OSM Foundation's usage policy, so it cannot be depended on.

`/api/geocode` uses [Zippopotam](https://api.zippopotam.us) instead, with
[Photon](https://photon.komoot.io) (Komoot's OpenStreetMap-backed geocoder) as a
fallback so an OSM-derived path remains. Responses are cached for 30 days; a ZIP
centroid does not move.

Photon is a fuzzy search rather than a postcode lookup, and it will answer
almost anything with its best guess — asked for `00000 United States` it returns
a residential street in Pope County, Minnesota. The fallback therefore requires
the returned feature to actually *be* the requested postcode; otherwise a
mistyped ZIP would drop somebody into a random part of the country and show them
stores there. A ZIP that genuinely does not exist returns 404, which is a
different answer from "we could not reach a geocoder" (503).

This affects the ZIP lookup only. Store locations still come from Overpass/OSM
under the ODbL.

---

## Design system

Tokens live in `src/app/globals.css` as CSS variables under Tailwind v4's
`@theme`. No component contains a raw hex value.

The palette deliberately avoids red and yellow. Using a trademark descriptively
in body copy is fair use; dressing the product in the trademark owner's trade
colours is a different argument, and not one worth having.

Committed to a single light treatment rather than a light/dark pair. The
direction is print — ink on paper — and a dark variant would be a second design
rather than a toggle.

Contrast is verified, not assumed:

```bash
npm run check:contrast
```

All 22 declared foreground/background pairs pass WCAG AA; the script exits
non-zero on any failure so it can gate a build. The landing page turns the
palette over once for its closing band, and both the inverted text pairs and
the light focus ring that band needs are in the checked list.

### Typography

Fraunces for display, IBM Plex Sans for reading, IBM Plex Mono for figures.
Prices are compared down a column constantly, and tabular figures keep the
decimal points from wandering — which is also what stops the hero count-up
changing width on every frame.

All three are self-hosted by `next/font` at build time, so there are no external
font requests and the fallback metrics are matched.

### Motion

Easing and duration tokens are defined in `globals.css`. `ease-in` is never used
for UI — it withholds feedback at the moment the user most needs it. Product UI
stays under 300ms; exits run about 20% faster than entrances. Only `transform`
and `opacity` are animated.

Every animated element carries its own `prefers-reduced-motion: reduce` guard,
with no `!important` and no exception for opacity. Hover effects are wrapped in
`@media (hover: hover) and (pointer: fine)` so a tap on a touch device does not
leave an element stuck in a phantom hover state.

That claim is tested rather than asserted. The Phase 6 suite walks every element
on every route under `prefers-reduced-motion: reduce` and fails on any surviving
animation or transition — then walks them again with motion allowed and fails if
*nothing* animates, because a guard that works only because nothing was animated
is not a guard.

**Leaflet was the one thing that failed it.** Its stylesheet applies zoom, pan
and tile-fade transitions unconditionally, and a zoom animation moves the entire
viewport — the largest piece of motion on the site. `MapCanvas` now disables
them at the source via `zoomAnimation` / `fadeAnimation` / `markerZoomAnimation`,
and `globals.css` neutralises the stylesheet as well, for a preference changed
after the map was created. No `!important`: each override is one class more
specific than the Leaflet rule it replaces.

The landing page's three clay scenes are the only continuous animation on the
site. They run in canvases, so they never touch layout, and each stops whenever
it is off screen or motion is reduced (see [The clay scenes](#the-clay-scenes)).

Map marker hover is deliberately **not** animated. Users hover markers hundreds
of times in a session, and a transition on each one turns reading the map into
waiting for it.

### Accessibility

`axe-core` runs across eight document states — landing, about, store detail,
store 404, root 404, the submit modal open, the map's location gate, and the map
with markers rendered — at WCAG 2.1 A and AA. Zero violations. The best-practice
ruleset is deliberately not included: it is opinion, and failing a build on
opinion is how teams learn to ignore the build.

The audit is a floor, not the work. axe cannot tell you that a tier is legible
in greyscale, that a focus ring is invisible against a dark band, or that a
label is a caption rather than a target — those are checked explicitly in the
suites.

---

## Deployment

**Live at https://sandwich-index.vercel.app** since 2026-10-12.
Development stays emulator-first: `.firebaserc`'s default is still
`demo-sandwich-index`, so nothing local can reach production by accident.

| Piece | Where |
| --- | --- |
| Firebase project | `sandwich-index-app` (alias `prod`), Spark plan. Firestore `(default)` in `nam5`; Anonymous sign-in on. |
| Hosting | Vercel project `sandwich-index`, team `vyom-mehta-s-projects`, linked to `vom00/sandwich-index`. |
| Public config | `deploy/vercel.env`, every value set in Vercel. |
| Secrets | `FIREBASE_CLIENT_EMAIL` and `FIREBASE_PRIVATE_KEY`, Production only, marked Sensitive, set by hand by the owner. |

**Deploying.** Vercel's production branch is still `main`, which is behind,
so a production deploy is made by deploying `price-feeds-and-audit-fixes`
explicitly (Vercel API `create_deployment` with `target: production`). A push
alone makes a preview, and previews sit behind Vercel's sign-in. Rules and
indexes go separately: `npx firebase deploy --only firestore --project prod`
whenever `firestore.rules` or `firestore.indexes.json` changes. A changed
environment variable needs a redeploy before it takes effect.

**Verified on the live site, 2026-10-12** (read-only: no price was submitted):
every route answers as it should (pages 200, unknown store 404, bad restaurant
number 400), `robots.txt` and `sitemap.xml` name the production origin, the
security headers are on every response, the first store sync for Coppell
pulled 222 restaurants from OpenStreetMap, the map lists and plots the 86
within 15 miles with search working, a store page renders, and the browser
console is clean. The home page shows its honest empty state, "Nothing to
report yet", because no price has been logged.

**The service-account key.** Pasting a PEM key into a dashboard goes wrong
often, and it did here twice: a stray keystroke inside the key, then a key
paired with the wrong email. `src/lib/firebase/private-key.ts` now repairs the
usual damage (JSON quotes, escaped newlines, CRLF, invisible characters,
debris after the padding, the whole JSON file pasted, in which case the file's
own email is used), and `admin.ts` logs, once per cold start and as yes/no
only, whether the account belongs to this project and whether the key is one
of its live published keys. Pasting the entire JSON file into
`FIREBASE_PRIVATE_KEY` is the least error-prone way to set it.

**Restaurant numbers in production.** Stores get their McDonald's number on
the server, not by an import: `src/data/restaurant-numbers.json` (13,638 US
restaurants from All The Places, CC0, 481 KB, server-only) is matched against
the stores around every sync by `backfillRestaurantNumbers`, with the same
rules as `import:store-numbers` (`lib/store-numbers`). Against the
emulator's 235 stores the two agree exactly: 220 numbers, no differences. So
any area gets its numbers the first time someone opens the map there.
Refresh the table with `npm run build:store-numbers -- --file <geojson>`.

**Content-Security-Policy, enforced.** Production builds send the full
policy (`next.config.ts`): every host the browser reaches is listed. It ran
report-only on the live site first, then enforced, and both passes over every
page, the 3D scenes, the map tiles and the photo reader (blob: worker and
WebAssembly) logged no violations and no console errors. Scripts still allow
'unsafe-inline' because Next streams inline payloads; a nonce would remove
that at the cost of making every static page dynamic.

**Not done yet:** App Check (pre-flight item 3), which needs a reCAPTCHA site
key registered by the owner.

On Firebase App Hosting instead of Vercel, the two secrets go away: the Admin SDK
uses the server's own Google identity when `FIREBASE_CONFIG` or `K_SERVICE`
is set (`src/lib/firebase/admin.ts`). App Hosting needs the paid Blaze plan.

**Seed data never ships.** `scripts/seed.ts` (Phase 2) refuses to run against
anything but the emulator. Deploying synthetic prices would present fabricated
data as crowdsourced reality, which destroys exactly the trust the abuse
mitigation above exists to build. The consequence is that a fresh deployment is
genuinely empty, so every data surface has a real empty state rather than a
fallback.

### Pre-flight

Everything below is a decision or a credential, so it belongs to whoever owns
the project — none of it can be done from a development machine.

1. **Create the Firebase project** and enable Firestore plus Anonymous Auth.
2. **Set the environment variables** listed under
   [Environment variables](#environment-variables). Two are easy to miss:
   - `FIREBASE_PROJECT_ID` — the app now refuses to start if real Admin
     credentials are supplied without it, rather than authenticating against
     the `demo-` fallback and failing opaquely.
   - `NEXT_PUBLIC_SITE_URL` — the origin `robots.txt` and `sitemap.xml` are
     built from. Without it they advertise `localhost`.
3. **Register an App Check provider** (reCAPTCHA Enterprise) and set its site
   key. Until then App Check is in debug mode and the write path is protected
   only by the security rules.
4. **Deploy rules and indexes** — `firebase deploy --only firestore` — before
   the first visitor writes anything. The rules are the only thing standing
   between the `submissions` collection and the open internet.
5. **Set `NEXT_PUBLIC_SITE_URL`, and optionally `OVERPASS_CONTACT_EMAIL`.**
   Overpass is donated infrastructure and its usage policy asks that requests
   identify themselves. The User-Agent carries the site's URL, plus the
   contact address when one is set.
6. **Run `npm audit --omit=dev` and check the `next` pin.** `next`,
   `react` and `react-dom` are pinned to exact versions, so nothing updates
   them on its own. That is how 16.3.0 sat on a critical advisory until the
   2026-10-11 audit. The four production findings left after it (Firebase's
   pinned `@grpc/grpc-js`) are explained in `research/audit-log.md`.
7. ~~**Add a full Content-Security-Policy once the hosts are known.**~~ Done
   2026-10-12 and enforced; see above. A new outside host (an analytics
   script, a different tile server) has to be added to
   `CONTENT_SECURITY_POLICY` in `next.config.ts` or the browser will block it.

### What is verified and what is not

Verified locally: every route builds, every automated check listed under
[Test results](#test-results) passes, and the production build compiles clean. **Not verified against real Firebase:** index
requirements. The emulator does not enforce them, so the first production
queries are the first real test — see [Indexes](#indexes) for why the current
answer is "one composite index and the rest are automatic."

---

## Known environment issues

### Browser extensions and hydration

Grammarly, password managers and similar extensions write attributes onto
`<body>` (`data-gr-ext-installed`, `data-new-gr-c-s-check-loaded`) before React
hydrates, which React reports as a hydration mismatch. Nothing in the app causes
it and no visitor can avoid it, so `<body>` in `src/app/layout.tsx` carries
`suppressHydrationWarning`.

That attribute is safe here **only because the body className is a static
literal**. React's suppression is one element deep and does not reach children —
verified rather than assumed: tampering with the skip link's `class` before
hydration still raises the warning, while the extension attributes on `<body>`
no longer do. If anything dynamic is ever added to that tag, the suppression
stops being safe and has to go.


Playwright's bundled Chromium does not start on the current Windows machine —
it needs the Microsoft Visual C++ Redistributable and Windows reports a
side-by-side configuration error. Test scripts prefer the installed Edge or
Chrome channel and fall back to bundled Chromium. Installing the
[VC++ Redistributable](https://learn.microsoft.com/cpp/windows/latest-supported-vc-redist)
would let the bundled build work.
