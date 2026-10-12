# Design and data pass: the prompt (2026-10-11)

Written by Claude from the owner's request, then run in the same session.

---

Sandwich Index (C:\dev\mcdonalds tracker\sandwich-index): audit the whole app,
load every MenuPriceTracker price we can, redesign the site with the
frontend-design and ui-ux-pro-max skills, add a 3D animated homepage scene of
workers making a chicken sandwich, and run all visible copy through the
humanizer. Work in this order.

1. **Audit.** Run lint, typecheck, `npm test`, `test:emulated`, `test:rules`,
   `build`, `test:browser`, `test:a11y`, `check:contrast` and
   `npm audit --omit=dev`. Check README claims against the code. Fix real bugs;
   log what was found in `research/audit-log.md`.
2. **MenuPriceTracker prices.** With the dev emulator running, sync the DFW
   stores, run `npm run fetch:menupricetracker`, then import with `--write`
   (emulator only). Respect robots.txt and its 10-second delay. "All" means
   every store we have on file; the whole US (about 13,500 pages at 10 seconds
   each) is a 38-hour crawl and is out of scope for one session. If the safety
   check blocks the fetch, stop that step and report it; do not route around it.
3. **Design review.** Load `frontend-design` and `ui-ux-pro-max`. Review the
   landing, map, store, log and about pages against them and the README's
   design system. Apply what improves the site without breaking its rules:
   transform and opacity only for motion, reduced motion respected, 44px tap
   targets, WCAG AA contrast, light and dark.
4. **3D hero.** Load `web-animation-design`. Build a homepage scene in the
   spirit of the Sendoso Dribbble shot
   (https://dribbble.com/shots/26613831-3D-Animation-For-Sendoso-com): soft,
   clay-like, isometric 3D characters working a line, assembling a chicken
   sandwich (bun, patty, lettuce, mayo) and passing it along, looping.
   - No McDonald's logos, uniforms or golden arches. The site is unaffiliated
     and says so.
   - Client-only and lazy: three.js loads only on `/`, after the headline text
     paints. The headline figure stays the largest contentful paint.
   - A static fallback for `prefers-reduced-motion`, no WebGL, and slow
     devices. The scene pauses when offscreen or when the tab is hidden.
   - Decorative: `aria-hidden`, with no information that isn't also in text.
   - No layout shift: a fixed-aspect box reserved before the canvas mounts.
5. **Humanizer.** Load `humanizer`. Rewrite user-facing prose in `src/` (page
   copy, empty states, dialogs, metadata) in file mode: prose only. Keep every
   number, fact and code identifier, and update tests that pin copy.
6. **Verify and ship locally.** All suites green with counts shown; build
   clean; screenshots of the homepage at desktop and mobile, in light and dark,
   with and without reduced motion; README and audit log updated; local commits
   on the current branch; `git status` clean.

Hard limits: no push, merge or deploy. Never stage `.env.local`. Never point
integration tests at the dev emulator on 8080. Never route around a denied
action. No McDonald's trademarks in artwork.
