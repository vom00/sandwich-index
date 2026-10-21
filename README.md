# Sandwich Index

What a McChicken costs at each McDonald's, store by store. The site is live at
https://sandwich-index.vercel.app.

Most McDonald's restaurants in the US are run by franchisees, and each one sets
its own menu prices. Two stores a few miles apart can be more than a dollar
apart on the same sandwich, and McDonald's doesn't publish any of it, so you
usually find out at the register. Sandwich Index writes the prices down.

Every McDonald's in the US is on the map. Most of the prices so far are
around Dallas-Fort Worth, where the site started.

> Sandwich Index is not affiliated with, endorsed by, or sponsored by
> McDonald's Corporation. "McDonald's" and "McChicken" are trademarks of
> McDonald's Corporation, used here only to describe the product being tracked.

## Where the prices come from

Every price on the site says where it came from and when.

Visitors log what they paid, from a receipt, the menu board or the McDonald's
app. The site can read the price off a photo of a receipt or an app screenshot.
That reading happens in your browser, and the photo is never uploaded.

The rest come from MenuPriceTracker, a site that says it reads its prices from
the McDonald's app. Those prices are shown under its name, with a link to its
page for that store. We asked MenuPriceTracker for permission to use them, but
the email bounced and the site lists no other contact. If they ask us to stop,
the feed comes down.

A price a visitor logs replaces an older listing. Old prices are marked as old
and left out of the comparisons.

Store locations and the restaurant numbers printed on receipts come from
[All The Places](https://www.alltheplaces.xyz), a public-domain dataset that
ships with the server. The first stores, around Dallas, came from
[OpenStreetMap](https://www.openstreetmap.org), which still covers anywhere
outside the US. The code never contacts a McDonald's website.

## What's on the site

The home page leads with the gap between the cheapest and the priciest
McChicken in the index, and lists the stores at each end. The map shows the
stores around you, each marked as the cheapest, middle or priciest third of
the area, and you can search it by street, city, ZIP or restaurant number.
Each store has a page with its current price, how it compares with stores
nearby, and every report anyone has made. There's also a page for logging
prices at several stores in one go.

## How it's built

Next.js 16 and React 19, deployed on Vercel. Firestore holds the stores,
prices and reports. Anonymous Firebase sign-in means nobody needs an account
to log a price. The map is Leaflet on OpenStreetMap tiles, the 3D scenes on
the home page are three.js, and the photo reader is Tesseract running in the
browser.

The longer notes are in [docs/ENGINEERING.md](docs/ENGINEERING.md). They
cover the data model, how wrong or abusive reports are handled, how price
feeds work, and how the site is deployed. The `research/` folder has the
search for price sources and an audit log of the work so far.

## Running it locally

You need Node 20.9 or newer, and Java for the Firestore emulator.

```bash
npm install
```

```bash
cp .env.local.example .env.local
```

Start the Firebase emulator in one terminal, with an empty database:

```bash
npm run emulators:clean
```

In a second terminal, fill it with real store locations from OpenStreetMap
and made-up prices, then start the site on http://localhost:3000:

```bash
npm run seed
```

```bash
npm run dev
```

The local setup uses a `demo-` Firebase project, which the Firebase SDKs
refuse to connect to production, so nothing you do locally can reach the live
database. The seed script also refuses to run against anything but the
emulator.

### Tests

```bash
npm test
```

```bash
npm run test:emulated
```

```bash
npm run test:browser
```

```bash
npm run test:a11y
```

`npm test` runs the unit tests and needs nothing else. `test:emulated` adds
the integration and security-rule tests, on a separate emulator it starts
and wipes by itself. The browser and accessibility suites drive a real
browser against `npm run dev`, so the site and the emulator have to be
running first.

## Known gaps

The photo reader has only been tested on mock receipts and screenshots, so
real photos may trip it up. App Check (Firebase's bot protection for the
price form) is switched off until its reCAPTCHA key is set up. And the site
runs on Firestore's free plan, which caps reads per day, so a busy day can
run it out until the quota resets at midnight Pacific.
