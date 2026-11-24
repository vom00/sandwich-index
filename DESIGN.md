# Sandwich Index design

Ink on paper. A price index that reads like a newspaper's market page and a till receipt, not an app.

**Theme:** light only. The direction is print, and a dark version would be a second design rather than a toggle. `html { color-scheme: light }` keeps Android's auto-dark from inverting it.

**Source of truth:** `src/app/globals.css` (tokens and shared primitives) and `src/app/landing.css` (the landing page). If this file and the CSS disagree, the CSS wins and this file is out of date.

---

## Tokens: colour

Semantic names only. A component never holds a raw hex value; if it needs a colour that isn't here, the token list is wrong. Text contrast is checked by `scripts/check-contrast.mjs`.

| Name | Value | Token | Role |
|---|---|---|---|
| Paper | `#fbfaf7` | `--color-paper` | Page ground |
| Paper raised | `#ffffff` | `--color-paper-raised` | Cards, sheets, inputs, the receipt slip |
| Paper sunken | `#f2efe8` | `--color-paper-sunken` | Wells, the share card's ground |
| Ink | `#15140f` | `--color-ink` | Body text, the one inverted band |
| Ink muted | `#524f45` | `--color-ink-muted` | Secondary text |
| Ink subtle | `#6b675b` | `--color-ink-subtle` | Captions, eyebrows, meta |
| Rule | `#ddd8cc` | `--color-rule` | Hairlines and borders |
| Rule strong | `#15140f` | `--color-rule-strong` | Heavy rules |
| Paper muted | `#c9c4b6` | `--color-paper-muted` | Secondary text on the ink band |
| Accent | `#12395e` | `--color-accent` | Primary actions, focus ring, links on hover |
| Accent hover | `#0d2b48` | `--color-accent-hover` | Hover on the accent |
| Accent ink | `#ffffff` | `--color-accent-ink` | Text on the accent |
| Tier low | `#0f5c55` | `--color-tier-low` | Cheaper: the cheapest third of the stores loaded on the map, or the cheapest tenth nationally |
| Tier mid | `#8a5a12` | `--color-tier-mid` | The middle third, or the middle 80% |
| Tier high | `#7b2d3b` | `--color-tier-high` | Pricier: the priciest third, or the dearest tenth |
| Stale | `#6b675b` | `--color-stale` | Old prices |
| Danger | `#9a2515` | `--color-danger` | Errors, invalid fields |
| Focus | `#12395e` | `--color-focus` | The 2px focus ring |

**No red, no yellow, no golden arches.** They are McDonald's trade dress. Naming the product in copy is fine; dressing the site in its brand is not.

**Two tier scales, one set of colours.** The map and its lists split the stores they have loaded into thirds (`lib/tiers.ts`), so panning never recolours a marker. The landing page and the share cards place a price on the national scale, p10 and p90 (`lib/landing-map.ts`).

**Tiers are never colour alone.** Every tier also carries a shape (▼ cheaper, ● middle, ▲ pricier) and a text label. The three hues stay distinct under deuteranopia.

## Tokens: typography

| Family | Token | Use |
|---|---|---|
| Fraunces | `--font-display` | Headings, the footer wordmark, large statements |
| IBM Plex Sans | `--font-body` | Body copy and UI |
| IBM Plex Mono | `--font-mono` | Every price (`.tabular`), eyebrows, the menu board, share cards |

All three are self-hosted through `next/font` with matched fallback metrics, so swapping fonts shifts nothing. Plex Mono is also bundled as TTF in `assets/fonts/ibm-plex-mono` for the share cards (OFL).

### Type scale

| Role | Classes | Notes |
|---|---|---|
| Hero headline | `font-display text-5xl sm:text-7xl leading-[1.02]` | One per page |
| Page title | `font-display text-3xl sm:text-4xl leading-tight` | Store page, about |
| Chapter heading | `font-display text-[1.75rem] sm:text-4xl leading-[1.1]` | Landing chapters, with `.wr` |
| Section heading | `font-display text-2xl` | |
| Card heading | `font-display text-lg`–`text-xl` | |
| Body | `text-base` (16px), line-height 1.5 | Prose capped near `max-w-xl` |
| UI and meta | `text-sm`, `text-xs` | |
| Eyebrow | `.lp-eyebrow`: mono, 11px, `0.22em` tracking, uppercase, ink subtle | "01 · The counter" |

**Prices are always `.tabular`:** Plex Mono with tabular figures, so decimal points line up down a column. Headings balance with `text-wrap: balance`.

## Texture

| Texture | Where | How |
|---|---|---|
| Paper grain | Paper only: the pinned header | `--grain`, fractal noise at 4% in a 160px SVG tile. Felt, not seen. |
| Halftone | Ink only: the landing page's closing band (`.ink-halftone`) | Paper-coloured dots on a 9px screen at 45°, largest top-left and fading out across the band, as a print's dot coverage follows tone. Pure CSS, no image, at 9%. |

