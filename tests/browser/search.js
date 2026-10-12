/**
 * Searching the stores on the map (src/lib/store-search.ts, MapExperience).
 *
 * What it promises:
 *   - The list and the markers filter together, and the count says how many
 *     of the area's stores match.
 *   - Abbreviations and spacing don't matter ("S MacArthur Blvd" finds "South
 *     MacArthur Boulevard"), and a receipt's restaurant number finds its store.
 *   - A search never re-ranks: a store's tier is the same with or without it.
 *   - No match says so and offers to clear; clearing brings everything back.
 *   - The search is in the address bar and survives a reload.
 *   - It works on a phone without sideways scroll.
 *
 * Needs `npm run dev` and the emulator with the saved data (restaurant numbers
 * included), like every suite here.
 */

const { chromium } = require('playwright');

const TARGET_URL = process.env.TARGET_URL || 'http://localhost:3000';
const COPPELL = { latitude: 32.9546, longitude: -96.99 };

const results = [];
function check(name, passed, detail = '') {
  results.push({ name, passed, detail });
  console.log(`${passed ? '  PASS' : '  FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
}

async function openMap(context, path = '/map') {
  const page = await context.newPage();
  await page.goto(`${TARGET_URL}${path}`, { waitUntil: 'load' });
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: /use my location/i }).click();
  await page.waitForSelector('[data-store-id]', { timeout: 30000 });
  await page.waitForSelector('.marker-pill', { state: 'attached', timeout: 30000 });
  return page;
}

async function snapshot(page) {
  // Give the filter and Leaflet a beat to settle.
  await page.waitForTimeout(400);
  return page.evaluate(() => ({
    rows: [...document.querySelectorAll('[data-store-id]')].map((row) => ({
      id: row.getAttribute('data-store-id'),
      text: row.textContent.replace(/\s+/g, ' '),
    })),
    markers: document.querySelectorAll('.marker-pill').length,
    count: document.querySelector('[aria-live="polite"]')?.textContent ?? '',
  }));
}

(async () => {
  let browser;
  try {
    browser = await chromium.launch({ channel: 'msedge' });
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      geolocation: COPPELL,
      permissions: ['geolocation'],
    });
    const noise = [];
    context.on('console', (m) => { if (m.type() === 'error') noise.push(m.text()); });

    let page = await openMap(context);
    const all = await snapshot(page);
    const box = page.getByLabel('Search these stores');
    check('the map has a labelled search box', await box.isVisible());

    // ---------------------------------------------------------------
    console.log('\nFiltering');
    // ---------------------------------------------------------------
    await box.fill('coppell');
    const coppell = await snapshot(page);
    check('a city narrows the list',
      coppell.rows.length > 0 && coppell.rows.length < all.rows.length &&
      coppell.rows.every((row) => /Coppell/i.test(row.text)),
      `${coppell.rows.length} of ${all.rows.length}`);
    check('the markers narrow with it', coppell.markers === coppell.rows.length,
      `${coppell.markers} markers, ${coppell.rows.length} rows`);
    check('the count says how many match',
      coppell.count === `${coppell.rows.length} of ${all.rows.length} stores match`, coppell.count);
    check('the search is in the address bar', /[?&]q=coppell\b/.test(page.url()), page.url());

    await box.fill('S MacArthur Blvd');
    const abbreviated = await snapshot(page);
    check('abbreviations find the spelled-out street',
      abbreviated.rows.some((row) => /South MacArthur Boulevard/.test(row.text)),
      abbreviated.rows.map((row) => row.text.slice(0, 40)).join(' | '));

    // A store with a restaurant number, found by it.
    const listing = await (await fetch(`${TARGET_URL}/api/stores?lat=${COPPELL.latitude}&lng=${COPPELL.longitude}&radiusMiles=15`)).json();
    const numbered = listing.stores.find((s) => s.restaurantNumber);
    await box.fill(`#${numbered.restaurantNumber}`);
    const byNumber = await snapshot(page);
    check('a receipt\'s restaurant number finds its store',
      byNumber.rows.length === 1 && byNumber.rows[0].id === numbered.id,
      `#${numbered.restaurantNumber} → ${byNumber.rows.map((row) => row.id).join(', ')}`);
    const marker = await page.locator('.marker-pill').first().boundingBox();
    const mapBox = await page.locator('.leaflet-container').boundingBox();
    check('the map frames the result',
      marker !== null && mapBox !== null &&
      marker.x >= mapBox.x && marker.x + marker.width <= mapBox.x + mapBox.width &&
      marker.y >= mapBox.y && marker.y + marker.height <= mapBox.y + mapBox.height);

    // Tiers are ranked across the area, not the results.
    const tierOf = (snap, id) => (snap.rows.find((row) => row.id === id)?.text.match(/(Cheapest|Middle|Priciest) third/) ?? [null])[0];
    const sample = coppell.rows.find((row) => /third/.test(row.text));
    await box.fill('coppell');
    const again = await snapshot(page);
    check('a search doesn\'t change a store\'s tier',
      sample !== undefined && tierOf(all, sample.id) === tierOf(again, sample.id),
      sample ? `${tierOf(all, sample.id)} → ${tierOf(again, sample.id)}` : 'no tiered row');

    // ---------------------------------------------------------------
    console.log('\nNo match, and clearing');
    // ---------------------------------------------------------------
    await box.fill('zzzz');
    await page.waitForTimeout(300);
    const empty = (await page.locator('aside').innerText()).replace(/\s+/g, ' ');
    check('no match says so', /No store here matches “zzzz”/.test(empty), empty.slice(0, 100));
    check('and shows no markers', (await snapshot(page)).markers === 0);
    await page.getByRole('button', { name: 'Clear search' }).first().click();
    const cleared = await snapshot(page);
    check('clearing brings every store back',
      cleared.rows.length === all.rows.length && cleared.markers === all.markers,
      `${cleared.rows.length} rows, ${cleared.markers} markers`);
    check('and takes the search out of the address bar', !/[?&]q=/.test(page.url()), page.url());
    await page.close();

    // ---------------------------------------------------------------
    console.log('\nA shared link');
    // ---------------------------------------------------------------
    page = await openMap(context, '/map?q=coppell');
    const shared = await snapshot(page);
    check('a ?q= link opens with the search applied',
      (await page.getByLabel('Search these stores').inputValue()) === 'coppell' &&
      shared.rows.length === coppell.rows.length,
      `${shared.rows.length} rows`);
    await page.close();

    check('nothing is logged to the console', noise.length === 0, noise.slice(0, 2).join(' | '));
    await context.close();

    // ---------------------------------------------------------------
    console.log('\nPhone');
    // ---------------------------------------------------------------
    const phone = await browser.newContext({
      viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true,
      geolocation: COPPELL, permissions: ['geolocation'],
    });
    page = await openMap(phone);
    const phoneBox = page.getByLabel('Search these stores');
    const size = await phoneBox.boundingBox();
    check('the search box is a full-size tap target', size !== null && size.height >= 44, `${size?.height}px`);
    await phoneBox.fill('irving');
    check('it filters on a phone too', (await snapshot(page)).rows.every((row) => /Irving/i.test(row.text)));
    check('nothing scrolls sideways',
      await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await phone.close();
  } catch (error) {
    check('suite ran to completion', false, error.message);
    console.error(error);
  } finally {
    if (browser) await browser.close();
    const passed = results.filter((r) => r.passed).length;
    console.log(`\n${'='.repeat(64)}`);
    console.log(`Store search: ${passed}/${results.length} passed`);
    for (const r of results.filter((x) => !x.passed)) console.log(`  - ${r.name}${r.detail ? `  [${r.detail}]` : ''}`);
    console.log('='.repeat(64));
    process.exit(passed === results.length ? 0 : 1);
  }
})();
