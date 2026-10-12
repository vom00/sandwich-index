/**
 * Sandwich Index — Phase 4: store detail page and submit flow
 *
 * Covers the store page (median, comparison strip, Recharts history, full log),
 * the native-<dialog> submit modal (focus, escape, backdrop, focus trap),
 * on-blur field validation, the accepted / outlier / rate-limited write paths,
 * and the reduced-motion guards on both the modal and the chart.
 *
 * Requires: a server on :3000 and the seeded Firestore emulator on :8080.
 */

const { chromium } = require('playwright');

const TARGET_URL = process.env.TARGET_URL || 'http://localhost:3000';

/*
 * Fixtures that only ever gain data are safe to pin by id; the ones defined
 * by *absence* are not.
 *
 * Every browser suite writes to the same emulator. A store with 21 reports
 * still has at least 21 tomorrow, so "rich" and "has an established price"
 * survive. But "no prices at all", "nothing recent" and "exactly one price"
 * are each one stray write from being false — and that is not hypothetical:
 * the /log bulk run logs prices to whatever stores sit nearest Coppell, and
 * it silently took this suite's unmeasured fixture from blank to $2.89,
 * failing three checks for a reason that had nothing to do with the code
 * under test.
 *
 * So absence-defined fixtures are looked up at run time instead.
 *
 * The two that used to be pinned are now looked up too. Both are about
 * visitors' prices: a long history with some reports left out of the median,
 * and an established median to push an outlier against. Once a price feed is
 * imported, the feed's price is the newest thing on file for most stores and
 * the page shows that instead, so a pinned id stops meaning what this suite
 * needs. They are found among stores with no feed price and a fresh median.
 */
let RICH = null;           // many reports, several excluded
let OUTLIER_TARGET = null; // an established price to move against

/**
 * The id of the first nearby store currently in `state`, or null.
 *
 * The predicates live inside the page callback rather than being passed in as
 * source to reconstitute — a test helper that evaluates strings is a sharp
 * edge for no benefit when there are three known cases.
 */
async function findStore(page, state) {
  return page.evaluate(async (which) => {
    const response = await fetch('/api/stores?lat=32.9546&lng=-96.99&radiusMiles=40');
    const body = await response.json();
    const NINETY_DAYS = 90 * 24 * 60 * 60 * 1000;
    const fresh = (s) => s.pricedAt !== null && Date.now() - new Date(s.pricedAt).getTime() <= NINETY_DAYS;

    const matches = {
      unmeasured: (s) => s.priceCents === null && s.reportCount === 0,
      stale: (s) =>
        s.priceCents !== null &&
        s.pricedAt !== null &&
        Date.now() - new Date(s.pricedAt).getTime() > NINETY_DAYS,
      single: (s) => s.reportCount === 1 && s.confirmedCount === 1,
      rich: (s) =>
        s.priceFeed == null && s.priceCents !== null && fresh(s) &&
        s.confirmedCount >= 8 && s.reportCount > s.confirmedCount,
      mixed: (s) => s.priceFeed != null && s.confirmedCount >= 2,
    }[which];

    const hit = (body.stores ?? []).find(matches);
    return hit ? hit.id : null;
  }, state);
}

