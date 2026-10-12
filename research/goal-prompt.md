Sandwich Index (C:\dev\mcdonalds tracker\sandwich-index): find accurate McChicken prices that need no work from the owner, build whatever you legitimately can, and finish the webapp.

ACCURATE means one price for one McDonald's store, for in-store or pickup (not delivery), with the date it was observed, from a source we may republish. Anything else is an estimate: label it "estimate" with its method, never show it as an observed price, and never let it override one.

THE OWNER DOES NOTHING. Do not end with "email X", "sign up", "pay", "check the app", or "log prices". If a source would need the owner, mark it "needs owner", add a ready draft to research/feed-outreach.md, and move on. That is not a blocker for done.

HARD LIMITS, no exceptions:
- No scraping or automating the McDonald's app or site, or DoorDash, Uber Eats, Grubhub or Google. Their terms ban automated extraction; research/price-sources.md quotes McDonald's.
- No accounts, sign-ins, CAPTCHA bypass, paid APIs, or third-party scrapers (Apify and similar).
- Never invent a price, date or source. Put a URL beside every claim.
- No push, merge or deploy. Never stage .env.local. Commit locally on the current branch only.
- Never point integration tests at the dev emulator on 8080.

WORK IN THIS ORDER:
1. Read research/price-sources.md, README.md (Status, Price feeds, Deployment) and research/audit-log.md first. Don't repeat sources already ruled out there unless you have new evidence.
2. Research new options with fresh searches: open data, government or academic datasets, licensed APIs with free tiers, franchisee or state filings, news datasets, menu-board OCR, delivery-to-in-store markup studies, and anything else. Score each one on per-store, observation date, in-store price, republish rights and zero owner effort.
3. If a source passes all five, declare it in src/lib/feeds.ts with its real licence, import it through scripts/import-observations.ts (dry run, then write to the emulator), and check that it shows up on a store page.
4. If none passes, decide whether you can build something yourself that meets the definition legally. If you can, build and test it. If not, write down why, and don't ship a substitute that pretends to be accurate.
5. Finish the webapp: fix every failing check, bug or gap you find in a page, test or README. Keep the README and research files true to the code.

DONE when ALL of these appear in this conversation:
(a) research/price-sources.md has a section dated today with a table: every candidate, a source URL, a pass/fail on each of the five criteria, and a one-line verdict.
(b) A plain statement of what was built for prices, with its test output, or why nothing could legally be built.
(c) Fresh output showing exit 0 for `npm run lint`, `npm run typecheck`, `npm test`, `npm run test:emulated`, `npm run test:rules` and `npm run build`. Also show `npm run test:browser` and `npm run test:a11y` against a running dev server and emulator.
(d) The README Status table matches reality, and every open item left is one no code can do (deployment credentials, a licence signature).
(e) `git status` is clean apart from ignored files, with the work in local commits.
(f) A final summary: price sources found, what was built, what's left for the owner and why.

Or stop after 40 turns with (f) written for wherever things stand. Each turn, state which of (a) to (f) are met.
