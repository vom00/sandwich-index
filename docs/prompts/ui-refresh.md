## Objective
Refresh the UI of every page of Sandwich Index so it looks more polished and feels more alive, using component ideas from https://ruixen.com/, https://www.rareui.com/ and https://ashenoneport.com/. Polish comes first; motion supports it, never the other way round.

## Context (carry forward)
- Repo: `C:\dev\mcdonalds tracker\sandwich-index`. Next.js 16.3 (read `node_modules/next/dist/docs/` before using any Next API), React 19.2, Tailwind 4, TypeScript with `noUncheckedIndexedAccess`; `motion` and `lucide-react` are already installed. Live at sandwich-index.vercel.app; a push to `main` deploys production.
- Pages: `/` (`src/app/page.tsx`, `src/components/landing/`: a scroll-driven three.js world, just shipped; keep its 3D scene, camera path and story), `/map` (`src/components/map/`), `/store/[id]` (`src/components/store/`), `/log` (`src/components/log/`), `/about`, not-found and error pages. Shared chrome in `src/components/ui/` (SiteHeader is pinned: `sticky top-0 z-[1500]`). Tokens in `src/app/globals.css`, landing styles in `src/app/landing.css`.
- Current look: calm editorial. Paper background `#fbfaf7`, ink text, navy accent `#12395e`, serif display headlines, mono figures; price tiers teal (cheap), amber (middle), maroon (dear). Refine this identity; do not replace it.
- Existing hard rules: no McDonald's logos, arches, or red/yellow brand colours in artwork. Production enforces a strict CSP, so nothing loads from a third-party origin at runtime (self-host every font, image and script). Firestore is on the free quota: the dev server uses the emulator, never production data.
- Local setup: ports 3000 and 8080 belong to another project; never use, touch or kill them. Start `npm run emulators:alt` (Firestore 8180, Auth 9198, with `FIREBASE_EMULATORS_PATH=C:/dev/mcdonalds tracker/tools/firebase-emulators`) and the preview config `sandwich-index-alt` (port 3100). Browser suites: `TARGET_URL=http://localhost:3100 FIRESTORE_EMULATOR_HOST=127.0.0.1:8180 FIREBASE_AUTH_EMULATOR_HOST=127.0.0.1:9198 node tests/browser/<suite>.js`.

## Step 1: Research (deliverable `docs/ui-refresh/components.md`)
- Read all three sites, including component pages and live demos, not only the home pages. For each candidate record: name, source URL, what it does, the licence or terms for copying its code, which element of Sandwich Index it would improve, and the motion it adds.
- Shortlist 8 to 15 components that suit a calm, data-first editorial site. Reject anything that is a gimmick, fights the identity above, needs a runtime CDN, or makes prices harder to read.
- Copy code only when its licence clearly allows it, and record that licence. Otherwise rebuild the idea in our own code and mark it "reimplemented".

## Step 2: Implement (branch `ui-refresh`, off `main`), one commit per phase
1. Foundations: buttons, links, inputs, focus rings, cards, badges, header, footer, page entrances.
2. Landing chrome: chapter text, hero figure, call to action, credit lines, map legend (HTML around the canvas only).
3. Map page: location gate, store list, store sheet, controls.
4. Store page: price card, history chart frame, comparison, observation log, submit dialog, read-from-photo.
5. Log page, About, 404 and error pages.

## Constraints
- Every animation MUST honour `prefers-reduced-motion` (show the final state instantly) and MUST animate only transform and opacity. No scroll-jacking beyond the existing landing story.
- Keep all text, figures and links as they are unless a component needs a label; never invent copy or numbers.
- Touch targets at least 44 px, visible keyboard focus, and `npm run check:contrast` passes.
- Add a runtime dependency only if it removes real work and is small (under 15 KB gzipped); record each one with its licence in `docs/ui-refresh/components.md`. Prefer `motion` and CSS.
- Change UI only: `src/app/**`, `src/components/**`, new static files in `public/`. Do NOT touch `src/lib/**`, API routes, Firestore rules, `feeds/`, data scripts, `.env*`, or the scene code in `src/components/landing/world/world.ts`.
- Only make the changes asked for here. Never stage `.env.local`. Commits end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Acceptance Criteria
- [ ] `docs/ui-refresh/components.md` lists the shortlist with source, licence and target for each item.
- [ ] Every page shows the refresh at 390 px and 1440 px (Playwright screenshots), with no sideways scroll and the header pinned.
- [ ] `npx tsc --noEmit`, `npx eslint .`, `npm test` and `npm run check:contrast` pass.
- [ ] Every suite in `tests/browser/` passes against port 3100. Change a test's selectors only where the markup it checks was deliberately changed, and say which.
- [ ] With reduced motion emulated, nothing animates and nothing stays hidden.
- [ ] `node scripts/dev-alt.mjs --build --dist .next-build` succeeds, and the browser console is clean on every page.

## Action Boundaries
- Go through the research and all five phases without waiting for approval. Send a short progress note and before/after screenshots at the end of each phase.
- Stop and ask before: pushing or merging to `main`, deleting a page or user-facing feature, changing data or API behaviour, or writing to production Firebase.
- If a suite still fails after three fix attempts, stop and report it with the output.

## Progress Evidence
Back every claim with a tool result: screenshot paths, test output, commit hashes. Finish with what changed on each page, which components were used and from which site, and the question of whether to push.

## Session Strategy
Continue in the current session: the context above is already loaded.
