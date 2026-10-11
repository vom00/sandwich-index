# Where a real per-store McChicken price can come from

Goal: for every McDonald's in DFW (then wider), know the actual McChicken price
at that specific store — a number someone was charged, not a metro median.
Once the app is deployed, user logging keeps it fresh; this document is about
where the *initial* accurate number comes from and how to verify it.

Status: **a definitive per-store source exists and is publicly browsable.**
(Loop started 2026-08-10.)

## The short answer

1. **The source is MenuPriceTracker** — real per-store McChicken prices,
   app-sourced, monthly, covering 276 DFW restaurants and 9,200+ nationally.
   Verified store by store, not taken on the site's word.
2. **Using it in bulk is a licensing question, not a technical one.** A draft
   email is at the end of this file; it needs the owner to send it.
3. **The matching problem is solved**: `scripts/match-tracker-stores.ts` joins
   their rows to our stores on **street number + city**, 15 of 15 with no
   ambiguity. It writes nothing until permission exists.
4. **Without permission, the app already works** — the `/log` flow collects
   the same prices first-party, slower but with clean title, and the source
   remains usable as a free spot-check on any single store.

Everything below is the evidence, newest sweep last within each section.

## Confirmed: MenuPriceTracker — per-store McChicken prices, DFW covered

https://menupricetracker.com — store-level McDonald's prices sourced from the
McDonald's mobile app, refreshed monthly, last verified 2026-08-03. Coverage
claim: 9,200+ US locations, 754 in Texas across 410 city pages.

Verified by direct fetch on 2026-08-10:

- **Store pages carry a store-specific McChicken price.** Example:
  `menupricetracker.com/mcdonalds/texas/dallas/1717-w-mockingbird-ln`
  (1717 W Mockingbird Ln, Dallas) — **McChicken $1.99**, Big Mac $5.39, ~20
  items listed, "prices are collected at the store level from the McDonald's
  app", updated 2026-08-03.
- DFW city pages with per-store links and street addresses:
  - `/mcdonalds/texas/dallas` — 34 locations
  - `/mcdonalds/texas/fort-worth` — 29 locations (e.g. 3300 Hulen St,
    13124 Hwy 287, 2451 Meacham Blvd)
  - `/mcdonalds/texas/arlington` — 13, `/plano` — 13, `/irving` — 10
- City/state averages as a sanity band: McChicken averages $2.10 in Dallas,
  $2.16 in Fort Worth, $2.17 in Texas, $2.86 nationally (range $1–$5.79).
- Methodology (from their About page): app-sourced monthly pipeline, plus
  crowd-sourced photo/receipt corrections between refreshes; "if we don't
  have verified data for a product at a location, we don't show a number."
  Named editorial contact (Joyce Kim, Senior Price Analyst) with a
  corrections email on the site.

### What this means for the app

- **As a verification reference: usable now.** When a logged price disagrees
  wildly with the store's MenuPriceTracker page, one of them is stale — that
  is exactly the cross-check the move gate wants.
- **As bulk seed data: licensing question, not a technical one.** Their
  numbers are themselves scraped from the McDonald's app; no API, dataset
  download, or reuse terms are published. Copying 100+ store pages into our
  DB republishes their dataset. The site lists a contact — asking for
  permission/licensing is the clean route. Owner's call.
- Their own caveat applies to us too: "may not reflect current prices at any
  specific location" — which is the argument for the app's logging model.

### DFW coverage tally (from their Texas index, 2026-08-10)

276 locations across 35 metroplex cities: Dallas 56, Fort Worth 40,
Arlington 13, Plano 13, Irving 10, Garland 9, Mesquite 8, Grand Prairie /
Frisco / Denton / McKinney / Lewisville 7 each, Carrollton 6, Richardson 5,
Hurst 4, and 1–3 in each remaining suburb (Coppell 1, Grapevine 2, Euless 1,
Flower Mound 2...). Note: the state index says Dallas 56 while the Dallas
city page shows 34 store rows — the delta is unexplained (possibly
neighborhoods split out); worth counting store pages directly before any
cross-reference. Owner directive 2026-08-10: once DFW is saturated, expand
to all of Texas (754 stores / 410 city pages on this source), then USA
(9,200+). The app itself is already nationwide-capable — store sync is
viewport-driven; only the dev seed is DFW-centered.

## Other leads, graded

- **McCheapest (formerly pantryandlarder.com/mccheapest) — defunct.** The
  press-famous per-location Big Mac map (10,000+ stores, app-scraped, by
  Sacha Fournier). As of 2026-08-10 the pantryandlarder URL 404s and
  mccheapest.com serves a hosting placeholder with a wildcard
  `*.wpxhosting.com` cert; press said "last updated in February". Dead end
  unless an archive copy matters later — and it was Big Mac only anyway.
- **Kaggle "McDonald's Stores Data"** — every US store location (Sept 2023),
  locations only, no prices. Redundant with our OSM sync.
- **Slickdeals threads** — document app *deals* ($1 McChicken promos), not
  menu prices. Useful only as evidence of how low the floor goes.
