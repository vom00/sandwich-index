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
| Map list filtering | Rows left by a search slide into the gaps (200ms, `--ease-out-quart`, Motion `layout="position"`); hidden rows fade out in 160ms | `components/map/StoreList.tsx` |
| Receipt GIF | Prints top to bottom over 1100ms, then the price wheels roll with the odometer timing; the last frame holds; plays once (no loop block) | `components/store/share-gif/` |
| Store page reveal stagger | `animation-delay` from 70ms to 280ms, in reading order | `app/store/[id]/page.tsx` |

## Motion rules

1. **Only `transform` and `opacity` animate.** Never width, height, top, padding or anything that relays out.
2. **Never `ease-in` for UI.** It withholds feedback when it is most needed and reads as lag. (A falling flap may accelerate; that is physics, not UI.)
3. **Exits run about 20% faster than entrances.** Product UI stays under 300ms; only the hero and the odometer go longer.
4. **One moment per page.** Landing: the camera pull-back from sandwich to country. Store page: the price rolling onto its card. Everything else is quiet.
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
