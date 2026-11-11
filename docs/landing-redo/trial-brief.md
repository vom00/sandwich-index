# Trial brief (shared by all three directions)

You are building ONE of three throwaway prototypes of a new landing page for
Sandwich Index. The three are compared afterwards and one is rebuilt properly, so
what matters is that yours shows its idea at full strength, runs smoothly, and is
measured honestly. The orchestrator reads your screenshots and numbers, not your
prose.

## The product

Sandwich Index (live at sandwich-index.vercel.app) tracks what one sandwich, the
McChicken, costs at about 13,800 McDonald's restaurants in the US. Each franchisee
sets their own price, nothing official publishes them, and the gap between the
cheapest and the dearest is the story (currently about $1.19 to $5.79 nationally).
The landing page must tell a first-time visitor what this is within five seconds,
show real numbers, and send them to `/map`. The site is not affiliated with
McDonald's.

## The assignment

Rebuild the landing page as a scroll-driven story with animated 2D and 3D elements.
Scrolling is the timeline: it moves things, assembles and transforms the scene and
reveals the real numbers. A story spine you may use or reorder: one sandwich on a
counter; the same sandwich, a different price at every counter; the map of every
store; the gap (the headline number); the cheapest and dearest stores; how a price
gets here; your turn.

## Identity (keep it)

Editorial data journalism: the number is the artwork, hairline rules do the
structural work, no cards with drop shadows, no gradients, no emoji, nothing
centred by default. Tokens live in `src/app/globals.css` under `@theme`:
paper `#fbfaf7`, ink `#15140f`, muted ink, rule `#ddd8cc`, navy accent `#12395e`,
price tiers teal `#0f5c55` (cheap), ochre `#8a5a12` (middle), maroon `#7b2d3b`
(dear); Fraunces for display (`font-display`), IBM Plex Sans body, IBM Plex Mono
for labels and figures (`font-mono`, use tabular figures); easing tokens
`--ease-out-quart`, `--ease-out-expo`, `--ease-in-out-cubic`; an inverted
`on-ink` band exists for one heavy section. Use Tailwind 4 utility classes with
these tokens; do not introduce raw hex values in components when a token exists.
The 3D look is "clay": matte, soft warm light, off-white platform, muted colours
(see `COLORS` in `src/components/landing/scenes/stage.ts`).

## Hard rules

1. Artwork: no McDonald's logos, arches, mascots, packaging, or a red and yellow
   scheme. Generic food, buildings and people only.
