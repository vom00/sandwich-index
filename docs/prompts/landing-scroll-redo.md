# Prompt: scroll-driven landing page for Sandwich Index

Paste everything below the line into a new Claude Code session opened on
`C:\dev\mcdonalds tracker\sandwich-index` with the model set to Fable 5.2.

---

You are the orchestrator for a redesign of the Sandwich Index landing page
(`https://sandwich-index.vercel.app`, repo `C:\dev\mcdonalds tracker\sandwich-index`).
You own this codebase. Make the design and engineering decisions yourself and work
straight through the phases below without asking for approval between them. The only
things you stop and ask the owner for are listed under "Ask first".

## Goal

Rebuild the landing page as a scroll-driven story with animated 2D and 3D elements.
Scrolling is the timeline: it moves the camera, assembles and transforms the scene,
and reveals the real numbers. It must still be the page that tells a first-time
visitor what the site is, shows live data, and sends them to the map. You may also
change other pages (header, footer, store page, map sheet, about, log) where that
makes the site feel like one product, as long as their behaviour stays the same.

Done means: a visitor on a mid-range phone and on a desktop both get a smooth,
readable, memorable page; a visitor with reduced motion, no WebGL, or a keyboard
gets the same content as a good static page; every test suite passes; nothing has
been pushed.

## What exists today (verify, don't trust this list)

- Next.js 16.3.8, React 19.2, Tailwind 4, `motion` 13, `three` 0.186.1 (already
  installed, used without React Three Fiber). Read `AGENTS.md` first: this Next
  version differs from what you know, so read the relevant guide in
  `node_modules/next/dist/docs/` before writing Next code.
- `src/app/page.tsx`: server component, sections Hero, Premise, LiveProof with
  leaderboards and `FeedSources`, HowItWorks, Contribute. Data comes from
  `getCachedIndexSnapshot()` (cached for an hour).
- `src/components/landing/scenes/`: `ClayScene.tsx` plus procedural three.js scenes
  (`kitchen.ts`, `headquarters.ts`, `logging.ts`, `stage.ts`), and `CountUpPrice.tsx`.
- Design system in `src/app/globals.css` (`@theme`): paper and ink palette, navy
  accent `#12395e`, Fraunces display, IBM Plex Sans and Mono, easing and duration
  tokens, reduced-motion blocks. Keep this editorial identity; extend the tokens
  instead of adding raw values.
- Browser suites that touch the landing page: `tests/browser/scenes.js`,
  `phase5.js`, `phase6.js`, `hydration.js`, `keyboard.js`, `nav.js`, `taptargets.js`.
  `docs/ENGINEERING.md` describes the rest.

## Hard rules (copy this block verbatim into every subagent brief)

1. Artwork: no McDonald's logos, arches, mascots, packaging, or a red and yellow
   scheme. Generic food, buildings and people only.
2. Third-party assets: CC0 only (Kenney from `https://kenney.nl/assets` is approved;
   other sources need a CC0 or equivalent licence you have read). Record every asset
   in `docs/landing-redo/ASSETS.md`: file, pack, source URL, licence, size.
3. Production CSP is enforced (`next.config.ts`): scripts, workers, fonts, models and
   textures are served from this origin only. No CDNs. Self-host any decoder
   (Draco, KTX2, Basis). Do not loosen the CSP.
4. Data: the landing page keeps showing real figures from the snapshot, the Drive
   Thru Index credit line with its link, and checked dates. Add no Firestore reads
   to the page. Never write to production; develop against the emulator on 8080 and
   never point tests at it (tests use 8085).
5. Motion: native scrolling only, no wheel hijacking. Every animation has a
   `prefers-reduced-motion` path. Animate `transform` and `opacity`; drive per-frame
   values through refs and motion values, never React state.
6. Accessibility: one `h1`, ordered headings, tap targets at least 44 px, visible
   focus, contrast per `npm run check:contrast`, the canvas is decorative
   (`aria-hidden`) and all content exists as real text in the DOM.
7. Git: work on a branch named `landing-redo`, small commits, never stage
   `.env.local`, use the attribution line the session gives you.
8. A test may change only because the page structure changed. Replace each changed
   assertion with an equivalent one and say why in the commit. Never delete a check
   to get a pass.

## Ask first

Pushing any branch, merging, deploying, or anything else that leaves this machine.
Downloads from kenney.nl, blender.org and the npm registry are pre-approved by the
owner for this task; log each one (filename, source, size) in `ASSETS.md` or the
research notes as you go. Any other download source: ask. Stop at CAPTCHAs.

## Skills

Before planning, load these with the Skill tool and say which ones you loaded:
`anthropic-skills:modern-web-design`, `anthropic-skills:motion-framer`,
`anthropic-skills:threejs-webgl`. Also useful: `anthropic-skills:web-animation-design`
(easing and duration rules) and `frontend-design`. Subagents start cold, so tell
each one which of these to load as its first step. Where a skill disagrees with the
hard rules or the existing design system, the rules and the design system win.

## Delegation

You plan, decide, write the briefs, integrate and review. Subagents do the volume.
Use the Agent tool with `model` and `effort` set per task:

| Model | Use for | Effort |
|-------|---------|--------|
| Opus 5.5 (`opus`) | Scene architecture, scroll choreography, shaders, the three prototypes, final code review of the whole diff | high or xhigh |
| Sonnet 5.5 (`sonnet`) | Section components, responsive layout, Blender scripts, asset pipeline, test updates, other-page changes, web research | medium or high |
| Haiku 5.5 (`haiku`) | Listing Kenney packs, downloading and unpacking, format conversion, screenshot capture, running suites and summarising failures, the asset manifest | low |

