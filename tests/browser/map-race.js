/**
 * The stale-load race on /map.
 *
 * `load()` in MapExperience awaits a store fetch and then an Overpass sync, and
 * "Change location" stays reachable the whole time. If an abandoned run is
 * allowed to finish writing, its `setStores` lands after its replacement's — and
 * because `locationLabel` is set synchronously by the new selection while the
 * list came from the old one, the page renders a confident, wrong pairing:
 * "Stores near <new ZIP>" above the previous ZIP's restaurants.
 *
 * This drives that exact sequence with the first ZIP's response held open, so it
 * fails against the unguarded version and passes against the generation guard.
 *
 * Usage: TARGET_URL=http://localhost:3000 node tests/browser/map-race.js
 */
const { chromium } = require('playwright');

const TARGET = process.env.TARGET_URL || 'http://localhost:3000';

// Two ZIPs far enough apart that their store sets cannot overlap.
const SLOW_ZIP = '75019'; // Coppell, TX
const FAST_ZIP = '90012'; // Los Angeles, CA

let passed = 0;
let failed = 0;
function check(name, ok, detail) {
  if (ok) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failed += 1;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ''}`);
  }
}

async function enterZip(page, zip) {
  await page.getByLabel(/enter a zip code/i).fill(zip);
  await page.getByRole('button', { name: /show stores/i }).click();
}

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: false });
  const context = await browser.newContext();
  const page = await context.newPage();

  // Hold the first /api/stores response open until we release it. Only the
  // first — the replacement load must be allowed to complete normally.
  let releaseFirst;
  const firstHeld = new Promise((resolve) => { releaseFirst = resolve; });
  let seenFirst = false;
  let heldUrl = null;

  await page.route('**/api/stores?*', async (route) => {
    if (!seenFirst) {
      seenFirst = true;
      heldUrl = route.request().url();
      await firstHeld;
    }
    await route.continue();
  });

  // The sync is irrelevant to this race and slow; stub it to a no-op so the
  // test measures the store fetch rather than Overpass's mood.
  await page.route('**/api/stores/sync', (route) =>
    route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({ found: 0, created: 0, addresses: { resolved: 0 } }),
    }),
  );

  console.log(`\nStale-load race on /map  (${TARGET})\n`);

  try {
    await page.goto(`${TARGET}/map`, { waitUntil: 'domcontentloaded' });

    // --- start a load for the slow ZIP, then abandon it ---
    await page.getByLabel(/enter a zip code/i).waitFor({ state: 'visible', timeout: 15000 });
    await enterZip(page, SLOW_ZIP);

    await page.waitForTimeout(500);
    check('first load is genuinely in flight', seenFirst && heldUrl !== null,
      `seenFirst=${seenFirst}`);

    const changeLocation = page.getByRole('button', { name: /change location/i });
    await changeLocation.waitFor({ state: 'visible', timeout: 10000 });
    check('"Change location" is reachable while the first load is pending', true);
    await changeLocation.click();

    // --- second load, allowed to run to completion ---
    await page.getByLabel(/enter a zip code/i).waitFor({ state: 'visible', timeout: 10000 });
    await enterZip(page, FAST_ZIP);

    // Wait for the *list*, not the heading. The heading is driven by
    // `locationLabel`, which is set synchronously by the selection — it is
    // already correct while the stores are still loading, which is precisely
    // the window this race exploits.
    await page.waitForFunction(
      (zip) => {
        const h1 = document.querySelector('h1');
        const headingReady = h1 !== null && h1.textContent.includes(zip);
        return headingReady && document.querySelectorAll('[data-store-id]').length > 0;
      },
      FAST_ZIP,
      { timeout: 20000 },
    );

    const settledCount = await page.locator('[data-store-id]').count();
    check('the replacement load settled with its own stores', settledCount > 0,
      `list was empty for ${FAST_ZIP}`);

    // --- now let the abandoned run finish and try to write ---
    releaseFirst();
    await page.waitForTimeout(2500);

    const heading = await page.getByRole('heading', { level: 1 }).innerText();
    const afterCount = await page.locator('[data-store-id]').count();

    check('heading still names the location the user actually chose',
      heading.includes(FAST_ZIP), `heading was "${heading}"`);

    check('abandoned load does not overwrite the store list',
      afterCount === settledCount,
      `list went ${settledCount} → ${afterCount} after the stale response landed`);

    // The strongest form: whatever is listed must belong to the second ZIP.
    // Coppell and Los Angeles share no stores, so any overlap is the bug.
    const staleIds = await page.evaluate(async (url) => {
      const response = await fetch(url);
      const body = await response.json();
      return (body.stores ?? []).map((s) => s.id);
    }, heldUrl);

    const shownIds = await page.locator('[data-store-id]').evaluateAll((nodes) =>
      nodes.map((n) => n.getAttribute('data-store-id')),
    );
    const bleed = shownIds.filter((id) => staleIds.includes(id));

    check('no store from the abandoned location is on screen',
      bleed.length === 0,
      `${bleed.length} leaked: ${bleed.slice(0, 3).join(', ')}`);

    const syncingVisible = await page
      .locator('text=/updating|syncing/i')
      .count();
    check('the abandoned run did not leave a spinner behind', syncingVisible === 0);

    await page.screenshot({
      path: require('path').join(__dirname, 'screenshots', 'map-race.png'),
    });
  } catch (error) {
    failed += 1;
    console.log(`  FAIL  suite threw — ${error.message}`);
  } finally {
    await browser.close();
  }

  console.log(`\n${passed} passed, ${failed} failed`);
  console.log('Screenshot: tests/browser/screenshots/map-race.png');
  process.exit(failed === 0 ? 0 : 1);
})();
