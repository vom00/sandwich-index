# Price-feed outreach: drafts to send

Four drafts, in the order they're worth sending. None has been sent. Each
needs to come from the owner's own address, through the vendor's own contact
or sales form. No addresses are guessed here.

What every reply has to settle before any data is imported (see
`price-sources.md` for why):

1. **Public display rights.** These vendors sell competitive intelligence to
   restaurant operators; showing prices to the public may not be something
   they license at all. Ask first, before price.
2. **An observation date per store.** A monthly file stamped with one date is
   not enough: MenuPriceTracker's dates did not survive inspection, and
   McDonald's per-store ML pricing means prices move between snapshots. The
   import rejects undated rows.
3. **McChicken specifically, at store level, for US locations.** Not a metro
   average, not a "chicken sandwich" category.
4. **Attribution terms**, which become the feed's `licence` and `method`
   fields in `src/lib/feeds.ts`, shown beside every price.

Once a licence exists: declare the feed in `src/lib/feeds.ts`, export its data
in the `parseFeedFile` format, run `npm run import:observations` without
`--write`, spot-check matches against real receipts, then write. The README's
"Price feeds" section has the steps.

---

## 1. Datassential (Price Monitor)

Contact: the sales / contact form at https://datassential.com

> **Subject:** Licensing store-level menu prices for public display
>
> Hello,
>
> I run Sandwich Index, a free site that shows what a McDonald's McChicken
> costs at each US restaurant. It's a small, non-commercial project.
> Franchisees set their own prices, and the variation between neighbouring
> stores is the point of the site.
>
> I understand Price Monitor captures location-specific menus for major chains
> each month. My first question is whether you license store-level prices for
> public display on a website, with attribution. If you do, I'd like to know:
>
> - whether your coverage includes the McChicken at individual US McDonald's
>   locations (Dallas-Fort Worth first, then nationally)
> - whether each store's price carries the date it was observed
> - what attribution you'd require, and whether you deliver by file or API
> - what it would cost for a non-commercial project
>
> The site shows every price with its source and date, so yours would be
> credited to Datassential by name.
>
> Thank you,
> [name]
> Sandwich Index

## 2. Revenue Management Solutions (Competitor Price Intelligence)

Contact: RMS's sales contact form on its own website. One caveat before
sending: RMS has done consulting work for McDonald's, so a licence to
republish McDonald's store prices may be off the table for them regardless of
price. Asking costs nothing.

> **Subject:** Store-level menu price data for a public, non-commercial site
>
> Hello,
>
> I run Sandwich Index, a free, non-commercial site that tracks the price of
> a McDonald's McChicken restaurant by restaurant across the US. Each price is
> shown publicly with its source and date.
>
> Is store-level data from Competitor Price Intelligence ever licensed for
> public display, with attribution? If so, I'd like to know whether it covers
> the McChicken at individual US McDonald's locations, whether each price
> carries its own observation date, and what terms and pricing would apply to
> a non-commercial project.
>
> If public display isn't something you offer, a short "no" would help me too.
>
> Thank you,
> [name]
> Sandwich Index

## 3. MenuPriceTracker (revised 2026-10-11)

Contact: the corrections address on https://menupricetracker.com/about. It is
obfuscated on the page, so read it in a browser.

The August draft called this "the best-verified public source I've found".
After the 2026-10-11 re-check that is no longer accurate, so this version
replaces it. The new draft asks the question that check raised: when was each
store's price actually observed?

> **Subject:** Licensing store-level McChicken prices, with observation dates
>
> Hi,
>
> I run Sandwich Index, a small non-commercial site that tracks what a
> McChicken costs at each McDonald's, store by store. Your per-store pages are
> the most complete public record of those prices I've found.
>
> Would you be open to licensing your store-level McChicken prices for display
> with attribution, starting with the roughly 276 Dallas-Fort Worth locations?
> Each price would appear as "from MenuPriceTracker, observed [date]", link to
> your page for that store, and be replaced when a visitor reports a newer
> price.
>
> I'd need the date each store's price was actually observed. Your pages show a
> few different "last updated" dates, and I can't honestly show a price without
> knowing when it was seen.
>
> Happy to discuss terms either way.
>
> Thanks,
> [name]
> Sandwich Index

## 4. Flickr API key (free; expected yield tiny)

Where: the key application linked from
https://www.flickr.com/services/api/misc.api_keys.html. Flickr asks for "a
brief explanation of how you're planning to use it"; the text below is that
explanation.

Listed because the 2026-10-11 second sweep in `price-sources.md` marks it
"needs owner", not because it's likely to pay off. A usable photo has to be
Creative Commons, geotagged to one restaurant, taken in the last 90 days, and
show a legible McChicken price. Wikimedia Commons had six relevant photos,
and the newest located US menu board was from 2013. Expect a handful
nationwide. Searching and matching photos to stores is code that can be
written once a key exists. Reading the price off each photo would still need
a check before anything is imported.

> Sandwich Index is a free, non-commercial site that shows what a McDonald's
> McChicken costs at each US restaurant. I'd use the API to find recent,
> geotagged, Creative Commons photos of McDonald's menu boards, read the
> McChicken price from the board, and show it on that restaurant's page with
> the photographer's name, the licence and a link back to the photo on
> Flickr. No photos would be copied or rehosted.