Every brief states: the repo path, the hard rules block, the files that agent owns,
what done looks like, and exactly what to return (paths, numbers, screenshots, not
prose). One writer per file at a time; run agents in parallel only on disjoint
files or with `isolation: "worktree"`. Two `next dev` processes cannot share
`.next` (use `NEXT_DIST_DIR`). After stopping any background task, check for and
kill leftover node or java processes. Verify what an agent reports before you
build on it.

## Phases

**1. Baseline.** Start the dev server through the preview tools. Screenshot the
current landing page at 375, 768 and 1440 px. Record Lighthouse mobile numbers
(LCP, CLS, TBT), landing-route JS size from `npm run build`, and the current pass
counts of every suite. Save to `docs/landing-redo/baseline.md`.

**2. Research.** Answer these with sources, in `docs/landing-redo/research.md`:
what the best scroll-driven pages of 2025 and 2026 do and what makes them fail on
phones; `motion` `useScroll` versus CSS scroll-driven animations
(`animation-timeline`) versus GSAP ScrollTrigger for this stack; vanilla three
versus React Three Fiber on React 19; whether smooth-scroll libraries are worth
their cost; how to keep WebGL out of the LCP path; which Kenney packs have usable
food, building, vehicle and character models (start with the food and city kits)
and their polygon and file sizes; whether Blender is needed at all.

**3. Trial and error.** Build three genuinely different directions as throwaway
routes under `src/app/lab/` (for example: one continuous 3D world the camera
travels through; pinned editorial chapters with small 3D vignettes; a mostly 2D
typographic piece with one 3D object that transforms as you scroll). A story spine
you may use or replace: one sandwich on a counter, the store around it, the map of
about 13,800 stores, the index number, the cheapest and dearest stores, how a price
gets here, your turn. For each direction capture screenshots at five scroll
positions on three widths and a frame-time trace on throttled mobile. Score them
in `docs/landing-redo/trials.md`:

| Criterion | Weight |
|-----------|--------|
| First 5 seconds explain the site and show a real number | 25 |
| Scroll feels tied to the story, not decoration | 20 |
| Frame rate and load cost on a mid-range phone | 20 |
| Fits the editorial identity | 15 |
| Degrades well (reduced motion, no WebGL, keyboard) | 10 |
| Build and maintenance cost | 10 |

Pick the winner yourself, write two sentences on why, and take good ideas from the
losers. If all three score badly on the first row, run a second round before
moving on.

**4. Assets.** Use Kenney models where they fit; restyle them (materials, palette)
to match the page. If modelling, merging, baking or optimising is needed, get the
portable Blender zip from blender.org (check `Get-PSDrive C` for space first; keep
it outside the repo in `C:\dev\mcdonalds tracker\tools\`) and run it headless
(`blender -b -P script.py`) with scripts kept in `scripts/blender/`. Ship GLB with
compressed geometry and textures. Budget: all 3D assets together under 1.5 MB
transferred, with a rendered poster image as the fallback.

**5. Build.** Implement the winner on the real route. Requirements: text and the
headline number paint before any WebGL code loads (lazy, client-only import); one
canvas; render loop paused when off screen or the tab is hidden; device pixel ratio
capped (2 desktop, 1.5 phones); everything disposed on unmount; a quality tier that
drops effects when frames run long; a static composition for reduced motion, no
WebGL and `Save-Data`. Then carry the motion language into shared elements and
other pages where it helps. Delete `src/app/lab/` and any unused old scene code.

**6. Verify.** All of these must pass, and you report the real counts:
`npm run typecheck`, `npm run lint`, `npm test`, `npm run test:emulated`
(set `FIREBASE_EMULATORS_PATH` to a writable folder), `npm run test:browser`,
`npm run test:a11y`, `npm run check:contrast`, `npm run build`. Then run the
production build locally (`next start`) and confirm zero console errors and zero
CSP violations on every page, since the CSP applies only in production. Check with
reduced motion on, with WebGL disabled, by keyboard only, and at 375, 768 and
1440 px. Targets: LCP at or under 2.5 s on Lighthouse mobile, CLS under 0.05, TBT
no more than 150 ms above the baseline, 60 fps on desktop and no sustained drop
under 30 fps on throttled mobile. If a target is missed, fix it or say so with the
measurement. Finish with an Opus review of the whole diff and act on its findings.

## When something goes wrong

- A direction cannot hit the frame budget: simplify the scene before reaching for
  another library.
- A tool or download is blocked or denied: do not route around it; use what is
  already installed or note it and continue.
- An asset's licence is unclear: do not use it.
- You are unsure whether a change to another page alters behaviour: leave that
  page alone and list it in the report.

## Out of scope

The price feeds, the Drive Thru Index reader, the production sweep and audit
scripts in `feeds/runner/`, Firestore rules, and anything on the production
database.

## Final report

1. What the page does now, in five lines, with before and after screenshots at
   three widths.
2. Which direction won and why; what was tried and dropped.
3. Measured numbers against the baseline and the targets.
4. Suite counts, each as passed/total.
5. Every download and asset, with licence.
6. Changes made to other pages.
7. Anything unfinished or not verified, stated plainly.
8. One question: push `landing-redo` for a Vercel preview, or merge to `main`
   (which deploys production)?