2. Third-party assets: only the Kenney Food Kit (CC0) at
   `C:\dev\mcdonalds tracker\tools\kenney\food-kit\Models\GLB format\` (copy what
   you use, plus `Textures/colormap.png`, into your own `public/lab/<id>/` folder).
   `burger.glb` (34 KB, 294 triangles) has separate nodes `bun-bottom`, `bun-top`,
   `cheese`, `patty`, `salad`, `tomato`; a McChicken is bun, breaded chicken patty,
   lettuce, so hide cheese and tomato and retint the patty golden-brown. Also there:
   `fries.glb`, `soda.glb`, `bag.glb`, `sandwich.glb`. No other downloads of any kind.
   No new npm packages: if you believe one is essential, say so in your report
   instead of installing it.
3. Everything is served from this origin. No CDNs, no remote fonts or scripts.
   Load GLB uncompressed with `GLTFLoader` from `three/addons` (no Draco, no KTX2).
4. Real data only. The page shows figures from the snapshot (below), never an
   invented number. Add no database reads beyond the one snapshot call.
5. Motion: native scrolling only. No wheel hijacking, no smooth-scroll library, no
   `scroll-snap` that traps the reader. Animate `transform` and `opacity`. Per-frame
   values go through refs, motion values or CSS, never React state. With
   `prefers-reduced-motion: reduce` the page must read as a good static page with
   all content visible.
6. Accessibility: exactly one `h1`; heading levels never skip; every link and
   button at least 44 px tall; visible focus rings (the global ones already work);
   the canvas is `aria-hidden` and every fact it shows also exists as real text in
   the DOM; text contrast stays AA against whatever is behind it at every scroll
   position.
7. Text and the headline number must be in the server-rendered HTML and paint
   before any three.js code loads. Import three only inside a client component
   through a dynamic `import()` gated on idle or visibility (see how
   `src/components/landing/scenes/ClayScene.tsx` does it). One WebGL canvas alive
   at a time. Pause rendering when off screen or the tab is hidden; prefer
   rendering only when scroll progress or an easing value changed. Cap device pixel
   ratio at 2 (1.5 below 640 px wide). Dispose everything on unmount. If WebGL is
   missing the page still works.
8. No horizontal scrolling at 375 px. Use `svh`/`lvh` for pinned heights, never
   `dvh` for a sticky canvas (it resizes with the mobile address bar).

## What the research concluded (docs/landing-redo/research.md)

Stay on vanilla three.js (no React Three Fiber). Pin with `position: sticky` and
`100svh`. Feed the 3D scene from a plain scroll-progress number read in the render
loop. `motion` 13 (`motion/react`: `useScroll`, `useTransform`, `useSpring`,
`useReducedMotion`) is installed and fine for DOM work tied to scroll; native CSS
scroll-driven animations (`animation-timeline: view()`) are fine for simple reveals
only behind `@supports`, with content visible by default, because iOS Safari
support is unconfirmed. Mid-range phones fail on: too many draw calls, real-time
shadows over large areas, full-DPR canvases, per-frame React renders, layout
animation. Read `node_modules/next/dist/docs/` before using a Next API you are not
sure about: this is Next 16.3 with React 19.2 and it differs from older versions.

## What you can build on (read these first)

- `src/app/page.tsx`: the current landing page; copy its real copy and its
  sections (hero figure, interval bar, premise, leaderboards with `FeedSources`
  credit, three steps, contribute band) as a starting point for content.
- `src/components/landing/scenes/stage.ts`: clay helpers (`clay`, `roundedBox`,
  `buildPerson`, `walk`, `textTexture`, `COLORS`, easings) and
  `kitchen.ts`, `headquarters.ts`, `logging.ts`: three existing procedural scenes.
  You may import from these; do not edit them.
- `src/components/landing/CountUpPrice.tsx`: the hero count-up.
- Data, in a server component: `const snapshot = await getCachedIndexSnapshot(3)`
  from `@/lib/index-snapshot.server` gives `trackedStoreCount`, `pricedStoreCount`,
  `lowestPriceCents`, `highestPriceCents`, `spreadCents` (any of the three price
  fields may be null when nothing is priced; handle it plainly), and `cheapest` /
  `priciest` store lists. Format with `formatCents` / `formatCount` from
  `@/lib/money`. The local dev database holds 235 Dallas-area stores, so local
  figures are smaller than production; that is expected.
- The national dot map: `loadPriceMap()` and `priceTier()` from
  `@/lib/landing-map` (client-safe). 3,862 points `[x, y, cents, count]` in a
  1000 x 620 box, already projected (Albers USA), 13,831 stores, price scale in
  `priceCents` (min 119, p10 169, median 219, p90 289, max 579). A preview is at
  `docs/landing-redo/price-map-preview.png`. These prices come from Drive Thru
  Index, so wherever they are shown the page must carry the credit
  "Source: Drive Thru Index (https://drivethruindex.com)".

## Your files, and only yours

- `src/app/lab/<id>/` (your route: `page.tsx` server component, plus local files)
- `src/components/lab/<id>/` (your client components and scene code)
- `public/lab/<id>/` (your static assets)
- `docs/landing-redo/trials/<id>/` (your measurements, screenshots and notes)

Do not edit, move or delete any file outside those four folders: not
`globals.css`, not `package.json`, not the existing landing page. Put your CSS in a
CSS module or a stylesheet imported by your own route. Two other agents are
working in the same checkout on their own folders at the same time.

## Environment (traps included)

- Repo `C:\dev\mcdonalds tracker\sandwich-index`, branch `landing-redo`. Windows
  11; the Bash tool is Git Bash. Create and edit files with the Write and Edit
  tools; shell heredocs break on this machine.
- A dev server is ALREADY running at `http://localhost:3100`, with hot reload.
  Your page is at `http://localhost:3100/lab/<id>`. Do not start, stop or restart
  any server, do not run `npm run dev` or `npm run build`, and never kill a
  process you did not start. Ports 3000 and 8080 belong to another project: never
  touch them.
- Do not run git commands. The orchestrator commits.
- Typecheck with `npx tsc --noEmit` and lint with `npx eslint <your folders>`;
  other agents' unfinished files may show errors, so judge only your own paths.
- Playwright works only with `chromium.launch({ channel: 'msedge' })`.

## Look at your own work (required, at least three rounds)

Run the shared measurement and then open the screenshots with the Read tool and
judge them as a designer would:

`node docs/landing-redo/tools/measure.js http://localhost:3100/lab/<id> docs/landing-redo/trials/<id>`

It writes `shot-<375|768|1440>-<0..4>.png` (five scroll positions per width) and
`metrics.json` (LCP, CLS, a scroll frame trace at 375 px under 4x CPU throttling
and one at 1440 px, console noise). For a single frame use
`node docs/landing-redo/tools/shot.js <url> <out.png> <width> <height> <scrollY>`.
After each round, fix what looks wrong: overlapping or unreadable text, empty
screens, a scene that is too small or cropped, a phone layout that is only a
shrunken desktop. Budget on the 375 px trace: fewer than 5% of frames over 33 ms,
no console errors or warnings. Also check once with reduced motion
(a Playwright context with `reducedMotion: 'reduce'`) that all content is visible
and nothing animates.

## Definition of done

1. `/lab/<id>` runs from the hero through at least the map chapter and the
   cheapest/dearest stores, with the remaining sections present in simple form, at
   375, 768 and 1440 px.
2. The first screen states what the site is, shows the real headline number as
   text, and has exactly one call to action linking to `/map`.
3. Scroll visibly drives the story (not just fade-ins), and it is smooth within the
   budget above.
4. Reduced motion and no-WebGL both give a complete, readable page.
5. `docs/landing-redo/trials/<id>/NOTES.md` exists (see below) and the final
   `metrics.json` and screenshots are from your last build.

## NOTES.md and your report back

Write `docs/landing-redo/trials/<id>/NOTES.md`, at most 400 words: the idea in two
sentences; the chapter list with what scroll does in each; how it degrades; the
measured numbers (LCP, CLS, both scroll traces, JS you added); what is weak or
unfinished, stated plainly; what you would do with two more days. Then return to
the orchestrator: the same numbers, the three things that work best, the three
that work worst, and the list of files you created. Do not claim anything you did
not measure or look at.
