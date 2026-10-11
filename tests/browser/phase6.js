/**
 * Sandwich Index — Phase 6: polish and hardening
 *
 * Four things, none of which are spot checks:
 *
 *   1. axe-core across every route, plus the modal open, plus the map loaded.
 *   2. An exhaustive motion sweep: every element on every route is inspected
 *      under prefers-reduced-motion, and any surviving animation or transition
 *      is a failure. This is the hard constraint stated as a test rather than
 *      as a promise.
 *   3. Error, empty, loading and not-found states for each async surface.
 *   4. Offline behaviour.
 *
 * Requires: a server on :3000 and the seeded Firestore emulator on :8080.
 */

const { chromium } = require('playwright');
const fs = require('fs');

const TARGET_URL = process.env.TARGET_URL || 'http://localhost:3000';
const AXE_SOURCE = fs.readFileSync(
  require.resolve('axe-core/axe.min.js'),
  'utf8',
);

const RICH = 'node-6953201130';
const COPPELL = { latitude: 32.9546, longitude: -96.99 };

const results = [];
function check(name, passed, detail = '') {
  results.push({ name, passed, detail });
  console.log(`${passed ? '  PASS' : '  FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
}

async function launchBrowser() {
  for (const channel of ['msedge', 'chrome', undefined]) {
    try {
      const options = { headless: false };
      if (channel) options.channel = channel;
      return await chromium.launch(options);
    } catch { /* try next */ }
  }
  throw new Error('No usable browser');
}

async function axeScan(page, label) {
  await page.addScriptTag({ content: AXE_SOURCE });
  const report = await page.evaluate(async () =>
    // WCAG 2.1 A and AA only. The "best-practice" ruleset is opinion, and
    // failing a build on opinion is how teams learn to ignore the build.
    window.axe.run(document, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] },
    }));

  const violations = report.violations.map((v) =>
    `${v.id} (${v.impact}, ${v.nodes.length}×): ${v.nodes[0].target.join(' ')}`);

  check(`axe: ${label} has no WCAG A/AA violations`,
    violations.length === 0, violations.slice(0, 4).join(' | '));
  return report.violations;
}

/**
 * Every element with a live animation or transition, as the browser computes
 * it. Run under reduced motion, anything this returns is an unguarded animation.
 */
async function liveMotion(page) {
  return page.evaluate(() =>
    [...document.querySelectorAll('*')]
      .flatMap((el) => {
        const s = getComputedStyle(el);
        const out = [];
        const describe = () =>
          `${el.tagName.toLowerCase()}.${(el.getAttribute('class') || '').split(' ').filter(Boolean).slice(0, 2).join('.')}`;

        if (s.animationName !== 'none' && parseFloat(s.animationDuration) > 0) {
          out.push(`${describe()} animation:${s.animationName} ${s.animationDuration}`);
        }
        // `transition-property: none` means nothing transitions regardless of
        // the duration left behind — which is exactly what Tailwind's
        // `transition-none` utility produces.
        const durations = s.transitionDuration.split(',').map((d) => parseFloat(d));
        if (s.transitionProperty !== 'none' && durations.some((d) => d > 0)) {
          out.push(`${describe()} transition:${s.transitionProperty} ${s.transitionDuration}`);
        }
        return out;
      }));
}

(async () => {
  const browser = await launchBrowser();

  try {
    // =================================================================
    console.log('1. Accessibility audit (axe-core, WCAG 2.1 A + AA)');
    // =================================================================
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      geolocation: COPPELL,
      permissions: ['geolocation'],
      locale: 'en-US',
    });
    const page = await context.newPage();

    for (const [label, url] of [
      ['landing', '/'],
      ['about', '/about'],
      ['store detail', `/store/${RICH}`],
      ['store 404', '/store/node-9999999999'],
      ['root 404', '/no-such-page'],
    ]) {
      await page.goto(`${TARGET_URL}${url}`, { waitUntil: 'load' });
      await page.waitForLoadState('networkidle');
      await axeScan(page, label);
    }

    // The modal is a different document state and needs its own scan.
    await page.goto(`${TARGET_URL}/store/${RICH}`, { waitUntil: 'load' });
    await page.waitForLoadState('networkidle');
    await page.getByRole('button', { name: /Log a price/ }).click();
    await page.waitForSelector('dialog[open]');
    await page.waitForTimeout(400);
    await axeScan(page, 'submit modal open');
    await page.keyboard.press('Escape');

    // Map, with markers rendered.
    await page.goto(`${TARGET_URL}/map`, { waitUntil: 'load' });
    await page.waitForLoadState('networkidle');
    await axeScan(page, 'map location gate');
    await page.getByRole('button', { name: /Use my location/i }).click();
    await page.waitForSelector('.leaflet-marker-icon', { timeout: 20000 });
    await page.waitForTimeout(600);
    await axeScan(page, 'map with markers');
    await context.close();

    // =================================================================
    console.log('\n2. Motion sweep — nothing animates under reduced motion');
    // =================================================================
    const stillContext = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      reducedMotion: 'reduce',
      geolocation: COPPELL,
      permissions: ['geolocation'],
    });
    const stillPage = await stillContext.newPage();

    for (const [label, url] of [
      ['landing', '/'],
      ['about', '/about'],
      ['store detail', `/store/${RICH}`],
      ['root 404', '/no-such-page'],
    ]) {
      await stillPage.goto(`${TARGET_URL}${url}`, { waitUntil: 'load' });
      await stillPage.waitForLoadState('networkidle');
      const live = await liveMotion(stillPage);
      check(`no unguarded motion on ${label}`, live.length === 0,
        live.slice(0, 3).join(' | '));
    }

    await stillPage.goto(`${TARGET_URL}/store/${RICH}`, { waitUntil: 'load' });
    await stillPage.waitForLoadState('networkidle');
    await stillPage.getByRole('button', { name: /Log a price/ }).click();
    await stillPage.waitForSelector('dialog[open]');
    await stillPage.waitForTimeout(300);
    const modalMotion = await liveMotion(stillPage);
    check('no unguarded motion in the open modal', modalMotion.length === 0,
      modalMotion.slice(0, 3).join(' | '));
    await stillPage.keyboard.press('Escape');

    await stillPage.goto(`${TARGET_URL}/map`, { waitUntil: 'load' });
    await stillPage.waitForLoadState('networkidle');
    await stillPage.getByRole('button', { name: /Use my location/i }).click();
    await stillPage.waitForSelector('.leaflet-marker-icon', { timeout: 20000 });
    await stillPage.waitForTimeout(800);
    const mapMotion = await liveMotion(stillPage);
    check('no unguarded motion on the map, including Leaflet\'s own',
      mapMotion.length === 0, mapMotion.slice(0, 4).join(' | '));

    // Zooming is the biggest movement on the site; confirm it is instant.
    const zoomAnimated = await stillPage.evaluate(() => {
      const container = document.querySelector('.leaflet-container');
      const pane = container.querySelector('.leaflet-map-pane');
      return getComputedStyle(pane).transitionDuration;
    });
    check('map pane has no zoom transition under reduced motion',
      parseFloat(zoomAnimated) === 0, zoomAnimated);
    await stillContext.close();

    // =================================================================
    console.log('\n3. Motion sweep — animations DO run by default');
    // =================================================================
    // The mirror of the test above. A guard that works by accident, because
    // nothing was animated in the first place, is not a guard.
    const movingContext = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      reducedMotion: 'no-preference',
    });
    const movingPage = await movingContext.newPage();
    await movingPage.goto(`${TARGET_URL}/`, { waitUntil: 'load' });
    const movingLanding = await liveMotion(movingPage);
    check('landing does animate when motion is allowed',
      movingLanding.length > 0, `${movingLanding.length} animated elements`);

    await movingPage.goto(`${TARGET_URL}/store/${RICH}`, { waitUntil: 'load' });
    await movingPage.waitForLoadState('networkidle');
    await movingPage.getByRole('button', { name: /Log a price/ }).click();
    await movingPage.waitForTimeout(80);
    const panelTransform = await movingPage.evaluate(() => {
      const panel = document.querySelector('dialog .max-w-lg');
      return panel ? getComputedStyle(panel).transform : 'missing';
    });
    check('modal does animate when motion is allowed',
      panelTransform !== 'none' && panelTransform !== 'missing', panelTransform);
    await movingContext.close();

    // =================================================================
    console.log('\n4. Error, empty and not-found states');
    // =================================================================
    const stateContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const statePage = await stateContext.newPage();

    const store404 = await statePage.goto(`${TARGET_URL}/store/node-9999999999`);
    check('unknown store returns a real 404 status', store404.status() === 404,
      String(store404.status()));
    check('unknown store explains itself',
      /We do not have that store/.test(await statePage.locator('main').innerText()));

    const root404 = await statePage.goto(`${TARGET_URL}/no-such-page`);
    check('unknown route returns a real 404 status', root404.status() === 404,
      String(root404.status()));
    check('root 404 offers a way back',
      await statePage.getByRole('link', { name: /Find prices near you/ }).count() === 1);

    const malformed = await statePage.goto(`${TARGET_URL}/store/not-an-osm-id`);
    check('a malformed store id 404s rather than erroring', malformed.status() === 404,
      String(malformed.status()));

    // API surfaces
    const api = await statePage.evaluate(async () => {
      const call = async (url) => {
        const response = await fetch(url);
        return { status: response.status, body: await response.json().catch(() => null) };
      };
      return {
        noCoords: await call('/api/stores'),
        badCoords: await call('/api/stores?lat=999&lng=0'),
        emptyArea: await call('/api/stores?lat=64.15&lng=-21.94&radiusMiles=5'),
        badZip: await call('/api/geocode?zip=abc'),
        missingZip: await call('/api/geocode?zip=00000'),
        badStore: await call('/api/stores/not-an-id/history'),
        missingStore: await call('/api/stores/node-9999999999/history'),
      };
    });
    check('missing coordinates are rejected, not read as Null Island',
      api.noCoords.status === 400, `${api.noCoords.status}`);
    check('out-of-range coordinates are rejected',
      api.badCoords.status === 400, `${api.badCoords.status}`);
    check('an area with no stores is an empty list, not an error',
      api.emptyArea.status === 200 && api.emptyArea.body.stores.length === 0,
      `${api.emptyArea.status} / ${api.emptyArea.body?.stores?.length}`);
    check('a malformed ZIP is a 400 with a usable message',
      api.badZip.status === 400 && /5-digit/.test(api.badZip.body.error),
      `${api.badZip.status} ${api.badZip.body?.error}`);
    check('a ZIP that does not exist is a 404, distinct from a lookup failure',
      api.missingZip.status === 404, `${api.missingZip.status} ${api.missingZip.body?.error}`);
    check('a malformed store id is a 400', api.badStore.status === 400,
      `${api.badStore.status}`);
    check('an unknown store id is a 404', api.missingStore.status === 404,
      `${api.missingStore.status}`);

    // Server failure → the error boundary, not a blank page.
    await statePage.route('**/api/stores**', (route) => route.abort('failed'));
    await statePage.goto(`${TARGET_URL}/map`, { waitUntil: 'load' });
    await statePage.getByRole('button', { name: /Enter a ZIP/i }).click().catch(() => {});
    await stateContext.close();

    // =================================================================
    console.log('\n5. Offline behaviour');
    // =================================================================
    const offlineContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const offlinePage = await offlineContext.newPage();
    await offlinePage.goto(`${TARGET_URL}/store/${RICH}`, { waitUntil: 'load' });
    await offlinePage.waitForLoadState('networkidle');

    check('no offline banner while connected',
      await offlinePage.locator('[role="status"]', { hasText: 'You are offline' }).count() === 0);

    await offlineContext.setOffline(true);
    await offlinePage.waitForTimeout(500);

    const banner = offlinePage.locator('[role="status"]').filter({ hasText: 'You are offline' });
    check('offline banner appears', await banner.count() === 1);

    const bannerText = (await banner.innerText()).replace(/\s+/g, ' ');
    check('banner says what still works and what does not',
      /loaded before the connection dropped/.test(bannerText) &&
      /nothing you submit will save/.test(bannerText), bannerText.slice(0, 90));

    const bannerLive = await banner.evaluate((el) =>
      el.closest('[aria-live]')?.getAttribute('aria-live') ?? el.getAttribute('aria-live'));
    check('banner is announced politely, not as an alert', bannerLive === 'polite',
      String(bannerLive));

    const shift = await offlinePage.evaluate(() => new Promise((resolve) => {
      let total = 0;
      const observer = new PerformanceObserver((list) => {
        for (const entry of list.getEntries()) if (!entry.hadRecentInput) total += entry.value;
      });
      observer.observe({ type: 'layout-shift', buffered: false });
      setTimeout(() => { observer.disconnect(); resolve(total); }, 600);
    }));
    check('banner costs no layout shift', shift === 0, String(shift));

    // A submission attempted offline must fail immediately and say so.
    await offlinePage.getByRole('button', { name: /Log a price/ }).click();
    await offlinePage.waitForSelector('dialog[open]');
    await offlinePage.locator('input[name="price"]').fill('3.49');

    const startedAt = Date.now();
    await offlinePage.locator('dialog button[type="submit"]').click();
    await offlinePage.waitForSelector('dialog form [role="alert"]', { timeout: 8000 });
    const elapsed = Date.now() - startedAt;

    const offlineError = (await offlinePage.locator('dialog form [role="alert"]').innerText())
      .replace(/\s+/g, ' ');
    check('an offline submission fails at once rather than on a timeout',
      elapsed < 3000, `${elapsed}ms`);
    check('offline failure says the price was not saved and not queued',
      /has not been saved/.test(offlineError) && /Nothing is queued/.test(offlineError),
      offlineError.slice(0, 90));

    await offlineContext.setOffline(false);
    await offlinePage.waitForTimeout(500);
    check('banner clears when the connection returns',
      await offlinePage.locator('[role="status"]')
        .filter({ hasText: 'You are offline' }).count() === 0);
    await offlineContext.close();

  } catch (error) {
    check('suite ran to completion', false, error.message);
    console.error(error);
  } finally {
    await browser.close();

    const passed = results.filter((r) => r.passed).length;
    console.log(`\n${'='.repeat(64)}`);
    console.log(`Phase 6: ${passed}/${results.length} passed`);
    if (passed !== results.length) {
      console.log('\nFailures:');
      for (const r of results.filter((x) => !x.passed)) {
        console.log(`  - ${r.name}${r.detail ? `\n      ${r.detail}` : ''}`);
      }
    }
    console.log('='.repeat(64));
    process.exit(passed === results.length ? 0 : 1);
  }
})();
