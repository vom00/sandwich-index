/**
 * The vector map (MapLibre), behind its flag: `/map?map=vector` in development.
 *
 * What it promises:
 *   - The flag is off by default: /map is still the Leaflet map.
 *   - Every store in the list has a pill, and no two pills that are shown
 *     overlap: a pill with no room is hidden, out of the tab order and away
 *     from screen readers, until a zoom gives it room.
 *   - Pills keep the Leaflet map's markup and accessible names; a pill click
 *     opens the store's sheet, and the selected pill is always shown.
 *   - A search leaves pills only for the stores it found.
 *   - The pills drop in once as the area loads, then stop; under reduced
 *     motion they are simply there.
 *
 * Runs with no tile source, so it needs nothing outside this machine: the map
 * draws its paper ground and the pills. Needs the dev server and emulator.
 */
const { chromium } = require('playwright');

const TARGET_URL = process.env.TARGET_URL || 'http://localhost:3000';
const COPPELL = { latitude: 32.9546, longitude: -96.99 };

const results = [];
function check(name, passed, detail = '') {
  results.push({ name, passed, detail });
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? `  [${detail}]` : ''}`);
}

async function openMap(context, query = '?map=vector') {
  const page = await context.newPage();
  await page.goto(`${TARGET_URL}/map${query}`, { waitUntil: 'load' });
  await page.getByRole('button', { name: /use my location/i }).click().catch(() => {});
  await page.waitForSelector('.vmap-marker, .leaflet-marker-icon', { timeout: 30000 });
  return page;
}

/** Shown pills' target boxes, hidden pills' state, and the list's rows. */
const survey = (page) => page.evaluate(() => {
  const pills = [...document.querySelectorAll('.vmap-marker')];
  const shown = pills.filter((p) => !p.hasAttribute('data-collided'));
  const boxes = shown.map((p) => p.getBoundingClientRect()).map((r) => ({ l: r.left, t: r.top, r: r.right, b: r.bottom }));
  let overlaps = 0;
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const a = boxes[i];
      const b = boxes[j];
      if (a.l < b.r && b.l < a.r && a.t < b.b && b.t < a.b) overlaps += 1;
    }
  }
  const hidden = pills.filter((p) => p.hasAttribute('data-collided'));
  return {
    pills: pills.length,
    shown: shown.length,
    hidden: hidden.length,
    hiddenProperly: hidden.every((p) => p.inert && getComputedStyle(p).visibility === 'hidden'),
    overlaps,
    rows: document.querySelectorAll('aside li').length,
    named: shown.every((p) => /\$\d+\.\d{2}|no prices submitted/.test(p.getAttribute('aria-label') ?? '')),
    heights: [...new Set(shown.map((p) => Math.round(p.getBoundingClientRect().height)))],
  };
});

(async () => {
  let browser;
  const noise = [];
  try {
    browser = await chromium.launch({ channel: 'msedge' });
    const context = await browser.newContext({
      viewport: { width: 1440, height: 900 },
      geolocation: COPPELL,
      permissions: ['geolocation'],
      reducedMotion: 'no-preference',
    });
    context.on('console', (m) => { if (m.type() === 'error') noise.push(m.text().slice(0, 160)); });

    // ---------------------------------------------------------------
    console.log('\nThe flag');
    // ---------------------------------------------------------------
    const plain = await openMap(context, '');
    check('without the flag, /map is the Leaflet map', await plain.evaluate(() =>
      document.querySelector('.leaflet-container') !== null && document.querySelector('.maplibregl-canvas') === null));
    await plain.close();

    // ---------------------------------------------------------------
    console.log('\nPills');
    // ---------------------------------------------------------------
    const page = await openMap(context);
    const dropping = await page.evaluate(() =>
      document.getAnimations().filter((a) => a.effect?.target?.classList?.contains('marker-pill')).length);
    check('the pills drop in as the area loads', dropping > 0, `${dropping} pills`);
    await page.waitForTimeout(1200);
    check('and settle once, then stop', await page.evaluate(() =>
      document.getAnimations().filter((a) => a.effect?.target?.classList?.contains('marker-pill') && a.playState === 'running').length === 0));

    check('the map draws on a MapLibre canvas', await page.locator('.maplibregl-canvas').isVisible());
    const area = await survey(page);
    check('every store in the list has a pill', area.pills === area.rows && area.pills > 0, `${area.pills} pills, ${area.rows} rows`);
    check('no two shown pills overlap', area.overlaps === 0 && area.shown > 0, `${area.shown} shown, ${area.overlaps} overlaps`);
    check('pills with no room are hidden, inert and invisible', area.hidden > 0 && area.hiddenProperly, `${area.hidden} hidden`);
    check('each shown pill is a 44px target named with its price', area.named && area.heights.join() === '44', `heights ${area.heights.join(',')}`);

    await page.locator('.maplibregl-ctrl-zoom-in').click();
    await page.waitForTimeout(900);
    await page.locator('.maplibregl-ctrl-zoom-in').click();
    await page.waitForTimeout(900);
    const closer = await survey(page);
    check('zooming in still leaves no overlaps', closer.overlaps === 0, `${closer.shown} shown, ${closer.hidden} hidden`);

    // ---------------------------------------------------------------
    console.log('\nSelecting');
    // ---------------------------------------------------------------
    const target = page.locator('.vmap-marker:not([data-collided])').first();
    const id = await target.getAttribute('data-store-id');
    await target.click();
    const sheet = page.getByRole('dialog');
    await sheet.waitFor({ state: 'visible', timeout: 8000 });
    check('a pill click opens that store\'s sheet', await sheet.isVisible());
    await page.waitForTimeout(500);
    check('the selected pill is shown and marked', await page.evaluate((storeId) => {
      const pill = document.querySelector(`.vmap-marker[data-store-id="${storeId}"]`);
      return pill !== null && !pill.hasAttribute('data-collided') && pill.querySelector('.marker-pill--selected') !== null;
    }, id));
    await page.getByRole('button', { name: 'Close price detail' }).click();

    // ---------------------------------------------------------------
    console.log('\nSearching');
    // ---------------------------------------------------------------
    await page.getByLabel('Search these stores').fill('coppell');
    await page.waitForTimeout(1200);
    const found = await survey(page);
    check('a search leaves pills only for what it found', found.pills === found.rows && found.pills > 0 && found.pills < area.pills,
      `${found.pills} pills, ${found.rows} rows`);
    check('and they do not overlap either', found.overlaps === 0);
    await page.close();
    await context.close();

    // ---------------------------------------------------------------
    console.log('\nReduced motion');
    // ---------------------------------------------------------------
    const calm = await browser.newContext({
      viewport: { width: 375, height: 812 },
      geolocation: COPPELL,
      permissions: ['geolocation'],
      reducedMotion: 'reduce',
    });
    const still = await openMap(calm);
    check('the pills do not drop in', await still.evaluate(() =>
      document.getAnimations().filter((a) => a.effect?.target?.classList?.contains('marker-pill')).length === 0));
    const phone = await survey(still);
    check('on a phone, no two shown pills overlap either', phone.overlaps === 0 && phone.shown > 0, `${phone.shown} shown`);
    await calm.close();

    check('no console errors', noise.length === 0, noise.slice(0, 3).join(' | '));
  } catch (error) {
    check('suite ran to completion', false, error.message);
    console.error(error);
  } finally {
    await browser?.close();
    const passed = results.filter((r) => r.passed).length;
    console.log(`\n${'='.repeat(64)}`);
    console.log(`Vector map: ${passed}/${results.length} passed`);
    for (const r of results.filter((x) => !x.passed)) console.log(`  - ${r.name}${r.detail ? `  [${r.detail}]` : ''}`);
    console.log('='.repeat(64));
    process.exit(passed === results.length ? 0 : 1);
  }
})();
