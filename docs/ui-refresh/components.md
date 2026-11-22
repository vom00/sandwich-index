# UI refresh: components

Research done 2026-11-22 on the three sites the owner named. The goal is a more
polished site that feels more alive; motion is in service of that, not the goal.

## The three sources

| Site | What it is | Licence / terms | How we use it |
|------|-----------|-----------------|---------------|
| [Ruixen UI](https://ruixen.com/) | Copy-paste React + Tailwind + `motion/react` components for shadcn ("240+ sections and components"). Installed with the shadcn CLI. | The docs say "The free open-source catalog stays free, MIT-licensed." No LICENSE file found in the repo link tried (404). Ruixen Pro ($99) is separate. Some components play a "Web Audio click" by default. | Ideas reimplemented in our own code (no shadcn setup, no `cn`/`clsx` dependency, no sound). |
| [Rare UI](https://www.rareui.com/) | 31 single-file animated React components using `motion`, installed with the shadcn CLI. | "MIT with the Commons Clause and an attribution requirement": free in commercial projects, but a site shipping a Rare UI component must show a visible link back to rareui.com, and the components may not be redistributed. | Ideas reimplemented in our own code, so no Rare UI source ships and no credit link is owed. |
| [ashenoneport.com](https://ashenoneport.com/) | A content creator's portfolio (not a component library). | No licence. A design reference only; nothing copied. | Patterns: frosted pinned nav, pill stat chips, edge-faded marquee, headings that fill in word by word as they scroll in. |

Nothing from any of the three is copied. Every item below is written from
scratch on our tokens (`src/app/globals.css`), mostly in CSS, so the landing
page ships no new JavaScript and no new dependency.

## Shortlist (13)

| # | Pattern | Source it came from | Where it goes | Motion | Status |
|---|---------|--------------------|---------------|--------|--------|
| 1 | Frosted pinned header | Ashen nav; Ruixen "Navbar Minimal" | `SiteHeader` on every page | Paper turns translucent with blur and a hairline shadow once the page scrolls (scroll-linked opacity) | reimplemented |
| 2 | Animated link | Ruixen [Animated Link](https://ruixen.com/docs/components/animated-link) | Header nav, footer links, inline text links | Underline wipes in from the left on hover; the current page keeps it | reimplemented |
| 3 | Arrow button | Ruixen [Animated Link](https://ruixen.com/docs/components/animated-link) arrow lift; Rare UI buttons | Primary calls to action ("Find prices near you", "Log the first price") | Arrow slides 3px on hover; press scale kept | reimplemented |
| 4 | Stat chips | Ashen hero chips | Landing hero "Cheapest / Priciest / priced", map chapter key | Static; colour dot per tier | reimplemented |
| 5 | Price ticker | Ashen brand marquee | Landing, between the story and the cheapest/dearest lists | Slow edge-faded marquee of real store prices; pauses on hover/focus; a plain scrollable row under reduced motion | reimplemented |
| 6 | Word rise | Ruixen [Scroll Text Rise](https://ruixen.com/docs/components/scroll-text-rise); Ashen heading fill | Section headings on the landing, store, about pages | Words rise and fade in, staggered, as the heading scrolls into view (page scroll, not a nested scroller) | reimplemented |
| 7 | Odometer number | Rare UI [Animated counter](https://www.rareui.com/components/animatedcounter) | Store price, landing end figures, map-chapter count | Digits roll up on wheels when the number comes into view | reimplemented |
| 8 | Scroll progress | Rare UI Scroll Progress | Under the header on the landing page and About | Thin accent line scales with page scroll | reimplemented |
| 9 | Rail table of contents | Rare UI Rail TOC | About page, wide screens | Active section marked on a rail as you read | reimplemented |
| 10 | Row hover | Ruixen [Editorial Accordion](https://ruixen.com/docs/components/accordion-editorial) 1px nudge | Store rows (landing lists, map list) | Row nudges right and an arrow fades in | reimplemented |
| 11 | Bottom sheet entrance | Ruixen Bottom Drawers | Map store sheet | Springs up from the bottom (phone) or in from the right (desktop) | reimplemented |
| 12 | Wordmark footer | Ruixen [Wordmark Footer](https://ruixen.com/docs/components/wordmark-footer) | Footer on every page | Large half-cut "Sandwich Index" wordmark rises as the footer scrolls in | reimplemented |
| 13 | Page entrance | Rare UI / Ruixen section reveals | Map gate, store, about, log, 404 headers | Existing `rise` keyframe, staggered | reimplemented (existing keyframe) |

## Where each one ended up

| # | Pattern | Code | Used on |
|---|---------|------|---------|
| 1 | Frosted pinned header | `.site-header` in `globals.css` | Every page |
| 2 | Animated link | `.link-wipe` + `.wipe` (nav, back links); `.link-prose` (inline links) | Header, footer, store, about, map, landing |
| 3 | Arrow button | `.btn-primary`, `.btn-quiet`, `.btn-paper`, `.btn-quiet-ink`, `.btn-arrow`, `.btn-arrow-back` | Every primary and secondary button |
| 4 | Stat chips | `.chip`, `.chip-dot` | Landing hero |
| 5 | Price ticker | `src/components/ui/Ticker.tsx` | Landing, between the story and the lists |
| 6 | Word rise | `src/components/ui/WordRise.tsx` | Landing chapter and section headings, store and about section headings |
| 7 | Odometer number | `src/components/ui/Odometer.tsx` | Landing end figures and blank count, store price, map sheet price, log counts, 404 |
| 8 | Scroll progress | `src/components/ui/ScrollProgress.tsx` | Landing, about |
| 9 | Rail table of contents | `src/components/ui/RailToc.tsx` | About (1024px and up) |
| 10 | Row hover | `.row-go`, `.map-row`, `.log-rows` | Landing lists, map list, store report tables |
| 11 | Sheet entrance | `motion` spring in `StoreSheet.tsx` and `SubmitPriceDialog.tsx` | Map store sheet, submit dialog |
| 12 | Wordmark footer | `.footer-wordmark` | Every page |
| 13 | Page entrance | existing `.reveal` (`rise`) | Map gate, store, about, log, 404, error |

Also added on the same tokens: `.field` (text-field hover and focus halo), a focus
ring that keeps rounded corners, and raised cards for the store price, the area
comparison, the price chart and the ZIP form.

## Looked at and rejected

- Rare UI Fluid Orb, Matrix orb, Gravity Letters, Grid Reveal, Gooey nav: decorative, compete with the prices.
- Rare UI AI kit (prompt box, streaming response, model picker) and Ruixen Glass AI Card: no fit.
- Ruixen Magnetic Tabs: plays a sound by default, and the site has no tabs.
- Ruixen Animated Number Flip: the odometer covers number changes better.
- Rare UI Toast: price submission already confirms inline, and the tests depend on that text.
- Ashen full-bleed photo background and scattered cards: fights the ink-on-paper identity and hurts reading.

## Dependencies added

None. `motion` was already installed (used by the store sheet and the submit dialog).