Never put grain on ink or halftone on paper, and never on buttons: a button isn't paper. Both textures are static, so they need no reduced-motion rule.

## Timing tokens

| Token | Value | Use |
|---|---|---|
| `--duration-micro` | 120ms | Press, hover colour, field border |
| `--duration-ui` | 200ms | Small state changes, arrow steps, logo tip |
| `--duration-ui-exit` | 160ms | Their exits |
| `--duration-modal` | 240ms | Dialog and sheet entrances, the check stroke |
| `--duration-modal-exit` | 190ms | Dialog and sheet exits |
| `--duration-hero` | 600ms | Page-load `.reveal` rise |
| `--ease-out-quart` | `cubic-bezier(0.165, 0.84, 0.44, 1)` | Default for UI and reveals |
| `--ease-out-expo` | `cubic-bezier(0.19, 1, 0.22, 1)` | Odometer wheels |
| `--ease-in-out-cubic` | `cubic-bezier(0.645, 0.045, 0.355, 1)` | Things that move between two resting places |

Fixed timings outside the tokens, each in one place:

| Moment | Timing | Where |
|---|---|---|
| Odometer roll | 1100ms per wheel, 70ms between wheels, `--ease-out-expo` | `.odo-col` |
| Link underline wipe | 280ms, `--ease-out-quart` | `.wipe` |
| Menu board split-flap | 75ms per flap, 30ms between turning columns, forward only, settles once | `components/landing/world/splitflap.ts` |
| Burger opening | Scroll-linked, no duration: a 30-frame clip keyed in Blender (`burger-open`, `soda-straw`) scrubbed by the beat from 0.04 to 0.76. The bun lifts and tips, the lettuce, mayo and patty part under it, the straw rises, and all of it settles back closed. Reduced motion holds frame 0 | `scripts/blender/clips.json`, `components/landing/world/world.ts` (`pose`) |
| Map pill drop-in | Once per map, when its stores first arrive: each pill drops 10px into place over 220ms, nearest the middle first, rippling outward in at most ten steps 35ms apart however many stores there are. None under reduced motion | `components/map/MapCanvas.tsx`, `VectorMapCanvas.tsx` |
| Vector map camera | Panning to a selection 240ms (`--duration-modal`); framing search results and returning from them 600ms (`--duration-hero`); both `--ease-out-quart`, instant under reduced motion | `components/map/VectorMapCanvas.tsx` |
| Map list filtering | Rows left by a search slide into the gaps (200ms, `--ease-out-quart`, Motion `layout="position"`); hidden rows fade out in 160ms | `components/map/StoreList.tsx` |
| Receipt GIF | Prints top to bottom over 1100ms, then the price wheels roll with the odometer timing; the last frame holds; plays once (no loop block) | `components/store/share-gif/` |
| Store page reveal stagger | `animation-delay` from 70ms to 280ms, in reading order | `app/store/[id]/page.tsx` |
| National price strip | Settles once when it first scrolls into view (35% visible): each column rises 10px over 200ms (`--duration-ui`, `--ease-out-quart`), 16ms apart left to right; the ring draws at 560ms over 240ms (`--duration-modal`); the "This store" label fades in at 680ms. Armed only when it starts below the fold | `components/store/PriceStrip.tsx`, `components/ui/SettleOnView.tsx` |
| "How a price gets here" receipt | Scroll-linked, no duration: each line is unclipped left to right as its step crosses the middle of the screen. Wide screens: `cover 40%` to `cover 47%` of the step's view timeline, +7% per line; narrow screens: the receipt's own view timeline, a pair of lines per step. Stops when the scroll does | `app/landing.css` (`.lp-rc-line`) |

## Motion rules

1. **Only `transform` and `opacity` animate.** Never width, height, top, padding or anything that relays out.
2. **Never `ease-in` for UI.** It withholds feedback when it is most needed and reads as lag. (A falling flap may accelerate; that is physics, not UI.)
3. **Exits run about 20% faster than entrances.** Product UI stays under 300ms; only the hero and the odometer go longer.
4. **One moment per page.** Landing: the camera pull-back from sandwich to country. Store page: the price rolling onto its card. About page: its three numbers rolling up once as it opens. Monthly story: its two state medians rolling up once as it opens. Everything else is quiet: the national strip below the fold settles once, small and in under a second, and the "How it works" receipt only follows the reader's own scroll.
5. **Nothing loops.** Every animation settles once and stops. A scroll-linked piece stops when the scroll does; the 3D canvas requests no frames while idle.
6. **Reduced motion gets the final state from the first paint.** `animation: none` rather than a shorter animation, so nothing is stranded at opacity 0. Scroll-linked pieces are not shown or not pinned, the 3D scene is one still frame, and the map to store morph becomes a crossfade.
7. **Hover is gated** behind `(hover: hover) and (pointer: fine)` so a tap doesn't leave a phantom hover.
8. **Scroll-linked effects are CSS scroll and view timelines** where possible. Where a browser lacks them, the element shows its finished state.
9. **No `will-change` left on.** CSS can't take it off after an animation, and a permanent layer costs more than the animation is worth.

