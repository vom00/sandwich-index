# Where a real per-store McChicken price can come from

Goal: for every McDonald's in DFW (then wider), know the actual McChicken price
at that specific store — a number someone was charged, not a metro median.
Once the app is deployed, user logging keeps it fresh; this document is about
where the *initial* accurate number comes from and how to verify it.

Status (2026-10-11): **no source is accurate, automated, per-store and usable
without someone's permission all at once.** The only primary source is the
McDonald's app, and automated access to it is off the table. Every per-store
alternative is either somebody's scrape of that app, whose freshness can't be
verified, or an enterprise data contract. The August conclusion below ("a
definitive per-store source exists") is superseded. See the next section.
(Loop started 2026-08-10.)

**Owner's decision, 2026-10-11 (late):** use MenuPriceTracker for now,
unlicensed, named and linked on every price, while the licensing email waits
for an answer (it bounced on 2026-10-12: their mail server refuses all
inbound mail, and they publish no other contact; see `feed-outreach.md`), with visitors still able to log what they see. The reader and
its limits are in the README's "MenuPriceTracker" section. This doesn't change
the findings below: its dates are still month-level at best, which is why its
prices say "checked" rather than "observed".

A second sweep the same evening asked a narrower question: is there anything
accurate that needs **nothing** from the owner? No. The one source that
passes every test on paper, Open Prices, has no McDonald's data and cannot
name a McChicken. See "Second sweep" below.

A third sweep on 2026-10-12 asked what could be **built** to get exact
prices. Nothing automated can: the exact price lives in the McDonald's app
and on receipts, and automating the app stays off the table. But the two
exact sources are already in visitors' hands, and reading them can be made
nearly effortless. See "Third sweep" below.

## 2026-10-12, third sweep: building something that reads exact prices

### Rechecked first

- **McDonald's web ordering exists now, but it's delivery.** Since 13 August
  2025, [mcdonalds.order.online](https://www.businesswire.com/news/home/20250813041428/en),
  run by DoorDash, takes McDelivery orders in a browser with
  [no app, login or account](https://foodondemand.com/08132025/mcdonalds-launches-new-direct-ordering-on-website/).
  Its prices are delivery prices, which run about 27% above the counter
  (see "Delivery menus" below), so it's the same wrong number as before.
  Pickup is still [app only](https://www.mcdonalds.com/us/en-us/faq/how-do-i-order-mcdelivery--using-my-mcdonald-s-app.html).
- **MenuPriceTracker** now claims 9,259 US stores
  ([its city index](https://menupricetracker.com/cities)). Its only contact
  address refuses mail (`feed-outreach.md`).
- **No other per-store tracker** turned up. The rest
  ([fastfoodmenuprices.com](https://fastfoodmenuprices.com/mcdonalds-prices/),
  [usmenuprices.us](https://usmenuprices.us/mcdonalds-menu/),
  [menupricebook.com](https://menupricebook.com/menu/mcdonalds/)) list one
  national menu.

### What can be built

**1. A receipt and app-screenshot reader (the recommendation).** A visitor
photographs a receipt, or screenshots the McChicken in the McDonald's app with
their store selected, and the site reads the price, the store and the date
from the picture. Both are exact: the receipt is what that store charged on
that day, and the app is the source MenuPriceTracker itself claims to copy.

- **Runs on the visitor's phone.** [tesseract.js](https://www.npmjs.com/package/tesseract.js)
  (7.0.0, December 2025) does the OCR in the browser, so the photo never
  leaves the device; only the price, store and date are submitted, the same
  fields the form takes now. That also keeps card digits and order numbers off
  our servers. Cost: the English model is 2.95 MB gzipped
  ([`@tesseract.js-data/eng`](https://cdn.jsdelivr.net/npm/@tesseract.js-data/eng@1.0.0/4.0.0_best_int/eng.traineddata.gz))
  plus the WebAssembly engine, loaded only when someone taps the button, and
  self-hosted rather than pulled from a CDN.
- **The person confirms.** The form shows what was read, filled in and
  editable, and nothing is saved until they submit. The existing rules all
  still apply: the $1–$15 range, one report per device per store per day,
  and the 40% hold.
- **Only a plain McChicken counts.** The parser rejects Spicy McChicken,
  McChicken Meal and anything else with the word in it, and divides by the
  quantity ("2 McChicken 5.98" is $2.99 each).

**2. Matching a receipt to its store by restaurant number.** McDonald's own
[receipt FAQ](https://www.mcdonalds.com/us/en-us/faq/where-can-i-find-the-receipt-information.html)
says every receipt prints "McDonald's Restaurant #" and the number, with the
address under it. [All The Places](https://wiki.openstreetmap.org/wiki/All_the_Places)
publishes every McDonald's location from the company's own store locator under
CC0, with that number as `ref`
([spider source](https://github.com/alltheplaces/alltheplaces/blob/master/locations/spiders/mcdonalds.py);
latest run 2026-10-03, [`mcdonalds.geojson`](https://alltheplaces-data.openaddresses.io/runs/2026-10-03-13-32-35/output/mcdonalds.geojson),
11 MB, worldwide). US refs are 3 to 5 digits, for example `17569` at 529
Jonesborough Rd, Erwin TN, and `3910` at 806 E 1st St, Vidalia GA. A
crosswalk from that number to our OpenStreetMap stores (nearest point, then
street number) makes the store match exact even when OCR garbles the
address. It's CC0, so no licence question.

**3. Measuring MenuPriceTracker.** Every receipt that lands at a store
MenuPriceTracker covers is a free accuracy check on it. A few dozen would
answer the question this file has asked since August: are its prices current?

### Feasibility spike (2026-10-12)

Three mock images, rendered in the scratchpad and read by tesseract.js 7.0.0
in Node: two thermal-style receipts, tilted and slightly blurred, and an app
item screen. The receipt layout follows McDonald's FAQ; the item-line format
("1 McChicken 2.49") is a guess, because no real US receipt was available.

| Image | Read in | OCR confidence | Parsed |
|---|---|---|---|
| Receipt, Coppell (with a Spicy McChicken and a McChicken Meal as decoys) | 357 ms | 90 | Restaurant #4412, address, 2026-10-11, McChicken $2.49 |
| Receipt, Irving, "2 McChicken 5.98" | 208 ms | 93 | Restaurant #31206, address, 2026-10-09, $2.99 each |
| App item screen | 166 ms | 92 | Pickup address, McChicken $2.49 |

All three were parsed correctly, and both decoys were rejected. The OCR still
made mistakes elsewhere: "2.99" read as "2:99", "1.22" as "22", "TEL#" as
"TEL$". Two guards catch that kind of error: the person confirms what was
read, and the item lines can be checked against the printed subtotal.

**What the spike does not show.** Real photos are harder than these: curled
paper, glare, low light, faded thermal print. There are no freely licensed
photos of US McDonald's receipts to test with (Wikimedia Commons has Dutch,
Taiwanese and Hong Kong ones), and the real item-line wording is unconfirmed.
The parser should be tuned on the first real receipts submitted, and until
then it should prefill the form and never submit on its own.

### What stays off the table

Automating the app, scraping DoorDash or Google, and estimating a store's
price from its neighbours. The site promises that no figure is estimated.

## 2026-10-11, second sweep: sources that need nothing from the owner

The owner wants accurate prices with no work on their side: no emails,
sign-ups, payments, app checks or price logging. "Accurate" means one price
for one store, in-store or pickup, with the date it was observed, from a
source the site may republish. Each candidate below is scored on those four
tests plus a fifth: it needs nothing from the owner. ✓ passes, ✗ fails,
? unknown. Earlier entries are re-scored on the same five tests so the whole
field is in one table.

| Source | Per store | Dated | In-store | Republish | No owner | Verdict |
|---|---|---|---|---|---|---|
| [McDonald's app](https://www.mcdonalds.com/us/en-us/terms-and-conditions.html) | ✓ | ✓ | ✓ | ✗ terms allow "personal, non-commercial" use only | ✗ needs a signed-in account | the ground truth, and unusable |
| [MenuPriceTracker](https://menupricetracker.com) | ✓ | ✗ its own dates contradict each other | ✓ says app-sourced | ✗ no reuse terms | ✗ licence | needs owner; draft in `feed-outreach.md` |
| [Datassential Price Monitor](https://datassential.com/resource/datassential-ai-powered-competitive-menu-pricing-food-beverage-companies/) | ✓ | ? monthly | ? | ? | ✗ enterprise contract | needs owner; draft in `feed-outreach.md` |
| [RMS Competitor Price Intelligence](https://restauranttechnologynews.com/2023/06/revenue-management-solutions-launches-platform-that-gives-restaurant-operators-access-to-menu-price-change-data/) | ✓ | ? | ? | ? | ✗ enterprise contract | needs owner; draft in `feed-outreach.md` |
| [Technomic](https://technomic.com/press-new-pricing-index-report) | ✗ state and metro | ✓ quarterly | ✓ | ? | ✗ enterprise | a sanity band, not a store price |
| McDelivery, DoorDash, Uber Eats ([markup study](https://www.restaurantbusinessonline.com/technology/food-delivery-insanely-expensive-consumers-dont-seem-care)) | ✓ | ✓ | ✗ delivery runs about 27% above in-store | ✗ platform terms | ✓ | the wrong price |
| [Open Prices](https://prices.openfoodfacts.org/api/v1/locations?osm_name__like=McDonald) (Open Food Facts) | ✓ keyed to OSM ids, like our stores | ✓ | ✓ receipts and shelf tags | ✓ [ODbL](https://www.data.gouv.fr/datasets/open-prices) | ✓ open read API | passes on paper, nothing to import (below) |
| [Wikimedia Commons](https://commons.wikimedia.org/w/index.php?search=intitle%3Amenu+intitle%3AMcDonalds&ns6=1) menu-board photos | ✗ 1 of 6 relevant files geotagged | ✓ | ✓ | ✓ CC | ✓ | too thin and too old: the one located US board is from 2013 |
| [OpenStreetMap tags](https://wiki.openstreetmap.org/wiki/Key:website:menu) | ✓ | ✗ | ✗ | ✓ ODbL | ✓ | no prices in OSM; US McDonald's carry only `website:menu`, a link to mcdonalds.com's price-free menu |
| [Flickr CC photos](https://www.flickr.com/services/api/misc.api_keys.html) | ? geotags | ✓ | ✓ | ✓ per photo | ✗ API key application | needs owner, tiny expected yield; draft in `feed-outreach.md` |
| [Mapillary street imagery](https://www.mapillary.com/developer/api-documentation) | ✓ | ✓ | ? boards rarely legible from the road | ? not stated on the API page | ✗ token from an account | needs owner, not worth it |
| [Hugging Face datasets](https://huggingface.co/api/datasets?search=mcchicken) | ✗ none exist | ✗ | ✗ | ✗ | ✓ | "mcchicken" returns 0; "mcdonalds" returns satellite and foot-traffic sets |
| [Harvard Dataverse](https://dataverse.harvard.edu/api/search?q=McChicken&type=dataset) | ✗ none exist | ✗ | ✗ | ✗ | ✓ | 0 datasets for McChicken; McDonald's searches return retail price projects |
| Ashenfelter and Jurajda; Berkeley IRLE (see August section) | ✓ | ✓ | ✓ | ? | ✓ | Big Mac and burgers, 2016 to 2025, collected once for a paper |
| GitHub trackers: [CyrilSLi](https://github.com/CyrilSLi/mcdonalds-price-tracker), [mcchicken-index](https://github.com/14039/mcchicken-index), [mcchickenflation](https://github.com/pzelle/mcchickenflation) | mixed | ✓ | ✓ | ✗ no licence, so all rights reserved | ✓ | mcchicken-index samples 12 metros from MenuPriceTracker and inherits its problems |
| [Kaggle McDonald's UK Menu Dataset](https://www.kaggle.com/datasets/danilchurko/mcdonalds-uk-menu-dataset) | ✗ | ✓ | ✓ | ? | ? | UK national menu |
| [FoodDataScrape](https://www.fooddatascrape.com/mcdonalds-menu-and-price-dataset.php) | ? | ? | ? | ✗ | ✗ paid | a commercial scraper; ruled out outright |
| [Franchise Disclosure Documents](https://www.law.cornell.edu/cfr/text/16/436.5) | ✗ | ✗ | ✗ | ✓ public filings | ✓ | none of the 23 required items covers menu prices |
| [BLS CPI, limited-service meals](https://data.bls.gov/timeseries/CUUR0000SEFV02) | ✗ national index | ✓ | ✓ | ✓ public domain | ✓ | context, not a price |
| Delivery price minus a markup | ✓ | ✓ | ✗ an estimate | ✗ platform terms | ✓ | the markup varies by franchisee, so it can't be subtracted out |
| Menu-board OCR | ? | ✓ | ✓ | ✗ | ✗ | no lawful image source: Commons is too thin, Flickr and Mapillary need the owner, Google and Yelp terms forbid it |

**Open Prices in detail.** It is the only candidate that passes all five,
and the fit looks perfect at first: every price hangs off an OpenStreetMap
id, and every store in this app is an OSM id, so matching would be exact
rather than by address. The public API on 2026-10-11 listed 7,543 locations,
380 of them in the US. A name search found two McDonald's, one in
Saint-Martin-d'Hères (France) and one in Helsingborg (Sweden), with zero
prices between them. The bigger problem is the data model: a price must name
either a barcode or an Open Food Facts food category (`en:mangoes`,
`en:leaf-vegetables`). A McChicken has no barcode and no category of its own,
so even a McDonald's receipt uploaded there could not be read back as "the
McChicken price". Worth re-checking only if Open Prices adds restaurant
menu items.

**The scraping question.** The owner's brief for this sweep dropped the
"no scraping" rule. The answer doesn't change: the app fails the republish
test by McDonald's own terms, and reading it needs a signed-in account. The
delivery storefronts fail the in-store test whatever the method.

**What was built: nothing, on purpose.** Every route to an accurate price
needs one of three things: the McDonald's app (which can't be republished and
needs a sign-in), a licence (the owner's signature), or somebody standing at
the counter (visitor logging, which the owner asked not to rely on). Open
Prices is the one legitimate automated source, and an importer for it would
have nothing to import and no way to recognise a McChicken. An estimate layer
(a nearby median for unpriced stores) was considered and rejected. It fails
the definition of accurate. The production database is empty, so it would
estimate from nothing. And the landing page promises that "not one figure on
this site is estimated".

## 2026-10-11: getting prices without people submitting them

The owner asked for accurate McChicken prices that do not depend on visitors
logging what they paid. Every route that came up, graded on four questions:
is it per store, is it accurate *now*, can it be automated, and can we use it?

| Source | Per store | Current | Automatable | Usable | Verdict |
|---|---|---|---|---|---|
| McDonald's app (the primary source) | yes | yes | only by impersonating the app | **no**: signed-in API; terms ban automated extraction | ground truth, but off limits |
| MenuPriceTracker | yes | **can't tell** | technically | needs a licence | spot-check only until licensed *and* verified |
| Datassential Price Monitor / RMS Competitor Price Intelligence | yes | monthly | yes, as a delivered feed | enterprise contract; public-display rights unknown | the only clean "buy it" route |
| McDelivery / DoorDash / Uber Eats menus | yes | yes | blocked (403) | ToS; and the price is wrong | delivery runs ~27% above in-store |
| Technomic Menu Price Pulse | no (state / metro) | quarterly | feed | enterprise | sanity band only |
| Apify "McDonald's menu" actors | no (national) | n/a | yes | paid | not per store |

### Why prices matter more now: McDonald's ML pricing engine

Reuters reported on 2026-09-29 that McDonald's runs a machine-learning engine
that produces an "optimal price" for each item at each of its ~14,000 US
restaurants. Inputs include local willingness to pay and nearby Wendy's and
Burger King menu prices. Three franchisees said it has *widened* gaps between
neighbouring stores. Reuters found a Big Mac at $5.69 at one company-run Fresno
store and $6.89 two miles away, a 21% gap, without establishing that the engine
caused it. McDonald's calls it "a tool, not a mandate" and says it does no
real-time or individual pricing. A nationwide class action filed in Chicago
(reported 2026-10-06) alleges AI-coordinated pricing; McDonald's denies it.
([CNBC](https://www.cnbc.com/2026/09/29/inside-mcdonalds-push-ai-price-big-mac.html),
[Yahoo Finance](https://finance.yahoo.com/technology/ai/articles/mcdonald-ai-pricing-engine-widening-025257931.html),
[TheNextWeb](https://thenextweb.com/news/mcdonalds-ai-pricing-engine-franchisees-reuters),
[TheStreet](https://www.thestreet.com/investing/mcdonalds-ai-pricing-franchisees-lawsuit))

Two consequences for this app. Per-store variation is now a documented,
intended feature of how McDonald's prices, which strengthens the premise. And
prices can move between monthly snapshots, so every price must carry the date
it was observed and age visibly. A number with no date is not "accurate".

### The McDonald's app: the right data, the wrong way to get it

It is the only primary source: Reuters itself used it for the Fresno check.
Everything else per-store is derived from it. But reading it programmatically
means the app's private API:

- The unofficial wrappers sign in to an account ("required for most methods",
  [reteps/mcdonalds-api-wrapper](https://github.com/reteps/mcdonalds-api-wrapper)).
  The one open-source per-store price comparer
  ([CyrilSLi/mcdonalds-price-tracker](https://github.com/CyrilSLi/mcdonalds-price-tracker))
  needs request headers captured from the app plus "the latest login refresh
  request". This is authenticated access, not reading a public page.
- McDonald's Terms of Use bar using "any unauthorized technology or automated
  system to access the online services or extract content ... including ...
  spiders, robots, screen scrapers" (as recorded by
  [ConductAtlas](https://conductatlas.com/platform/mcdonalds/mcdonalds-terms-of-use/provision/CA-P-050506/prohibition-on-automated-scraping-of-online-services/),
  document dated 2026-05-05; the
  [official page](https://www.mcdonalds.com/us/en-us/mcdonalds-app/tcen.html)
  returns 403 to automated fetches, so it was not read first-hand).
- The legal line courts have drawn is logged-in versus logged-out.
  *Meta v. Bright Data* (N.D. Cal., 2024-01-23) found logged-off scraping of
  public data was not a contract breach. *hiQ* still got in trouble for the
  accounts it created to scrape logged-in data
  ([summary](https://www.fbm.com/post/102kqw7/)). An app API behind a sign-in
  sits on the wrong side of that line, with a ToS the account holder accepted.

Decision: **this project does not build or run an app scraper.** mcbroken
famously did, for ice cream machines, but it was one person accepting that
risk on their own account. It is not a sound foundation for a public index.
That is not legal advice; if the owner ever wants to revisit it, it is a
question for a lawyer, not for code.

### MenuPriceTracker, re-checked: the dates can't be trusted

Coppell, 813 Macarthur Blvd: McChicken **$2.49**, Big Mac **$5.89**. Both are
identical to the values recorded from its 2026-08-03 data. The page now says "last verified
October 2026" and "Last updated: October 5, 2026". Unchanged prices are
possible. The problem is that the site cannot be read consistently about when
anything was refreshed:

- The homepage hero says "Last Updated: April 16, 2026", its FAQ says
  "October 2026", and its footer says "Last updated: 181 days ago" (≈ mid-April).
- The methodology says prices are "pulled from the McDonald's app" in one
  place and "collected and aggregated from publicly available sources" in
  another.
- Store pages carry templated FAQ text, reviews dated only "N months ago", and
  claims that contradict the page's own numbers (Big Mac "at or below the
  national average" next to a breakdown showing it $0.84 above the state's).
- The /about page still names an editorial lead (Joyce Kim), but the
  corrections address is obfuscated and no legal entity, API, data download or
  reuse terms are published.

The per-store numbers may well be real app scrapes. The issue is that a
"verified" date we can't trust is worse than no date, because it makes a stale
price look fresh. If the owner licenses this data, the licence has to come with
the *observation date per store*, and the import must be spot-checked against
receipts before anything is shown as current. Until then it stays what August
already said it was: a free cross-check for one store at a time.

### Delivery menus are a different price, not a noisy copy of the same one

McDonald's and DoorDash launched a no-login web ordering site for McDelivery
on 2025-08-13 (`mcdonalds.order.online`), so per-store menus are technically on
the open web. But restaurants set delivery prices themselves, and they're
higher: Gordon Haskett found a Big Mac + QPC + 20 McNuggets at $22.87 in-store
versus $28.97 on DoorDash and Uber Eats, a **27% premium**
([Restaurant Business](https://www.restaurantbusinessonline.com/technology/food-delivery-insanely-expensive-consumers-dont-seem-care)).
The markup varies by franchisee, so it can't be subtracted back out. The storefront
also answers 403 to automated fetches. The app already excludes delivery
reports from the index for exactly this reason (`tests/unit` covers it); a
delivery feed would reintroduce the same error at scale.

### Enterprise menu intelligence: the clean way to buy it

- **Datassential Price Monitor** captures "90,000 location specific major
  restaurant brand menus each month", delivered as dashboards and downloads.
  Pricing is enterprise-only
  ([Datassential](https://datassential.com/resource/datassential-ai-powered-competitive-menu-pricing-food-beverage-companies/)).
- **RMS Competitor Price Intelligence** benchmarks pricing across up to
  170,000 QSR and casual locations
  ([Restaurant Technology News](https://restauranttechnologynews.com/2023/06/revenue-management-solutions-launches-platform-that-gives-restaurant-operators-access-to-menu-price-change-data/)).
  RMS has done consulting work *for* McDonald's, which may complicate a
  licence that republishes McDonald's prices.
- **Technomic** publishes quarterly state / metro indexes and signature-item
  averages (Big Mac $5.47 in Q4 2024)
  ([Technomic](https://technomic.com/press-new-pricing-index-report)). Useful as
  a sanity band, not as store prices.

These vendors sell competitive intelligence to restaurant operators.
Whether any of them will license per-store prices for *public display* on a
free site is unknown. That's the first question to ask, before price.

### What was checked and dropped

- **Apify's McDonald's actors**: national menu with nutrition data (via a
  "DNA API"), no store input, 17 users. Not per store.
- **PriceListo** (claims 12,827 locations): 403 to automated fetches;
  method and freshness unknown.
- **McCheapest**: still defunct (see below).

### What this means for the build

1. The app needs **provenance** before it can take prices from anywhere other
   than visitors. That means a price with a source, a method, an observation
   date and a licence note, shown as such in the UI and ageing out like any
   other price. **Built 2026-10-11**: the `observations` collection, the feed
   registry in `src/lib/feeds.ts`, `npm run import:observations`, and labels
   on every surface. See the README's "Price feeds" section. The four priced
   rows in `tracker-samples.json` match 4/4 against the dev data and import
   into the emulator only; the script refuses to write an unlicensed feed
   anywhere else.
2. Which feed fills it is the owner's decision, because each option costs
   money, an email, or both: a Datassential / RMS enquiry, the MenuPriceTracker
   licensing email drafted below, or both.
3. Visitor logging stays. It isn't the source of truth the owner wants, but
   it's the only way a monthly feed learns that a price moved last Tuesday,
   and with an ML engine repricing stores, that will happen.

## The short answer (2026-08-10, superseded above)

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

*(Superseded 2026-10-11: the draft below calls this source "best-verified",
which the October re-check no longer supports. Send the revised version in
`feed-outreach.md`, which also has drafts for Datassential and RMS.)*

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