const results = [];
function check(name, passed, detail = '') {
  results.push({ name, passed, detail });
  console.log(`${passed ? '  PASS' : '  FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
}

async function launchBrowser() {
  // Bundled Chromium cannot start on this machine (missing VC++ runtime).
  for (const channel of ['msedge', 'chrome', undefined]) {
    try {
      const options = { headless: false, slowMo: 30 };
      if (channel) options.channel = channel;
      const browser = await chromium.launch(options);
      console.log(`Browser: ${channel ?? 'bundled chromium'}\n`);
      return browser;
    } catch { /* try next */ }
  }
  throw new Error('No usable browser');
}

function watch(page) {
  const consoleErrors = [];
  const badResponses = [];
  page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));
  page.on('response', (r) => {
    if (r.status() >= 400) badResponses.push(`${r.status()} ${r.url()}`);
  });
  return { consoleErrors, badResponses };
}

async function goto(page, path) {
  await page.goto(`${TARGET_URL}${path}`, { waitUntil: 'load' });
  await page.waitForLoadState('networkidle');
}

async function apiStore(page, id) {
  return page.evaluate(async (storeId) => {
    const response = await fetch(`/api/stores/${storeId}/history`);
    return response.json();
  }, id);
}

(async () => {
  const browser = await launchBrowser();

  try {
    // =================================================================
    console.log('1. Store detail — a store with real history');
    // =================================================================
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      locale: 'en-US',
    });
    const page = await context.newPage();
    const { consoleErrors, badResponses } = watch(page);

    const before = await (async () => {
      await goto(page, '/map');
      RICH = await findStore(page, 'rich');
      // Not the same store: the outlier section reads RICH's price afterwards.
      OUTLIER_TARGET = await page.evaluate(async (rich) => {
        const body = await (await fetch('/api/stores?lat=32.9546&lng=-96.99&radiusMiles=40')).json();
        const NINETY_DAYS = 90 * 24 * 60 * 60 * 1000;
        // A report already held there is fine: section 7 prices its outlier
        // away from it. Requiring none made each run spoil the next one's.
        const hit = (body.stores ?? []).find((s) =>
          s.id !== rich && s.priceFeed == null && s.priceCents !== null &&
          s.confirmedCount >= 3 && s.pricedAt !== null &&
          Date.now() - new Date(s.pricedAt).getTime() <= NINETY_DAYS);
        return hit ? hit.id : null;
      }, RICH);
      if (RICH === null || OUTLIER_TARGET === null) {
        throw new Error(
          'No store near Coppell has a fresh visitor median with a long history ' +
          `(rich: ${RICH}, established: ${OUTLIER_TARGET}). Re-seed, then re-import feeds.`);
      }
      console.log(`  fixtures: rich ${RICH}, outlier target ${OUTLIER_TARGET}`);
      return apiStore(page, RICH);
    })();

    await goto(page, `/store/${RICH}`);

    const h1 = (await page.locator('h1').first().innerText()).trim();
    check('h1 names the store', before.store.address !== null && h1.includes(before.store.address.split(',')[0]), h1);

    const medianText = await page.locator('main .tabular').first().innerText();
    check(
      'median renders as formatted currency',
      /^\$\d+\.\d{2}$/.test(medianText.trim()),
      medianText.trim(),
    );

    check(
      'price matches the API rollup',
      medianText.trim() === `$${(before.store.priceCents / 100).toFixed(2)}`,
      `page ${medianText.trim()} vs api ${before.store.priceCents}c`,
    );

    const confidence = await page.getByText(/\d+ prices/).first().innerText();
    check('confidence shows the sample count', /\d+ prices/.test(confidence), confidence);

    // ---- comparison strip -------------------------------------------
    const strip = page.locator('section[aria-label="Comparison with nearby stores"]');
    check('comparison strip is present and labelled', await strip.count() === 1);

    const stripText = (await strip.innerText()).replace(/\s+/g, ' ');
    const hasDelta = /[+-]\$\d+\.\d{2}|\$0\.00/.test(stripText);
    const hasPercent = /[+-]?\d+\.\d%/.test(stripText);
    const hasWord = /(cheaper than|pricier than|level with) the area/.test(stripText);
    check('comparison shows a dollar delta', hasDelta, stripText.slice(0, 90));
    check('comparison shows a percentage', hasPercent);
    check('comparison states direction in words, not colour alone', hasWord);
    check(
      'comparison names its baseline and sample size',
      /median of \$\d+\.\d{2} across \d+ other stores? within 10 miles/.test(stripText),
    );

    const glyph = await strip.locator('[aria-hidden="true"]').first().innerText();
    check('direction glyph is present and hidden from screen readers',
      ['▼', '▲', '●'].includes(glyph.trim()), glyph.trim());

    // ---- chart -------------------------------------------------------
    await page.waitForSelector('.recharts-wrapper', { timeout: 15000 });
    const linePath = page.locator('path.recharts-line-curve');
    check('recharts line renders', await linePath.count() === 1);

    const dots = await page.locator('.recharts-line-dots circle').count();
    check('one dot per counted submission', dots === before.store.confirmedCount,
      `${dots} dots vs ${before.store.confirmedCount} counted`);

    // Recharts 3 hoists tick labels into their own layer rather than nesting
    // them inside the axis group.
    const yTicks = await page
      .locator('.recharts-yAxis-tick-labels .recharts-cartesian-axis-tick-value')
      // textContent, not innerText — SVG elements have no innerText.
      .allTextContents();
    check('y axis is formatted as currency, not raw cents',
      yTicks.length > 0 && yTicks.every((t) => /^\$\d+\.\d{2}$/.test(t.trim())),
      yTicks.join(' '));

    const refLine = await page.locator('.recharts-reference-line').count();
    check('median reference line is drawn', refLine === 1);

    const caption = await page.locator('figcaption').innerText();
    check('figcaption restates the chart in words',
      /\d+ counted prices between .+ and .+/.test(caption.replace(/\s+/g, ' ')),
      caption.replace(/\s+/g, ' ').slice(0, 100));

    // ---- submission log ---------------------------------------------
    const rows = await page.locator('table tbody tr').count();
    check('log lists every report, counted or not',
      rows === before.submissions.length,
      `${rows} rows vs ${before.submissions.length} submissions`);

    const countedCells = await page.locator('table tbody tr td:nth-child(4)').allInnerTexts();
    const countedRows = countedCells.filter((t) => t.trim() === 'Counted').length;
    check('counted rows equal the confirmed count',
      countedRows === before.store.confirmedCount,
      `${countedRows} vs ${before.store.confirmedCount}`);
    check('excluded rows say why they are excluded',
      countedCells.filter((t) => t.trim() !== 'Counted')
        .every((t) => /Delivery|review|Rejected/.test(t)),
      countedCells.filter((t) => t.trim() !== 'Counted').join(' / '));

    const headers = await page.locator('table thead th').allInnerTexts();
    check('table has scoped column headers',
      headers.length === 4 && await page.locator('table thead th[scope="col"]').count() === 4,
      headers.join(' | '));

    // ---- money format across the whole page --------------------------
    const allPrices = await page.locator('main .tabular').allInnerTexts();
    // Percentages are tabular too — same column-alignment reason — but they are
    // not money and are not what this assertion is about.
    const priceLike = allPrices
      .map((t) => t.trim())
      .filter((t) => /\d/.test(t) && !t.endsWith('%'));
    check('every price on the page is formatted, never a bare float',
      priceLike.every((t) => /^[+-]?\$\d{1,3}\.\d{2}$/.test(t)),
      priceLike.filter((t) => !/^[+-]?\$\d{1,3}\.\d{2}$/.test(t)).join(', ') || 'all ok');

    // =================================================================
    console.log('\n2. Store states — unmeasured, stale, single price');
    // =================================================================
    const unmeasured = await findStore(page, 'unmeasured');
    if (unmeasured === null) {
      check('an unmeasured store exists to test against', false,
        'every nearby store now has a price — re-seed to restore the state');
    } else {
      await goto(page, `/store/${unmeasured}`);
      const unmeasuredText = (await page.locator('main').innerText()).replace(/\s+/g, ' ');
      check('unmeasured store says so plainly',
        /Nobody has reported a price for this store/.test(unmeasuredText), unmeasured);
      check('unmeasured store invites the first price',
        await page.getByRole('button', { name: /Log the first price/ }).count() === 1);
      check('unmeasured store draws no chart',
        /Nothing to chart yet/.test(unmeasuredText) &&
        await page.locator('.recharts-wrapper').count() === 0);
      check('unmeasured store shows the no-prices badge',
        /No prices yet/.test(unmeasuredText));
    }

    const stale = await findStore(page, 'stale');
    if (stale === null) {
      check('a stale store exists to test against', false,
        'no store near Coppell has a price older than 90 days — re-seed');
    } else {
      await goto(page, `/store/${stale}`);
      const staleText = (await page.locator('main').innerText()).replace(/\s+/g, ' ');
      check('stale store is badged as stale with an age',
        /Stale · last seen \d+ months? ago/.test(staleText),
        staleText.match(/Stale[^\n]{0,40}/)?.[0] ?? `not found on ${stale}`);
    }

    const single = await findStore(page, 'single');
    if (single === null) {
      check('a single-price store exists to test against', false,
        'no nearby store has exactly one counted price — re-seed');
    } else {
      await goto(page, `/store/${single}`);
      const singleText = (await page.locator('main').innerText()).replace(/\s+/g, ' ');
      check('one price is not drawn as a trend',
        /One counted price so far/.test(singleText) &&
        await page.locator('.recharts-wrapper').count() === 0, single);
    }

    // A feed set the price, and visitors' older history sits well above it.
    // The chart has to show where the "now" line comes from, and the line's
    // label must not land on the date axis (it did, at the domain's floor).
    const mixed = await findStore(page, 'mixed');
    if (mixed === null) {
      check('a store with a feed price and visitor history exists to test against', false,
        'no nearby store has both — seed, then import a feed');
    } else {
      await goto(page, `/store/${mixed}`);
      await page.waitForSelector('.recharts-wrapper', { timeout: 15000 });
      const squares = await page.locator('.recharts-scatter-symbol').count();
      const feedRows = await page.locator('section', { has: page.getByRole('heading', { name: 'From price feeds' }) })
        .locator('tbody tr').count();
      check('feed prices are drawn on the chart, one square each',
        squares > 0 && squares === feedRows, `${squares} squares, ${feedRows} feed rows on ${mixed}`);
      const caption = (await page.locator('figure figcaption').filter({ hasText: 'counted prices' }).innerText()).replace(/\s+/g, ' ');
      check('the caption says what the squares are', /drawn as (a hollow square|hollow squares)/.test(caption), caption.slice(-110));
      const clash = await page.evaluate(() => {
        // Recharts 3 hoists the reference line's label into its own layer, so
        // it is found by its text rather than under the line.
        const label = [...document.querySelectorAll('.recharts-wrapper text.recharts-label')]
          .find((text) => text.textContent.startsWith('now ')) ?? null;
        const ticks = [...document.querySelectorAll('.recharts-xAxis-tick-labels .recharts-cartesian-axis-tick-value')];
        if (label === null || ticks.length === 0) return 'missing';
        const l = label.getBoundingClientRect();
        return ticks.some((tick) => {
          const t = tick.getBoundingClientRect();
          return l.left < t.right && t.left < l.right && l.top < t.bottom && t.top < l.bottom;
        }) ? 'overlaps' : 'clear';
      });
      check('the "now" label stays clear of the date axis', clash === 'clear', clash);
    }

    // =================================================================
    console.log('\n3. Modal mechanics');
    // =================================================================
    await goto(page, `/store/${RICH}`);

    const launcher = page.getByRole('button', { name: /Log a price/ });
    await launcher.click();
    await page.waitForSelector('dialog[open]');
    check('native dialog opens modally', await page.locator('dialog[open]').count() === 1);

    check('focus lands on the price field',
      await page.evaluate(() => document.activeElement?.getAttribute('name')) === 'price');

    const labelledBy = await page.locator('dialog').getAttribute('aria-labelledby');
    const titleText = await page.locator(`#${labelledBy}`).innerText();
    check('dialog is labelled by its heading', /Log a McChicken price/.test(titleText), titleText);

    // Focus trap is the platform's job once showModal() is used — verify it.
    const trapped = await page.evaluate(async () => {
      const dialog = document.querySelector('dialog[open]');
      for (let i = 0; i < 20; i += 1) {
        const focusables = dialog.querySelectorAll(
          'button, input, [tabindex]:not([tabindex="-1"])',
        );
        if (!dialog.contains(document.activeElement)) return false;
        focusables[i % focusables.length].focus();
      }
      return dialog.contains(document.activeElement);
    });
    check('focus cannot leave the dialog', trapped);

    // Chromium's tab cycle inside a modal dialog wraps by way of <body> for a
    // single press. That is not an escape — what matters is that no focusable
    // element behind the dialog ever receives focus.
    let escapee = null;
    for (let i = 0; i < 18; i += 1) {
      await page.keyboard.press('Tab');
      const where = await page.evaluate(() => {
        const dialog = document.querySelector('dialog[open]');
        const active = document.activeElement;
        if (active === null || dialog === null) return 'null';
        if (dialog.contains(active)) return null;
        return active === document.body
          ? null
          : `${active.tagName.toLowerCase()} ${(active.textContent || '').trim().slice(0, 24)}`;
      });
      if (where !== null) { escapee = `press ${i + 1}: ${where}`; break; }
    }
    check('18 tab presses never reach content behind the dialog',
      escapee === null, escapee ?? '');

    await page.keyboard.press('Escape');
    await page.waitForSelector('dialog[open]', { state: 'detached', timeout: 3000 })
      .catch(() => {});
    check('Escape closes the dialog', await page.locator('dialog[open]').count() === 0);
    check('focus returns to the button that opened it',
      await page.evaluate(() => document.activeElement?.textContent?.includes('Log a price') ?? false));

    await launcher.click();
    await page.waitForSelector('dialog[open]');
    await page.locator('dialog [aria-hidden="true"].absolute').first().click({ position: { x: 5, y: 5 } });
    await page.waitForTimeout(400);
    check('backdrop click closes the dialog', await page.locator('dialog[open]').count() === 0);

    await launcher.click();
    await page.waitForSelector('dialog[open]');
    await page.getByRole('button', { name: 'Close' }).click();
    await page.waitForTimeout(400);
    check('close button closes the dialog', await page.locator('dialog[open]').count() === 0);

    // =================================================================
    console.log('\n4. Inline validation, on blur, next to the field');
    // =================================================================
    await launcher.click();
    await page.waitForSelector('dialog[open]');

    const priceField = page.locator('input[name="price"]');
    const describedBy = await priceField.getAttribute('aria-describedby');
    check('price field is described by its hint before any error',
      describedBy !== null && describedBy.split(' ').length === 1);

    const cases = [
      ['abc', /Dollars and cents only/],
      ['0.50', /under \$1\.00/],
      ['99.99', /over \$15\.00/],
      ['', /Enter the price you saw/],
    ];

    for (const [value, pattern] of cases) {
      await priceField.fill(value);
      await priceField.blur();
      await page.waitForTimeout(120);
      const ids = (await priceField.getAttribute('aria-describedby') ?? '').split(' ');
      const errorId = ids[ids.length - 1];
      const errorText = await page.locator(`#${errorId}`).innerText().catch(() => '');
      const invalid = await priceField.getAttribute('aria-invalid');
      check(`"${value || '(empty)'}" is rejected with a specific message`,
        pattern.test(errorText) && invalid === 'true', errorText);

      if (value === 'abc') {
        const geometry = await page.evaluate(() => {
          const input = document.querySelector('input[name="price"]');
          const ids = (input.getAttribute('aria-describedby') || '').split(' ');
          const error = document.getElementById(ids[ids.length - 1]);
          return error.getBoundingClientRect().top - input.getBoundingClientRect().bottom;
        });
        check('error sits directly beneath its field', geometry >= 0 && geometry < 24,
          `${Math.round(geometry)}px below`);
      }
    }

    await priceField.fill('3.29');
    await priceField.blur();
    await page.waitForTimeout(120);
    check('a valid price clears the error',
      await priceField.getAttribute('aria-invalid') === 'false' &&
      await page.locator('dialog form [role="alert"]').count() === 0);

    // =================================================================
    console.log('\n5. Submitting — accepted');
    // =================================================================
    const recomputeCalls = [];
    page.on('request', (r) => {
      if (r.url().includes('/recompute')) recomputeCalls.push(r.method() + ' ' + r.url());
    });

    await page.locator('input[name="source"][value="drive_thru"]').check();
    await page.locator('dialog button[type="submit"]').click();
    await page.waitForSelector('dialog [role="status"]', { timeout: 15000 });

    const confirmation = (await page.locator('dialog [role="status"]').innerText()).replace(/\s+/g, ' ');
    check('confirmation echoes the price that was logged',
      /\$3\.29 logged/.test(confirmation), confirmation.slice(0, 80));
    check('accepted price is described as the store price now',
      /price from now on/.test(confirmation));
    check('recompute was called after the write', recomputeCalls.length >= 1,
      recomputeCalls.join(', '));

    const after = await apiStore(page, RICH);
    check('submission count went up by exactly one',
      after.submissions.length === before.submissions.length + 1,
      `${before.submissions.length} → ${after.submissions.length}`);
    check('price was recomputed server-side, in integer cents',
      Number.isInteger(after.store.priceCents) &&
      after.store.confirmedCount === before.store.confirmedCount + 1,
      `${before.store.priceCents}c/${before.store.confirmedCount} → ${after.store.priceCents}c/${after.store.confirmedCount}`);
    check('the new submission was stored as drive_thru at 329 cents',
      after.submissions.some((s) => s.priceCents === 329 && s.source === 'drive_thru'));

    await page.getByRole('button', { name: 'Done' }).click();
    await page.waitForTimeout(500);
    check('dialog closes from the confirmation', await page.locator('dialog[open]').count() === 0);

    await page.waitForTimeout(1200);
    const refreshedRows = await page.locator('table tbody tr').count();
    check('the page behind the modal refreshed itself',
      refreshedRows === after.submissions.length,
      `${refreshedRows} rows vs ${after.submissions.length}`);

    // =================================================================
    console.log('\n6. Submitting — rate limited on the same store');
    // =================================================================
    await launcher.click();
    await page.waitForSelector('dialog[open]');
    await priceField.fill('3.39');
    await page.locator('dialog button[type="submit"]').click();
    await page.waitForSelector('dialog form [role="alert"]', { timeout: 15000 });

    const rateLimited = (await page.locator('dialog form [role="alert"]').innerText())
      .replace(/\s+/g, ' ');
    check('a second submission today is refused',
      /already logged a price for this store today/i.test(rateLimited), rateLimited.slice(0, 80));
    check('refusal says when they can try again',
      /You can log this store again after/.test(rateLimited));
    check('the form is still there to retry from',
      await page.locator('dialog input[name="price"]').count() === 1);

    const unchanged = await apiStore(page, RICH);
    check('the refused submission did not reach the database',
      unchanged.submissions.length === after.submissions.length,
      `${unchanged.submissions.length}`);

    await page.keyboard.press('Escape');
    await page.waitForTimeout(400);

    // =================================================================
    console.log('\n7. Submitting — outlier held for review');
    // =================================================================
    await goto(page, `/store/${OUTLIER_TARGET}`);
    const outlierBefore = await apiStore(page, OUTLIER_TARGET);

    // The wild price is computed, not fixed. A fixed $5.99 corroborates the
    // $5.99 the previous run left held — the second report within 5% promotes
    // both to accepted and MOVES the price, which is the corroboration model
    // doing its job, not a bug. To observe the held path the price must be
    // >40% from the current price AND >5% from anything already held.
    const currentCents = outlierBefore.store.priceCents ?? 300;
    let wildCents = Math.round(currentCents * 1.6);
    const heldBefore = outlierBefore.store.heldPriceCents;
    if (heldBefore !== null && Math.abs(wildCents - heldBefore) * 100 <= heldBefore * 5) {
      wildCents = Math.round(heldBefore * 1.12);
    }
    const wildText = `$${(wildCents / 100).toFixed(2)}`;

    await page.getByRole('button', { name: /Log a price/ }).click();
    await page.waitForSelector('dialog[open]');
    await page.locator('input[name="price"]').fill((wildCents / 100).toFixed(2));
    await page.locator('dialog button[type="submit"]').click();
    await page.waitForSelector('dialog [role="status"]', { timeout: 15000 });

    const held = (await page.locator('dialog [role="status"]').innerText()).replace(/\s+/g, ' ');
    check('a wild price is held for review, not rejected outright',
      /held rather than applied/.test(held), `${wildText} → ${held.slice(0, 100)}`);
    check('the reason given is the 40% band, not an accusation',
      /40%/.test(held) && /not an accusation/.test(held));

    const outlierAfter = await apiStore(page, OUTLIER_TARGET);
    const pending = outlierAfter.submissions.find((s) => s.priceCents === wildCents);
    check('outlier is stored with pending status', pending?.status === 'pending',
      JSON.stringify(pending ?? null));
    check('outlier does not move the price',
      outlierAfter.store.priceCents === outlierBefore.store.priceCents,
      `${outlierBefore.store.priceCents}c → ${outlierAfter.store.priceCents}c`);
    check('outlier is not counted in the sample',
      outlierAfter.store.confirmedCount === outlierBefore.store.confirmedCount);

    await page.getByRole('button', { name: 'Done' }).click();
    await page.waitForTimeout(1200);
    const heldRow = await page.locator('table tbody tr', { hasText: wildText }).first().innerText();
    check('the held submission is published in the log with its reason',
      /Held for review/.test(heldRow), heldRow.replace(/\s+/g, ' '));

    check('no console errors across the whole flow',
      consoleErrors.length === 0, consoleErrors.slice(0, 3).join(' | '));
    check('no failed requests across the whole flow',
      badResponses.length === 0, badResponses.slice(0, 3).join(' | '));

    await context.close();

    // =================================================================
    console.log('\n8. Motion — animated by default');
    // =================================================================
    const motionContext = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      reducedMotion: 'no-preference',
    });
    const motionPage = await motionContext.newPage();
    await goto(motionPage, `/store/${RICH}`);

    await motionPage.waitForSelector('.recharts-line-curve');
    const animatedDash = await motionPage.locator('.recharts-line-curve')
      .getAttribute('stroke-dasharray');
    check('chart line draws itself in (dasharray animation present)',
      animatedDash !== null && animatedDash !== '', String(animatedDash));

    const panelFrames = await motionPage.evaluate(async () => {
      document.querySelector('main button').click();
      const seen = new Set();
      for (let i = 0; i < 12; i += 1) {
        const panel = document.querySelector('dialog .max-w-lg');
        if (panel) seen.add(getComputedStyle(panel).transform);
        await new Promise((r) => setTimeout(r, 18));
      }
      return [...seen];
    });
    check('modal panel animates through intermediate transforms',
      panelFrames.length > 1, `${panelFrames.length} distinct transforms`);
    await motionContext.close();

    // =================================================================
    console.log('\n9. Motion — prefers-reduced-motion: reduce');
    // =================================================================
    const stillContext = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      reducedMotion: 'reduce',
    });
    const stillPage = await stillContext.newPage();
    const stillWatch = watch(stillPage);
    await goto(stillPage, `/store/${RICH}`);

    await stillPage.waitForSelector('.recharts-line-curve');
    const stillDash = await stillPage.locator('.recharts-line-curve')
      .getAttribute('stroke-dasharray');
    check('chart does not animate under reduced motion',
      stillDash === null || stillDash === '', String(stillDash));

    const stillFrames = await stillPage.evaluate(async () => {
      document.querySelector('main button').click();
      const seen = new Set();
      for (let i = 0; i < 12; i += 1) {
        const panel = document.querySelector('dialog .max-w-lg');
        if (panel) seen.add(getComputedStyle(panel).transform);
        await new Promise((r) => setTimeout(r, 18));
      }
      return [...seen];
    });
    const settled = stillFrames.every((t) => t === 'none' || t === 'matrix(1, 0, 0, 1, 0, 0)');
    check('modal appears without motion under reduced motion',
      settled, stillFrames.join(' / '));

    const backdropOpacity = await stillPage.evaluate(() => {
      const backdrop = document.querySelector('dialog [aria-hidden="true"].absolute');
      return backdrop ? getComputedStyle(backdrop).opacity : 'missing';
    });
    check('backdrop fade is guarded too — it lands at full opacity immediately',
      backdropOpacity === '1', String(backdropOpacity));

    const spinners = await stillPage.locator('.animate-spin').count();
    check('no unguarded spinner is left running under reduced motion',
      spinners === 0 || await stillPage.evaluate(() =>
        [...document.querySelectorAll('.animate-spin')]
          .every((el) => getComputedStyle(el).animationName === 'none')),
      `${spinners} spinner(s) present`);

    check('no console errors under reduced motion',
      stillWatch.consoleErrors.length === 0, stillWatch.consoleErrors.slice(0, 2).join(' | '));
    await stillContext.close();

    // =================================================================
    console.log('\n10. Touch targets and mobile layout');
    // =================================================================
    const mobileContext = await browser.newContext({
      viewport: { width: 375, height: 812 },
      isMobile: true,
      hasTouch: true,
    });
    const mobilePage = await mobileContext.newPage();
    await goto(mobilePage, `/store/${RICH}`);

    const pageOverflow = await mobilePage.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check('store page does not scroll sideways at 375px', pageOverflow <= 0,
      `${pageOverflow}px overflow`);

    await mobilePage.getByRole('button', { name: /Log a price/ }).click();
    await mobilePage.waitForSelector('dialog[open]');
    await mobilePage.waitForTimeout(350);

    const smallTargets = await mobilePage.evaluate(() => {
      const dialog = document.querySelector('dialog[open]');
      const targets = [...dialog.querySelectorAll('button, input, label')];
      return targets
        .filter((el) => el.getBoundingClientRect().height > 0)
        .filter((el) => {
          // A radio's target is the label wrapping it, which is measured too.
          if (el.tagName === 'INPUT' && el.type === 'radio') return false;
          // A `for=` label is a caption, not a target — the field it names is
          // the thing you hit, and that is measured on its own.
          if (el.tagName === 'LABEL' && el.querySelector('input') === null) return false;
          return el.getBoundingClientRect().height < 44;
        })
        .map((el) => `${el.tagName.toLowerCase()}:${Math.round(el.getBoundingClientRect().height)}px:${(el.textContent || el.name || '').trim().slice(0, 20)}`);
    });
    check('every touch target in the modal clears 44px',
      smallTargets.length === 0, smallTargets.join(', '));

    const modalOverflow = await mobilePage.evaluate(() =>
      document.documentElement.scrollWidth - document.documentElement.clientWidth);
    check('modal does not scroll the page sideways at 375px', modalOverflow <= 0,
      `${modalOverflow}px overflow`);

    const fitsViewport = await mobilePage.evaluate(() => {
      const panel = document.querySelector('dialog .max-w-lg').getBoundingClientRect();
      return panel.top >= -1 && panel.bottom <= window.innerHeight + 1;
    });
    check('modal panel fits inside the small viewport', fitsViewport);
    await mobileContext.close();

    // =================================================================
    console.log('\n11. Trademark hygiene and attribution');
    // =================================================================
    const hygieneContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const hygienePage = await hygieneContext.newPage();
    await goto(hygienePage, `/store/${RICH}`);

    const body = await hygienePage.locator('body').innerText();
    check('OpenStreetMap is credited on the page',
      /OpenStreetMap/.test(body));
    check('non-affiliation disclaimer is present',
      /not affiliated|no affiliation|not endorsed/i.test(body),
      body.match(/[^.]*affiliat[^.]*\./i)?.[0]?.trim().slice(0, 90) ?? 'not found');
    check('the McDonald\'s marks appear only descriptively, never as branding',
      !/class="[^"]*mcdonald/i.test(await hygienePage.content()));

    const requests = [];
    hygienePage.on('request', (r) => requests.push(r.url()));
    await goto(hygienePage, `/store/${OUTLIER_TARGET}`);
    check('no request is made to any McDonald\'s domain',
      !requests.some((u) => /mcdonalds?\./i.test(u)),
      requests.filter((u) => /mcdonalds?\./i.test(u)).join(', ') || 'none');
    await hygieneContext.close();

  } catch (error) {
    check('suite ran to completion', false, error.message);
    console.error(error);
  } finally {
    await browser.close();

    const passed = results.filter((r) => r.passed).length;
    console.log(`\n${'='.repeat(64)}`);
    console.log(`Phase 4: ${passed}/${results.length} passed`);
    if (passed !== results.length) {
      console.log('\nFailures:');
      for (const r of results.filter((x) => !x.passed)) {
        console.log(`  - ${r.name}${r.detail ? `  [${r.detail}]` : ''}`);
      }
    }
    console.log('='.repeat(64));
    process.exit(passed === results.length ? 0 : 1);
  }
})();