- **fastfoodmenuprices-style sites** — state or national averages, no store
  granularity. Not useful.
- **Reddit r/Dallas etc.** — first sweep found no store-specific McChicken
  posts. Low yield; occasional receipt photos might corroborate a single
  store.

### First OSM ↔ tracker cross-reference (2026-08-10)

Their Coppell page lists exactly one store: **813 Macarthur Blvd, Coppell,
TX 75019 — McChicken $2.49** (Big Mac $5.89, fries $2.69, med Coke $1.49;
verified 2026-08-03; page `/mcdonalds/texas/coppell/813-macarthur-blvd`).
That is the same restaurant as our OSM-synced "813 South MacArthur
Boulevard, Coppell, TX 75019". Address formats differ (South/directional
prefix, Blvd abbreviation), so string equality cannot be the join key. One
store = one confirmed real-world McChicken price attachable to a store
already in the app.

*(First guess at a join key was street number + ZIP. Lewisville disproved it
and geocode proximity looked necessary; the built matcher then settled it
with street number + city. See "Matcher scaffold" below for the answer that
survived — this paragraph is kept for the address-format finding, not the
key.)*

Extended sample (2026-08-10, all verified by them 2026-08-03): every OSM
store sampled so far exists on the tracker — 3 of 3 matched.

| Store (as in our DB)                              | Their McChicken |
|---------------------------------------------------|-----------------|
| 813 South MacArthur Boulevard, Coppell, TX 75019  | $2.49           |
| 8435 North Belt Line Road, Irving, TX 75063       | $2.49           |
| 2109 Long Prairie Road, Flower Mound, TX 75022    | $2.59           |

(Also on file: 1717 W Mockingbird Ln, Dallas — $1.99.) City averages for
sanity: Irving $2.39, Flower Mound $2.59, Dallas $2.10, Fort Worth $2.16.

**Matcher lesson from Lewisville (2026-08-10):** all five of our OSM
Lewisville stores exist on their site, but under alias street names — OSM
says "Round Grove Road" where they say "FM 3040", OSM "South Business 121"
vs their "S Hwy 121" — and one store's ZIP disagrees outright (our 501 E
Round Grove Rd is 75067, their 501 E Fm 3040 is 75028).

Two conclusions, one of which turned out to be wrong: street name is
unusable as a key (correct — the aliases are systematic), and ZIP is
unreliable too (correct). The inference drawn at the time, that geocoding
each address and matching within ~150 m was therefore *necessary*, was
wrong — street number plus city carries enough signal on its own, as the
matcher went on to prove. Lewisville McChicken average: $2.45.

On the Dallas 56-vs-34 discrepancy: the Dallas city page firmly lists 34
store rows with no pagination while the state index claims 56; the site
doesn't explain it. Store pages are the ground truth; treat index counts as
approximate.

### Cross-reference tally: 14 of 14 (2026-08-10)

Every OSM-synced store sampled so far exists on the tracker: Coppell (1),
Irving (1), Flower Mound (1), Dallas (1), Lewisville (5, via street-name
aliases), Grapevine (1: "101 E Tx-114" = our 101 E State Highway 114),
Carrollton (4), Farmers Branch (1: 2899 Valley View Lane). McChicken city
averages so far: Dallas $2.10, FW $2.16, Irving $2.39, Lewisville $2.45,
Flower Mound $2.59, Grapevine $2.24, Carrollton $2.29, Farmers Branch $2.34.

### Texas beyond DFW (their state index)

Houston 126, San Antonio 82, El Paso 40, Austin 33, Lubbock/Laredo/Katy 16,
Corpus Christi 13, Spring 12, Amarillo/Brownsville 11, Tyler 10 — the long
tail runs to 410 city pages, 754 stores. Same per-store page structure, so
whatever works for DFW scales to the state and the 9,200+ US pages
mechanically. The blocker stays legal, not technical.

Sampled 2026-08-10 to confirm the structure holds statewide. McChicken city
averages: **Houston $1.83** (73 store rows), **Austin $2.25** (22),
**San Antonio $2.32** (42) — against the Texas average of $2.17. Houston
being 34¢ under the state average and Flower Mound 42¢ over it is the whole
premise of the app in one line: this is franchisee pricing, not a national
menu.

### The USA step (checked, structure identical)

California: **781 stores across 474 cities, McChicken average $3.72** vs a
$2.86 national average, verified August 2026, same city → per-store page
shape (Los Angeles alone lists 64 locations). So a $1.83 Houston McChicken
and a $3.72 California one are the same sandwich — a 2× spread nationally,
which is a far stronger story than the DFW spread alone. Coverage for a
nationwide index therefore exists; nothing about the expansion is a
technical problem.

**Proven, not assumed (2026-08-10):** posting a Los Angeles coordinate
(34.0522, -118.2437, 5 miles) to `/api/stores/sync` returned
`found 34, created 34`, with reverse geocoding filling the one missing
address and the twin filter running clean. Those stores are now queryable
and mappable exactly like the DFW ones. The app is already a national
index — the only thing that is DFW-shaped is the dev seed's coordinates.
Expansion is a matter of visitors pointing the map somewhere and logging
what they paid, not of new code.

