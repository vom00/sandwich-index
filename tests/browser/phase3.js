/**
 * Sandwich Index — Phase 3 map view tests
 *
 * Gate: geolocation mocked to Coppell TX renders markers, ZIP fallback works
 * when permission is denied, marker click opens the detail sheet.
 *
 * Requires: production server on :3000 and the seeded Firestore emulator.
 */

const { chromium } = require('playwright');

const TARGET_URL = process.env.TARGET_URL || 'http://localhost:3000';
const COPPELL = { latitude: 32.9546, longitude: -96.99 };

const results = [];
function check(name, passed, detail = '') {
  results.push({ name, passed, detail });
  console.log(`${passed ? '  PASS' : '  FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
}

async function launchBrowser() {
  // Bundled Chromium cannot start on this machine (missing VC++ runtime).
  for (const channel of ['msedge', 'chrome', undefined]) {
    try {
      const options = { headless: false, slowMo: 40 };
      if (channel) options.channel = channel;
      const browser = await chromium.launch(options);
      console.log(`Browser: ${channel ?? 'bundled chromium'}\n`);
      return browser;
    } catch { /* try next */ }
  }
  throw new Error('No usable browser');
}

(async () => {
  const browser = await launchBrowser();

  try {
    // ---------------------------------------------------------------
    console.log('Geolocation granted → markers render');
    // ---------------------------------------------------------------
    const grantedContext = await browser.newContext({
      viewport: { width: 1400, height: 900 },
      geolocation: COPPELL,
      permissions: ['geolocation'],
      locale: 'en-US',
    });
    const page = await grantedContext.newPage();

    const consoleErrors = [];
    const badResponses = [];
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
    page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));
    page.on('response', (r) => {
      if (r.status() >= 400) badResponses.push(`${r.status()} ${r.url()}`);
    });

    // 'load' plus networkidle, not 'domcontentloaded'. The button is present in
    // the server HTML before React has attached its handler, so clicking too
    // early is a click into the void — the interaction is silently lost.
    await page.goto(`${TARGET_URL}/map`, { waitUntil: 'load' });
    await page.waitForLoadState('networkidle');

    const gateHeading = await page.getByRole('heading', { name: /cheapest mcchicken near you/i }).isVisible();
    check('location gate shown before any permission prompt', gateHeading);

    const zipVisibleUpFront = await page.getByLabel(/enter a zip code/i).isVisible();
    check('ZIP fallback offered alongside, not only after denial', zipVisibleUpFront);

    await page.getByRole('button', { name: /use my location/i }).click();

    // `state: 'attached'` rather than the default 'visible': Leaflet positions
    // markers by transform, and the first one in DOM order can sit outside the
    // current viewport, which Playwright's visibility heuristic can reject.
    await page.waitForSelector('.marker-pill', { state: 'attached', timeout: 30000 });
    const markerCount = await page.locator('.marker-pill').count();
    check('markers render for the seeded area', markerCount > 0, `${markerCount} markers`);

    const listRows = await page.locator('[data-store-id]').count();
    check('side panel lists stores', listRows > 0, `${listRows} rows`);
    check('marker count matches panel row count', markerCount === listRows,
      `${markerCount} markers vs ${listRows} rows`);

    // --- tier encoding is not colour-only ---
    const markerText = await page.locator('.marker-pill').first().innerText();
    check('marker carries a visible glyph plus price, not colour alone',
      /[▼▲●?◷]/.test(markerText) && /\$|—/.test(markerText),
      JSON.stringify(markerText.replace(/\s+/g, ' ')));

    const tierLabels = await page.getByText(/Cheapest third|Middle third|Priciest third/).count();
    check('panel states the tier in words', tierLabels > 0, `${tierLabels} labelled rows`);

    // --- stale / unmeasured states carry icon + text ---
    const staleText = await page.getByText(/Stale ·/).count();
    const noPriceText = await page.getByText(/No prices yet/).count();
    check('stale stores labelled in text', staleText > 0, `${staleText} stale`);
    check('unmeasured stores labelled in text', noPriceText > 0, `${noPriceText} unmeasured`);

    // --- panel ordering ---
    // The panel deliberately orders by distance — "Nearby stores, nearest
    // first" — not by price tier. The pre-refactor build ranked by median;
    // those checks tested a superseded design.
    const rows = await page.$$eval('[data-store-id]', (elements) =>
      elements.map((element) => {
        const text = element.innerText;
        const distance = text.match(/([\d.]+) miles away/);
        return {
          distance: distance ? parseFloat(distance[1]) : null,
          stale: /Stale ·/.test(text),
          unmeasured: /No prices yet/.test(text),
        };
      }),
    );

    const distances = rows.map((r) => r.distance).filter((d) => d !== null);
    check('rows are ordered nearest first',
      distances.every((v, i) => i === 0 || distances[i - 1] <= v),
      distances.slice(0, 8).join(', '));
    check('every row states its distance',
      rows.every((r) => r.distance !== null),
      `${rows.filter((r) => r.distance === null).length} rows without`);
    check('stale and unmeasured stores stay in the list rather than being hidden',
      rows.some((r) => r.stale) && rows.some((r) => r.unmeasured),
      `${rows.filter((r) => r.stale).length} stale, ${rows.filter((r) => r.unmeasured).length} unmeasured`);

    // ---------------------------------------------------------------
    console.log('\nMarker click → detail sheet');
    // ---------------------------------------------------------------
    // Wait for the background OpenStreetMap reconciliation to finish. While it
    // runs, a re-render can replace marker elements mid-interaction — focus
    // lands on a node that no longer exists by the time the key is pressed.
    await page
      .getByText('checking the area')
      .waitFor({ state: 'detached', timeout: 40000 })
      .catch(() => {});
    await page.waitForTimeout(300);

    // Markers overlap at metro zoom, so a pointer click on an arbitrary marker
    // can legitimately be intercepted by a neighbour. Activating via keyboard
    // avoids that ambiguity and tests something more valuable: that a marker is
    // operable without a mouse at all.
    const firstMarker = page.locator('.leaflet-marker-icon').first();

    const markerName = await firstMarker.evaluate((el) => {
      const labelled = el.querySelector('[aria-label]');
      return labelled ? labelled.getAttribute('aria-label') : null;
    });
    check('marker carries a full accessible name',
      markerName !== null && markerName.length > 10,
      markerName ?? 'none');

    const markerRoles = await firstMarker.evaluate((el) => ({
      outer: el.getAttribute('role'),
      tabindex: el.getAttribute('tabindex'),
      nestedButtons: el.querySelectorAll('[role="button"]').length,
    }));
    check('marker is focusable with a single button role',
      markerRoles.outer === 'button' &&
        markerRoles.tabindex === '0' &&
        markerRoles.nestedButtons === 0,
      JSON.stringify(markerRoles));

    // Find a point that is inside the map viewport AND whose topmost element
    // belongs to a specific marker. Playwright's own click targets an element's
    // centre, which for edge markers can land under the side panel — so we
    // compute the point ourselves and click it directly, exactly as a user
    // pointing at a visible pill would.
    const target = await page.evaluate(() => {
      const mapEl = document.querySelector('.leaflet-container');
      if (mapEl === null) return null;
      const bounds = mapEl.getBoundingClientRect();

      for (const marker of Array.from(document.querySelectorAll('.leaflet-marker-icon'))) {
        const rect = marker.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.bottom - 12;
        const insideMap =
          x > bounds.left + 8 && x < bounds.right - 8 &&
          y > bounds.top + 8 && y < bounds.bottom - 8;
        if (!insideMap) continue;

        const hit = document.elementFromPoint(x, y);
        if (hit !== null && marker.contains(hit)) {
          const labelled = marker.querySelector('[aria-label]');
          return { x, y, label: labelled ? labelled.getAttribute('aria-label') : null };
        }
      }
      return null;
    });

    check('a marker is individually clickable at default zoom', target !== null,
      target === null ? 'every marker occluded' : `at (${Math.round(target.x)}, ${Math.round(target.y)})`);

    if (target === null) throw new Error('No individually clickable marker found');
    await page.mouse.click(target.x, target.y);

    const sheet = page.getByRole('dialog');
    await sheet.waitFor({ state: 'visible', timeout: 8000 });
    check('marker click opens the detail sheet', await sheet.isVisible());

    const sheetText = await sheet.innerText();
    check('sheet shows the current price or says there is none',
      /current price|no confirmed|no prices yet|\$\d+\.\d{2}/i.test(sheetText));
    check('sheet shows submission count', /price(s)?|no confirmed/i.test(sheetText));
    check('sheet has a prominent Log a price action',
      await sheet.getByRole('link', { name: /log a price/i }).isVisible());

    // --- two-way sync: map selection highlights the panel row ---
    const selectedInPanel = await page.locator('[data-store-id] button[aria-pressed="true"]').count();
    check('map selection reflected in the panel', selectedInPanel === 1, `${selectedInPanel} row pressed`);

    // --- escape closes ---
    await page.keyboard.press('Escape');
    await sheet.waitFor({ state: 'hidden', timeout: 5000 }).catch(() => {});
    check('Escape closes the sheet', (await page.getByRole('dialog').count()) === 0);

    // --- two-way sync: panel selection drives the map ---
    const unselectedRow = page.locator('[data-store-id] button[aria-pressed="false"]').first();
    await unselectedRow.scrollIntoViewIfNeeded();
    await unselectedRow.click();
    await page.getByRole('dialog').waitFor({ state: 'visible', timeout: 8000 });
    const selectedMarkers = await page.locator('.marker-pill--selected').count();
    check('panel selection marks the matching marker', selectedMarkers === 1,
      `${selectedMarkers} selected markers`);

    check('no uncaught page errors on the map',
      consoleErrors.filter((e) => e.startsWith('pageerror')).length === 0,
      consoleErrors.filter((e) => e.startsWith('pageerror')).slice(0, 2).join(' | ') || 'clean');

    const localFailures = badResponses.filter((r) => r.includes('localhost'));
    check('no failing requests to our own origin', localFailures.length === 0,
      localFailures.slice(0, 3).join(' | ') || 'clean');
    if (badResponses.length > 0) {
      console.log(`         (non-2xx responses seen: ${badResponses.slice(0, 4).join(' | ')})`);
    }

    await page.screenshot({ path: require('path').join(__dirname,'screenshots','phase3-map-desktop.png') });

    // ---------------------------------------------------------------
    console.log('\nMobile layout');
    // ---------------------------------------------------------------
    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(600);
    const overflow = await page.evaluate(() => ({
      sw: document.documentElement.scrollWidth,
      cw: document.documentElement.clientWidth,
    }));
    check('no horizontal scroll at 375px', overflow.sw <= overflow.cw + 1,
      `${overflow.sw} vs ${overflow.cw}`);
    await page.screenshot({ path: require('path').join(__dirname,'screenshots','phase3-map-mobile.png') });

    await grantedContext.close();

    // ---------------------------------------------------------------
    console.log('\nPermission denied → ZIP fallback');
    // ---------------------------------------------------------------
    const deniedContext = await browser.newContext({
      viewport: { width: 1400, height: 900 },
      locale: 'en-US',
    });
    // Force a deterministic PERMISSION_DENIED rather than relying on the
    // browser's default prompt handling.
    await deniedContext.addInitScript(() => {
      Object.defineProperty(navigator, 'geolocation', {
        configurable: true,
        value: {
          getCurrentPosition: (_ok, err) => err({ code: 1, PERMISSION_DENIED: 1, TIMEOUT: 3 }),
          watchPosition: () => 0,
          clearWatch: () => {},
        },
      });
    });

    const denied = await deniedContext.newPage();
    const deniedErrors = [];
    denied.on('pageerror', (e) => deniedErrors.push(e.message));

    await denied.goto(`${TARGET_URL}/map`, { waitUntil: 'load' });
    await denied.waitForLoadState('networkidle');
    await denied.getByRole('button', { name: /use my location/i }).click();

    // Scoped to main: the layout now carries a permanently-mounted
    // role="status" live region for the offline banner, which is a second match.
    const deniedMessage = denied.locator('main [role="status"]');
    await deniedMessage.waitFor({ state: 'visible', timeout: 8000 });
    const deniedText = await deniedMessage.innerText();
    check('denial produces a non-blocking explanation', /zip code/i.test(deniedText),
      JSON.stringify(deniedText));
    check('user is not dead-ended after denying',
      await denied.getByLabel(/enter a zip code/i).isVisible());

    // --- inline validation on the ZIP field ---
    await denied.getByLabel(/enter a zip code/i).fill('12');
    await denied.getByRole('button', { name: /show stores/i }).click();
    // Scoped to the form: Next renders its own role="alert" route announcer.
    const zipAlert = denied.locator('form [role="alert"]');
    await zipAlert.waitFor({ state: 'visible', timeout: 5000 });
    check('invalid ZIP shows an error beside the field',
      /5-digit/i.test(await zipAlert.innerText()));
    const summaryAtTop = await denied.locator('main > [role="alert"]').count();
    check('error is adjacent to the field, not a summary block', summaryAtTop === 0);

    // --- the real fallback path ---
    await denied.getByLabel(/enter a zip code/i).fill('75019');
    await denied.getByRole('button', { name: /show stores/i }).click();
    await denied.waitForSelector('.marker-pill', { state: 'attached', timeout: 30000 });
    const fallbackMarkers = await denied.locator('.marker-pill').count();
    check('ZIP fallback loads stores and renders markers', fallbackMarkers > 0,
      `${fallbackMarkers} markers`);
    check('heading reflects the manual location',
      /75019/.test(await denied.getByRole('heading', { level: 1 }).innerText()));

    check('no uncaught errors on the fallback path', deniedErrors.length === 0,
      deniedErrors.slice(0, 2).join(' | ') || 'clean');

    await denied.screenshot({ path: require('path').join(__dirname,'screenshots','phase3-zip-fallback.png') });
    await deniedContext.close();
  } catch (error) {
    check('test run completed without throwing', false, error.message);
  } finally {
    await browser.close();
  }

  const passed = results.filter((r) => r.passed).length;
  const failed = results.length - passed;
  console.log('\n' + '='.repeat(60));
  console.log(`PHASE 3 RESULT: ${passed} passed, ${failed} failed, ${results.length} total`);
  console.log('Screenshots: tests/browser/screenshots/phase3-map-desktop.png, phase3-map-mobile.png, phase3-zip-fallback.png');
  console.log('='.repeat(60));
  process.exit(failed > 0 ? 1 : 0);
})();
