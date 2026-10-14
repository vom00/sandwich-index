# Price-feed outreach: drafts to send

Four drafts, in the order they're worth sending. Each needs to come from the
owner's own address, through the vendor's own contact or sales form. No
addresses are guessed here.

Status (2026-10-11):

| Draft | Status |
|---|---|
| 3. MenuPriceTracker | **Bounced.** Sent 2026-10-12 04:09 UTC from the owner's Gmail to hello@menupricetracker.com, with the owner's approval; rejected a second later with `550 5.7.1 Relaying denied` from mxa.mailgun.org. Nobody there has seen it. See below. |
| 1. Datassential | **Not sent.** The contact form is behind Google reCAPTCHA. The coding agent stops at bot checks, so the owner has to submit it. |
| 2. RMS | **Not sent.** The contact form is behind Cloudflare Turnstile. Same reason. |
| 4. Flickr API key | **Not sent.** The application needs a Flickr sign-in. |

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
`--write`, spot-check matches against real receipts, then write. docs/ENGINEERING.md's
"Price feeds" section has the steps.

---

## 1. Datassential (Price Monitor)

Contact: the form at https://datassential.com/contact-us/. Checked
2026-10-11: no email address is published, only the form, a demo request
and phone numbers. Addresses on lead-generation sites are guesses at a
pattern, so don't use them.

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

Contact: the message form at https://www.revenuemanage.com/contact. Checked
2026-10-11: no email address is published there, only the form and regional
phone numbers. One caveat before sending: RMS has done consulting work for McDonald's, so a licence to
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

## 3. MenuPriceTracker (revised again 2026-10-11, evening)

Contact: hello@menupricetracker.com. That is the address the site publishes
in its own contact data (the schema.org `Organization` block on every page),
so it isn't a guess.

**It doesn't accept mail (checked 2026-10-12).** The domain's MX records point
at Mailgun (mxa/mxb.mailgun.org, SPF `include:mailgun.org`), and Mailgun
answers `550 5.7.1 Relaying denied`: the domain is set up to send through
Mailgun but has no inbound route, so every message to any address there is
refused. Resending won't help until they fix it. The site publishes no other
contact: no form (`/contact` is a 404), no social links, and the privacy
page only says "contact us directly". The domain was registered 2026-03-09
through GoDaddy with the registrant hidden. Worth retrying now and then; a
bounce comes back within seconds, so it's cheap to tell.

The owner decided on 2026-10-11 to show MenuPriceTracker's prices while this
request is outstanding (`unlicensedUse` in `src/lib/feeds.ts`). This version
says so up front and offers to stop. It replaces the earlier draft, which
asked permission for something the site now plans to do anyway.

> **Subject:** Using your McChicken prices on Sandwich Index, with credit
>
> Hi,
>
> I run Sandwich Index, a small non-commercial site that tracks what a
> McChicken costs at each McDonald's, store by store. Your per-store pages are
> the most complete public record of those prices I've found.
>
> The site isn't public yet. When it launches, I plan to show your McChicken
> price for each store it covers. Each one will say "from MenuPriceTracker",
> link to your page for that store, and be replaced when a visitor reports a
> newer price. I read your pages no faster than your robots.txt asks.
>
> I'd much rather do this with your permission. Would you be willing to
> license your store-level McChicken prices, or simply let me show them with
> credit? If you'd prefer I didn't use them at all, tell me and I won't.
>
> One more question: is there a way to get the date each store's price was
> observed? Your store pages give a month, so for now I date each price by the
> day I read your page.
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