### Reddit / receipts: consistently low-yield

Second targeted sweep found no store-specific DFW McChicken postings.
Receipt photos exist but are rare and rarely name a store. Keep as a
corroboration channel, not a source.

## Academic and economic datasets — swept, dead end for this purpose

Worth checking because academic replication data is usually openly licensed,
which would have solved the licensing problem outright. It does not.

- **Ashenfelter & Jurajda, NBER w28506**, "Wages, Minimum Wages, and Price
  Pass-Through: The Case of McDonald's Restaurants" — genuinely *store-level*
  McDonald's price data, which is rare. But it is **Big Mac prices, 2016–2020**,
  gathered by the authors for the study. Historical, one item, and not a live
  feed. Useless as a price source for a site that answers "what does it cost
  today".
- **Berkeley IRLE (Sosinskiy & Reich, 2025)** — a national digital collection
  of burger-chain prices across five popular items. Closest thing to a research
  dataset that could serve, but it is a research artifact tied to a California
  minimum-wage study, not a maintained feed, and the item list is burger-led.
- **Card & Krueger (1993)** — the famous NJ/PA fast-food survey. 1992 data.
  Historical interest only.
- ICPSR/Dataverse searches surface markup and inflation replication packages
  built on BLS and WRDS aggregates, not per-restaurant menu prices.

**Conclusion:** academic data is retrospective by nature — collected once, for
a paper. Nothing in it can tell a visitor what a McChicken costs at their
local restaurant this week. The sweep is now complete across commercial
trackers, crowdsourced maps, forums and receipt posts, code/data repositories,
and the economics literature. Every source that is *current* and *per-store*
is somebody's scrape of the McDonald's app, and the only one of those with
verified DFW coverage is MenuPriceTracker.

One useful byproduct: that NBER paper measures a real price elasticity to
minimum-wage changes at McDonald's, which is independent evidence that
store-level price variation is a genuine, studied phenomenon rather than the
premise of this site being wishful. Reasonable material for `/about` if the
owner ever wants a citation.

## Where this lands (for the owner)

Sampling their pages verified the source is real, fresh, per-store, and
covers DFW almost 1:1 with our OSM data. Copying all 276 DFW stores' prices
(let alone 9,200) into the app without asking is republishing their
dataset. The clean path is one email. Draft, ready to send from your own
address to the corrections/contact address on menupricetracker.com:

> Subject: Licensing store-level McChicken prices for a free price-tracking
> site
>
> Hi — I run Sandwich Index, a small non-commercial site that tracks what a
> McChicken costs store by store, with prices submitted by visitors from
> their receipts. Your store-level data for the Dallas–Fort Worth area is
> the best-verified public source I've found. Would you be open to licensing
> (or permitting with attribution) your DFW McChicken prices as initial
> values for ~276 stores? Each store's page would credit MenuPriceTracker as
> the source of its starting price until a visitor confirms a newer one.
> Happy to discuss terms either way.

If they say yes: bulk-import with a distinct provenance field (NOT fake
crowdsourced reports — a `source: "menupricetracker"` starting value the UI
labels as such, replaced by the first real report). If no reply: stay
first-party — the /log flow with a handful of receipts covers the same
ground slower but with clean title.

### Matcher scaffold: built and proven (2026-08-10)

**This is the join key that survived contact with the data.**

`scripts/match-tracker-stores.ts` (report-only, writes nothing by design)
joins tracker rows to our stores on **(street number, city)** — no ZIP, no
street name, no geocoding. Against the full 15-row sample: **15 matched, 0
ambiguous, 0 missed**, including every alias-street case that broke the
earlier attempts (FM 3040, Tx-114, Hwy 121) and the Lewisville store whose
ZIP disagrees between sources.

Re-run against 123 synced stores after Los Angeles was added — a third more
stores, so a third more chance of a street-number collision — and it is
still 15/15 with nothing ambiguous.

Why it holds: two McDonald's in one city almost never share a street number,
so the number is nearly a key on its own and the city just scopes it. The
script flags any row matching more than one store as `AMBIG` for a human
rather than guessing — with 0 ambiguous across the sample, but that is the
behaviour to keep if it is ever run at 276-store scale.

Sample rows live in `research/tracker-samples.json`. Run:
`npx tsx --conditions=react-server --env-file=.env.local scripts/match-tracker-stores.ts`

## Next sweeps

1. Keep auditing the app.
2. If the owner sends the licensing inquiry and gets a yes: wire the import
   as its own script with a provenance field (the matcher stays read-only).
3. ~~OSM node/way duplicates~~ — confirmed real (2 pairs in 93 stores),
   fixed 2026-08-10: sync now filters twins by 75 m proximity
   (`src/lib/store-twins.ts`), existing twins merged out of dev data. The
   two DFW-airport "Terminal A" rows are >120 m apart and appear to be
   genuinely separate food-court locations; left alone.
