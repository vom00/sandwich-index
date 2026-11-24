/**
 * Phase 3 polish: the map, the odometer, the map-to-store morph and the grain.
 *
 * What it promises:
 *   - While an area's stores load, the list shows still skeleton rows, and
 *     nothing on the map page loops.
 *   - The street map is toned to paper; the price pills drop in once, nearest
 *     first, in at most ten 35ms steps of 220ms each, and a selection or a
 *     search never replays it.
 *   - Following a row's History link, or a sheet's link, morphs the store's
 *     name and price into the store page's header in 240ms, and the page's
 *     own rise does not replay once the morph is over.
 *   - An odometer whose figure changes after its first roll rolls again
 *     instead of jumping.
 *   - The header, the primary button and the landing page's ink band carry
 *     paper grain; the header has no blur and the button no sheen.
 *   - Under reduced motion: no pill drop, no roll, and the page crossfades
 *     with nothing named.
 *
 * Needs `npm run dev` and the emulator, like every suite here.
 */

const { chromium } = require('playwright');

const TARGET_URL = process.env.TARGET_URL || 'http://localhost:3000';
const COPPELL = { latitude: 32.9546, longitude: -96.99 };

const results = [];
function check(name, passed, detail = '') {
  results.push({ name, passed, detail });
  console.log(`${passed ? '  PASS' : '  FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
}

/**
 * Records every view transition the page starts, so a test can wait on it,
 * and every pill drop as it is started, before the first ones finish.
 */
function recordMotion() {
  window.__drops = [];
  const animate = Element.prototype.animate;
  Element.prototype.animate = function (keyframes, options) {
    if (this.classList.contains("marker-pill")) window.__drops.push(options);
    return animate.call(this, keyframes, options);
  };
  const start = Document.prototype.startViewTransition;
  if (typeof start !== 'function') return;
  window.__transitions = [];
  Document.prototype.startViewTransition = function (callback) {
    const transition = start.call(this, callback);
    window.__transitions.push(transition);
    return transition;
  };
}

async function openMap(context, { slowStores = 0 } = {}) {
  const page = await context.newPage();
  if (slowStores > 0) {
    await page.route('**/api/stores?*', async (route) => {
      await new Promise((resolve) => setTimeout(resolve, slowStores));
      await route.continue();
    });
  }
  await page.goto(`${TARGET_URL}/map`, { waitUntil: 'load' });
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: /use my location/i }).click();
  return page;
}

/** Pills currently animating, with their timing. */
function pillAnimations(page) {
  return page.evaluate(() =>
    document.getAnimations()
      .filter((animation) => animation.effect?.target?.classList?.contains('marker-pill'))
      .map((animation) => {
        const { delay, duration, easing, fill } = animation.effect.getTiming();
        return { delay, duration, easing, fill };
      }));
}

/** Clicks a link inside the page, then reports the view transition it started. */
function followAndWatch(page, selector) {
  return page.evaluate(async (linkSelector) => {
    const before = window.__transitions.length;
    document.querySelector(linkSelector).click();
    await new Promise((resolve) => setTimeout(resolve, 0));
    const transition = window.__transitions[before];
    if (!transition) return null;
    await transition.ready;
    const animations = document.getAnimations().filter((a) => String(a.effect?.pseudoElement).startsWith('::view-transition'));
    const timing = (pseudo) => animations.find((a) => a.effect.pseudoElement === pseudo)?.effect.getComputedTiming().duration ?? null;
    const report = {
      mode: document.documentElement.dataset.morph ?? null,
      groups: [...new Set(animations.map((a) => a.effect.pseudoElement).filter((p) => p.includes('-group(')))].sort(),
      groupMs: timing('::view-transition-group(store-name)') ?? timing('::view-transition-group(root)'),
      oldNameMs: timing('::view-transition-old(store-name)'),
    };
    await transition.finished;
    return report;
  }, selector);
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
    await context.addInitScript(recordMotion);

    // ---------------------------------------------------------------
    console.log('\nLoading');
    // ---------------------------------------------------------------
    let page = await openMap(context, { slowStores: 2500 });
    await page.waitForSelector('aside ul[aria-hidden="true"] li', { timeout: 10000 });
    const loading = await page.evaluate(() => ({
      skeleton: document.querySelectorAll('aside ul[aria-hidden="true"] li').length,
      rows: document.querySelectorAll('[data-store-id]').length,
      // Anything set to repeat forever, other than the existing sync notice.
      loops: document.getAnimations().filter((a) =>
        a.effect?.getTiming().iterations === Infinity &&
        (a.effect.target?.closest?.('aside') || a.effect.target?.closest?.('.leaflet-container') ||
          a.effect.target?.closest?.('.bg-paper-sunken'))).length,
    }));
    check('the list shows skeleton rows while stores load', loading.skeleton === 6 && loading.rows === 0,
      `${loading.skeleton} skeleton rows, ${loading.rows} rows`);
    check('nothing in the list or the map loops while it waits', loading.loops === 0, `${loading.loops} looping`);

    // ---------------------------------------------------------------
    console.log('\nMap');
    // ---------------------------------------------------------------
    await page.waitForSelector('.marker-pill', { state: 'attached', timeout: 30000 });
    // The drop starts on the next frame after the pills arrive.
    await page.waitForFunction(() => window.__drops.length > 0, null, { timeout: 5000 }).catch(() => {});
    const drop = await page.evaluate(() => window.__drops);
    const pills = await page.locator('.marker-pill').count();
    const delays = [...new Set(drop.map((d) => d.delay))].sort((a, b) => a - b);
    check('every pill drops in', drop.length === pills && pills > 0, `${drop.length} of ${pills}`);
    check('nearest first, in at most ten 35ms steps',
      delays[0] === 0 && delays.length <= 10 && delays.every((d, i) => i === 0 || d - delays[i - 1] === 35),
      delays.join(','));
    check('each drop is 220ms on ease-out-quart, held only before it starts',
      drop.every((d) => d.duration === 220 && /^cubic-bezier\(0?\.165, ?0?\.84, ?0?\.44, ?1\)$/.test(d.easing) && d.fill === 'backwards'),
      JSON.stringify(drop[0]));
    await page.waitForTimeout(700);
    check('the pills end fully visible', await page.evaluate(() =>
      [...document.querySelectorAll('.marker-pill')].every((pill) => getComputedStyle(pill).opacity === '1')));
    check('the street map is toned to paper',
      /saturate\(0\.3\)/.test(await page.evaluate(() => getComputedStyle(document.querySelector('.leaflet-tile-pane')).filter)));

    const dropped = drop.length;
    await page.locator('.leaflet-marker-icon').nth(2).click();
    await page.waitForSelector('[role="dialog"]');
    await page.waitForTimeout(150);
    check('selecting a store does not replay the drop',
      (await pillAnimations(page)).length === 0 && (await page.evaluate(() => window.__drops.length)) === dropped);
    await page.getByLabel('Search these stores').fill('coppell');
    await page.waitForTimeout(150);
    await page.getByLabel('Search these stores').fill('');
    await page.waitForTimeout(150);
    check('searching and clearing do not replay it',
      (await pillAnimations(page)).length === 0 && (await page.evaluate(() => window.__drops.length)) === dropped);

    // ---------------------------------------------------------------
    console.log('\nMorph into the store page');
    // ---------------------------------------------------------------
    const sheetStore = await page.evaluate(() => document.querySelector('[role="dialog"] [data-morph-source="name"]').textContent);
    const fromSheet = await followAndWatch(page, '[role="dialog"] a.btn-quiet');
    await page.waitForURL(/\/store\//);
    check('the sheet\'s name and price morph into the page header',
      fromSheet !== null && fromSheet.mode === 'store' &&
      fromSheet.groups.includes('::view-transition-group(store-name)') &&
      fromSheet.groups.includes('::view-transition-group(store-price)'),
      JSON.stringify(fromSheet?.groups));
    check('in 240ms, with the old name gone in the first 120ms',
      fromSheet?.groupMs === 240 && fromSheet?.oldNameMs === 120, `${fromSheet?.groupMs} / ${fromSheet?.oldNameMs}`);
    check('onto the store that was open', (await page.locator('h1').innerText()).startsWith(sheetStore.split(' (')[0]),
      sheetStore);
    await page.waitForTimeout(1800);
    const settled = await page.evaluate(() => {
      const h1 = document.querySelector('[data-morph-target="name"]');
      return {
        mark: document.documentElement.dataset.morph ?? null,
        name: getComputedStyle(h1).viewTransitionName,
        opacity: getComputedStyle(h1).opacity,
        running: document.getAnimations().filter((a) => a.playState === 'running' && a.effect?.target?.closest?.('main > header')).length,
      };
    });
    check('afterwards the page is unmarked and its header does not rise again',
      settled.mark === null && settled.name === 'none' && settled.opacity === '1' && settled.running === 0,
      JSON.stringify(settled));

    await page.getByRole('link', { name: /back to the map/i }).click();
    await page.waitForSelector('[data-store-id]', { timeout: 30000 });
    await page.waitForTimeout(800);
    const rowId = await page.evaluate(() => document.querySelectorAll('[data-store-id]')[1].getAttribute('data-store-id'));
    const fromRow = await followAndWatch(page, `[data-store-id="${rowId}"] a[href="/store/${rowId}"]`);
    await page.waitForURL(new RegExp(`/store/${rowId}$`));
    check('a row\'s History link morphs its name and price too',
      fromRow !== null && fromRow.groups.includes('::view-transition-group(store-name)') &&
      fromRow.groups.includes('::view-transition-group(store-price)'),
      JSON.stringify(fromRow?.groups));
    check('a cmd/ctrl-click still opens a new tab, untouched', await (async () => {
      await page.goBack();
      await page.waitForSelector('[data-store-id]', { timeout: 30000 });
      const before = await page.evaluate(() => window.__transitions.length);
      const [popup] = await Promise.all([
        context.waitForEvent('page', { timeout: 5000 }).catch(() => null),
        page.locator(`[data-store-id] a`).filter({ hasText: 'History' }).first().click({ modifiers: ['Control'] }),
      ]);
      const after = await page.evaluate(() => window.__transitions.length);
      if (popup) await popup.close();
      return popup !== null && after === before;
    })());
    await page.close();

    // ---------------------------------------------------------------
    console.log('\nOdometer');
    // ---------------------------------------------------------------
    page = await context.newPage();
    await page.goto(`${TARGET_URL}/store/${rowId}`, { waitUntil: 'load' });
    await page.waitForTimeout(2000);
    const reroll = await page.evaluate(() => {
      const column = document.querySelector('main .odo[data-roll="load"] .odo-col');
      if (!column) return null;
      const from = getComputedStyle(column, '::before').transform;
      const digit = Number(column.style.getPropertyValue('--d'));
      column.style.setProperty('--d', String((digit + 5) % 10));
      const rolling = document.getAnimations().filter((a) =>
        a.effect?.target === column && a.effect.pseudoElement === '::before' && a.transitionProperty === 'transform');
      return { from, now: getComputedStyle(column, '::before').transform, rolling: rolling.length, ms: rolling[0]?.effect.getTiming().duration };
    });
    check('a changed figure rolls from the old digit instead of jumping',
      reroll !== null && reroll.rolling === 1 && reroll.from === reroll.now && reroll.ms === 1100,
      JSON.stringify(reroll));
    await page.close();

    // ---------------------------------------------------------------
    console.log('\nPaper grain');
    // ---------------------------------------------------------------
    page = await context.newPage();
    await page.goto(`${TARGET_URL}/`, { waitUntil: 'load' });
    const grain = await page.evaluate(() => {
      const header = getComputedStyle(document.querySelector('.site-header'));
      const button = document.querySelector('.btn-primary');
      const band = document.querySelector('section.on-ink');
      return {
        headerGrain: header.backgroundImage.includes('feTurbulence'),
        headerOpaque: header.backgroundColor,
        headerBlur: header.backdropFilter,
        buttonGrain: getComputedStyle(button).backgroundImage.includes('feTurbulence'),
        buttonSheen: getComputedStyle(button, '::after').content,
        bandGrain: getComputedStyle(band).backgroundImage.includes('feTurbulence'),
        opacity: Number((decodeURIComponent(header.backgroundImage).match(/opacity='([\d.]+)'/) ?? [])[1]),
      };
    });
    check('the header is solid paper with grain and no blur',
      grain.headerGrain && grain.headerOpaque === 'rgb(251, 250, 247)' && (grain.headerBlur === 'none' || grain.headerBlur === ''),
      `${grain.headerOpaque}, blur ${grain.headerBlur}`);
    check('the primary button has grain and no sheen', grain.buttonGrain && grain.buttonSheen === 'none', grain.buttonSheen);
    check('the ink band has grain', grain.bandGrain);
    check('the grain is under 5% opacity', grain.opacity > 0 && grain.opacity < 0.05, String(grain.opacity));
    await page.close();
    await context.close();

    // ---------------------------------------------------------------
    console.log('\nReduced motion');
    // ---------------------------------------------------------------
    const calm = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      geolocation: COPPELL,
      permissions: ['geolocation'],
      reducedMotion: 'reduce',
    });
    await calm.addInitScript(recordMotion);
    page = await openMap(calm);
    await page.waitForSelector('.marker-pill', { state: 'attached', timeout: 30000 });
    await page.waitForTimeout(300);
    check('the pills appear at once',
      (await pillAnimations(page)).length === 0 && (await page.evaluate(() => window.__drops.length)) === 0);
    const calmId = await page.evaluate(() => document.querySelector('[data-store-id]').getAttribute('data-store-id'));
    const faded = await followAndWatch(page, `[data-store-id="${calmId}"] a[href="/store/${calmId}"]`);
    check('the page crossfades with nothing named',
      faded !== null && faded.mode === 'fade' && faded.groups.length === 1 && faded.groups[0] === '::view-transition-group(root)',
      JSON.stringify(faded));
    await page.waitForURL(/\/store\//);
    check('and the price does not roll', await page.evaluate(() =>
      document.getAnimations().filter((a) => a.effect?.pseudoElement === '::before' && a.effect.target?.classList?.contains('odo-col')).length === 0));
    await calm.close();
  } catch (error) {
    check('suite ran to completion', false, error.message);
    console.error(error);
  } finally {
    if (browser) await browser.close();
    const passed = results.filter((r) => r.passed).length;
    console.log(`\n${'='.repeat(64)}`);
    console.log(`Motion polish: ${passed}/${results.length} passed`);
    for (const r of results.filter((x) => !x.passed)) console.log(`  - ${r.name}${r.detail ? `  [${r.detail}]` : ''}`);
    console.log('='.repeat(64));
    process.exit(passed === results.length ? 0 : 1);
  }
})();