## Components

| Primitive | Class | What it does |
|---|---|---|
| Press | `.press` | Scales to 0.97 on press, 120ms |
| Primary button | `.btn-primary` + `.btn-arrow` | Accent fill with depth, darker on hover, arrow steps 3px forward |
| Quiet button | `.btn-quiet` | Hairline box that lifts to white with an accent edge |
| On ink | `.btn-paper`, `.btn-quiet-ink`, `.on-ink` | The same pair for the ink band; the focus ring turns paper |
| Link | `.link-wipe` + `.wipe` | Underline wipes in from the left, stays under the current page |
| Prose link | `.link-prose` | Underline darkens; it wraps, so it isn't drawn |
| Field | `.field` | Border to accent on hover, soft halo with the focus ring |
| Chip | `.chip`, `.chip-dot` | Pill stat with an optional tier dot |
| Reveal | `.reveal` | Rises 12px over 600ms on load; stagger with `animation-delay` |
| Word rise | `.wr` / `.wr-w` | A heading's words lift in as it enters view |
| View rise | `.view-rise` | A block lifts 16px as it scrolls in |
| Odometer | `Odometer.tsx`, `.odo` | Digits on wheels; text stays the plain figure for readers |
| Check | `.check-stroke` | A tick that draws once, 240ms after an 80ms wait |
| Tap target | `.tap-target` | Grows an inline control's hit area to 44px without moving the line |
| Receipt | `components/og/receipt.tsx` | The till slip every share card is printed on |
| Receipt lines | `lib/store-card.ts` | What a store's receipt says, shared by the link card and the GIF |
| Receipt GIF | `ShareGifButton.tsx` | Draws the receipt's frames with the page's fonts, encodes them in a Web Worker (gifenc), shares on a phone, downloads elsewhere |
| Settle on view | `SettleOnView.tsx`, `[data-settle]` | Server-rendered finished; arms (`armed`) only below the fold with motion allowed, then flips to `in` once and lets CSS transitions settle it |
| Price strip | `PriceStrip.tsx` | Every nationally priced store as dots by price, this store ringed; positions precomputed by `npm run build:price-strip` |
| How-it-works receipt | `HowReceipt` in `app/page.tsx` | Sticky till slip whose lines print as the steps scroll past |
| Still this price | `StillThisPrice.tsx` | One quiet button per place a price is seen; a tap is an ordinary report of the price on file (same Turnstile, App Check and once-a-day rule), then the check tick and a dated thanks. No field, no dialog |
| Monthly story | `app/story/[month]/page.tsx`, `lib/monthly-story.ts` | One month in a few counted figures from `src/data/monthly/<yyyy-mm>.json` (`npm run build:monthly-story`). The visitor-report count is read live from the database every six hours (`lib/monthly-confirmed.server.ts`). A figure with no data sits blank in a dashed slot that says why; the introduction names every blank. Linked from the footer ("The month in prices"), the about page's feeds section and the sitemap |
| Price pill | `components/map/pill.ts`, `.marker-pill` | A store's price, tier glyph and colour on the map; one markup for both maps |
| Vector map | `VectorMapCanvas.tsx`, `lib/map-style.ts`, `.vmap` | The MapLibre map in paper and ink; pills are 44px buttons on top. Behind its flag (see The map) |
| Pill layout | `lib/pill-layout.ts` | Decides which pills show when they would overlap |
| Numbers funnel | `NumbersFunnel.tsx` | The about page's three counts (on file, priced, confirmed recently), each a subset of the one above, from the landing page's snapshot so the two never disagree; figures on the odometer, ink bars at their final width |

## Surfaces and elevation

- **Flat by default.** Cards are paper raised on a rule border; depth comes from the rule, not shadow.
- **Shadows are rare**, and tinted with ink (`rgb(21 20 15 / …)`) where they can be: the header's hairline once anything scrolls under it, the price dialog and the map's store sheet, the primary button, and the map's price pills, which need lifting off the street tiles.
- **One inverted band per page at most:** ink with paper text and the halftone, for the landing page's closing ask.
- **Radius:** `rounded-md` is the house radius for controls and cards; `rounded-full` for chips and pills; `rounded-xl`/`2xl` only for sheets and dialogs.
- **Dashed borders mean "not yet":** a held report waiting for a second sighting, a receipt's tear line.

## Layout

- 16px base, zoom left alone. Fixed header of `3.5rem`; anchors stop below it.
- Prose and forms sit in `max-w-md` to `max-w-xl` columns. Equal side gutters at every width.
- Every control is at least 44px to tap.
- The map takes the full viewport under the header; nothing else is full-bleed except the landing page's 3D stage and the ink band.

## The map

- **One map, on OpenFreeMap.** Every visitor gets the MapLibre vector map on OpenFreeMap's tiles (approved 2026-11-24; `VECTOR_TILES` in `lib/map-style.ts`, its host allowed in the CSP's `connect-src`). Setting `VECTOR_TILES` to null puts everyone back on the Leaflet map. Until the Leaflet map is removed, `/map?map=leaflet` still draws it in development, and `/map?map=vector&tiles=<TileJSON URL>` tries another host.
- **The base map is printed in the palette.**
  - Land is paper; parks and woods are paper sunken; buildings are a wash of paper muted.
  - Roads are hairlines in rule, motorways and rail in paper muted, with no casings.
  - Labels are ink, ink muted and ink subtle in Plex Mono, haloed in paper.
  - Water is the accent navy, the only colour in it, with its names reversed in paper.
  - `MAP_COLORS` mirrors the tokens by name, since a map style can't read CSS variables. `tests/unit/map-style.test.ts` holds the values equal.
- **Tier colours belong to the pills alone.** Nothing in the base map uses them.
- **Labels use the site's own font.** The glyph files in `public/map/glyphs` are drawn from Plex Mono by `scripts/build-map-glyphs.mjs`. No font is fetched from the tile host.
- **Pills never overlap on the vector map.**
  - They are ranked: the selected store first, then priced stores cheapest first, then stale ones, then unpriced. The nearest store breaks ties.
  - In that order, each pill takes its place if it has room. One without room is hidden (`data-collided`, `visibility: hidden`, `inert`) until a zoom makes room.
  - A hidden store is still a row in the list. Every shown pill is a 44px button named with its address, price and tier.

## Imagery

- **No photographs, no stock, no logos.** The pictures are data: the dot map, the price board, the receipt, a sparkline.
- The 3D scene is low-poly, muted and matte, in the palette's own colours, and every figure it shows is also written as text beside it.
- Share cards are till receipts in Plex Mono on sunken paper, printed with the date they were made.

## Do

- State what a figure is and where it came from, next to the figure.
- Use the tier shape and label as well as its colour.
- Settle every animation once and give it a reduced-motion final state.
- Reuse a token or primitive before writing new CSS.

## Don't

- Add red, yellow or anything that reads as McDonald's branding.
- Animate layout properties, loop an animation, or put more than one moment on a page.
- Put grain on ink, halftone on paper, or texture on controls.
- Write explanatory captions under pictures; say it in the copy.
- Guess a price. An unpriced store says so and invites the first report.

## Quick start

```css
/* globals.css: Tailwind v4 reads these as utilities (bg-paper, text-ink-muted, font-display, …) */
@theme {
  --color-paper: #fbfaf7;
  --color-ink: #15140f;
  --color-accent: #12395e;
  --font-display: var(--font-fraunces), Georgia, serif;
  --font-mono: var(--font-plex-mono), ui-monospace, monospace;
  --ease-out-quart: cubic-bezier(0.165, 0.84, 0.44, 1);
  --duration-ui: 200ms;
  /* full list above and in src/app/globals.css */
}
```

```tsx
<p className="tabular text-lg">$4.29</p>
<button className="btn-primary press inline-flex min-h-12 items-center rounded-md bg-accent px-5 py-3 font-medium text-accent-ink">
  Log a price <span className="btn-arrow" aria-hidden>→</span>
</button>
```

## Checking a change

After every phase, with the dev server and emulator running:

```sh
TARGET_URL=http://localhost:3100 npm run check:pages -- <label>
```

It screenshots the landing page, the map (after "Use my location"), a priced store page, the about page and the newest monthly story at 375 and 1440 px. Each gets a first screen with motion on and a full page with reduced motion, so every scroll-linked and settle-on-view piece is drawn finished. It also runs axe (WCAG 2.0 to 2.2 A and AA, plus best practice) on each. Serious and critical findings fail the run unless they are listed, with a reason, in `ACCEPTED` at the top of `tests/browser/check-pages.js`. Output goes to `tests/browser/screenshots/check/<label>/` (git-ignored): the PNGs, `axe.json` and `summary.md`.

A full-page capture never scrolls, so anything drawn only near the viewport (the reduced-motion dot map, settle-on-view pieces) can look blank in it. Check those with a real scroll before calling it a bug.
