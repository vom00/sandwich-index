/**
 * Reading a McChicken price from a photo, on the store page's "Log a price"
 * form (src/components/store/ReadFromPhoto.tsx).
 *
 * The photos are rendered here, at run time, so they carry today's date and
 * the store's real restaurant number: receipts in the thermal style the
 * 2026-10-12 spike used, and an app item screen. They are mock-ups, not real
 * receipts (no freely licensed photo of a US McDonald's receipt exists), so
 * this proves the wiring and the rules, not accuracy on crumpled paper.
 *
 * What it promises:
 *   - A receipt from this store fills in the price and nothing else is sent.
 *   - The photo never leaves the device: no request carries it, and the OCR
 *     engine loads from this site, not a CDN.
 *   - A receipt from another store, one older than a week, or one with only a
 *     meal on it fills in nothing and says why. Another store's receipt links
 *     to that store's page.
 *   - An app screenshot sets "Where was the price?" to Mobile app.
 *   - A filled-in price still goes through the normal submit.
 *
 * Needs `npm run dev` and the emulator, with restaurant numbers imported
 * (npm run import:store-numbers), like the saved data has.
 */

const fs = require('fs');
const os = require('os');
const path = require('path');
const { chromium } = require('playwright');

const TARGET_URL = process.env.TARGET_URL || 'http://localhost:3000';
const COPPELL = { lat: 32.9546, lng: -96.99 };
const SHOTS = path.join(os.tmpdir(), 'sandwich-index-receipts');

const results = [];
function check(name, passed, detail = '') {
  results.push({ name, passed, detail });
  console.log(`${passed ? '  PASS' : '  FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
}

function mdy(daysAgo) {
  const d = new Date(Date.now() - daysAgo * 86400000);
  return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`;
}

function receiptHtml({ number, street, locality, daysAgo, items }) {
  const pad = (left, right) => left + ' '.repeat(Math.max(1, 30 - left.length - right.length)) + right;
  const lines = [
    `   McDonald's Restaurant #${number}`,
    `      ${street}`,
    `        ${locality}`,
    '',
    pad('KS# 2', `${mdy(daysAgo)} 12:41 PM`),
    pad('Side1', 'Order 37'),
    '',
    ...items.map(([name, price]) => pad(`1 ${name}`, price)),
    '',
    pad('Subtotal', '9.99'),
    pad('Take-Out Total', '10.81'),
  ].join('\n');
  return `<!doctype html><body style="margin:0;background:#8a8478">
<div style="width:300px;margin:30px auto;padding:22px 18px;background:#f4f1ea;transform:rotate(-1deg);
font:15px/1.35 'Courier New',monospace;color:#3b3b3b;white-space:pre">${lines}</div></body>`;
}

function appHtml({ street, price }) {
  return `<!doctype html><body style="margin:0;width:390px;background:#fff;font-family:Arial,sans-serif;color:#292929">
<div style="padding:14px 18px;border-bottom:1px solid #ddd;font-size:14px">Pickup at<br><b style="font-size:16px">${street}</b></div>
<div style="height:200px;background:#f2efe9;margin:0 0 16px"></div>
<div style="padding:0 18px 30px"><div style="font-size:26px;font-weight:bold">McChicken&reg;</div>
<div style="font-size:20px;margin-top:6px">$${price} <span style="color:#777;font-size:15px">| 400 Cal.</span></div></div></body>`;
}

/** The street line of an address, as a receipt prints it. */
function receiptStreet(address) {
  return address.split(',')[0].toUpperCase();
}

async function render(browser, name, html) {
  const page = await browser.newPage({ viewport: { width: 420, height: 640 }, deviceScaleFactor: 2 });
  await page.setContent(html);
  const file = path.join(SHOTS, `${name}.png`);
  await page.screenshot({ path: file, fullPage: true });
  await page.close();
  return file;
}

async function openForm(context, storeId) {
  const page = await context.newPage();
  await page.goto(`${TARGET_URL}/store/${storeId}`, { waitUntil: 'load' });
  await page.waitForLoadState('networkidle');
  await page.getByRole('button', { name: /^Log (a|the first) price$/ }).click();
  await page.waitForSelector('dialog[open]');
  return page;
}

async function readPhoto(page, file) {
  await page.locator('[data-testid="photo-input"]').setInputFiles(file);
  await page.waitForFunction(() => {
    const text = document.querySelector('dialog [role="status"]')?.textContent ?? '';
    return text !== '' && !/Getting the photo reader ready|Reading the photo/.test(text);
  }, null, { timeout: 60000 });
  return (await page.locator('dialog [role="status"]').first().innerText()).replace(/\s+/g, ' ');
}

(async () => {
  let browser;
  try {
    fs.mkdirSync(SHOTS, { recursive: true });
    browser = await chromium.launch({ channel: 'msedge' });

    // Two stores with a restaurant number and a street address. The one the
    // price is logged at already has a price, and the receipt shows that same
    // price: an unpriced store is a fixture other suites need to find
    // unpriced, and a different price would move what the map shows.
    const listing = await (await fetch(`${TARGET_URL}/api/stores?lat=${COPPELL.lat}&lng=${COPPELL.lng}&radiusMiles=15`)).json();
    const numbered = (listing.stores ?? []).filter((s) => s.restaurantNumber && s.address && /^\d+\s/.test(s.address));
    const here = numbered.find((s) => s.priceCents !== null);
    const there = numbered.find((s) => s !== here);
    if (here === undefined || there === undefined) throw new Error('Need two stores with restaurant numbers; run npm run import:store-numbers');
    const price = (here.priceCents / 100).toFixed(2);
    console.log(`Store under test: ${here.address} (#${here.restaurantNumber}); other: ${there.address} (#${there.restaurantNumber})\n`);

    const locality = (s) => s.address.split(',').slice(1).join(',').trim().toUpperCase();
    const files = {
      good: await render(browser, 'good', receiptHtml({ number: here.restaurantNumber, street: receiptStreet(here.address), locality: locality(here), daysAgo: 0, items: [['McChicken', price], ['M Coke', '1.39']] })),
      elsewhere: await render(browser, 'elsewhere', receiptHtml({ number: there.restaurantNumber, street: receiptStreet(there.address), locality: locality(there), daysAgo: 0, items: [['McChicken', '2.19']] })),
      old: await render(browser, 'old', receiptHtml({ number: here.restaurantNumber, street: receiptStreet(here.address), locality: locality(here), daysAgo: 30, items: [['McChicken', '2.29']] })),
      meal: await render(browser, 'meal', receiptHtml({ number: here.restaurantNumber, street: receiptStreet(here.address), locality: locality(here), daysAgo: 0, items: [['McChicken Meal', '7.89'], ['Spicy McChicken', '2.99']] })),
      app: await render(browser, 'app', appHtml({ street: here.address.split(',').slice(0, 2).join(','), price })),
    };

    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const noise = [];
    const leaks = [];
    const hosts = new Set();
    context.on('console', (m) => { if (m.type() === 'error') noise.push(m.text()); });
    context.on('request', (request) => {
      // The OCR worker runs from a blob: URL, which has no host to check.
      if (/^https?:/.test(request.url())) hosts.add(new URL(request.url()).host);
      const body = request.postDataBuffer();
      if (body !== null && body.length > 20000) leaks.push(`${request.method()} ${request.url()} ${body.length} bytes`);
    });

    // ---------------------------------------------------------------
    console.log('A receipt from this store');
    // ---------------------------------------------------------------
    let page = await openForm(context, here.id);
    const button = page.getByRole('button', { name: 'Read the price from a photo' });
    check('the form offers to read a photo', await button.isVisible());
    check('it says the photo stays on the device',
      /read on this device and never uploaded/.test(await page.locator('dialog').innerText()));
    const box = await button.boundingBox();
    check('the button is a full-size tap target', box !== null && box.height >= 44, `${box?.height}px`);

    const t0 = Date.now();
    const found = await readPhoto(page, files.good);
    check('it finds the McChicken', found.includes(`Found a McChicken at $${price} on this receipt`), found.slice(0, 120));
    check('it fills in the price', (await page.locator('input[name="price"]').inputValue()) === price);
    check('and leaves "Where was the price?" alone for a receipt',
      await page.locator('input[name="source"][value="in_store"]').isChecked());
    console.log(`    (read in ${Date.now() - t0} ms, engine download included)`);

    check('no request carried the photo', leaks.length === 0, leaks.join(' | '));
    check('the OCR engine loaded from this site, not a CDN',
      [...hosts].every((host) => host === new URL(TARGET_URL).host), [...hosts].join(', '));

    await page.getByRole('button', { name: 'Log this price' }).click();
    await page.waitForSelector('dialog h2:has-text("Thanks, that\'s in")', { timeout: 20000 });
    check('the filled-in price submits like a typed one',
      (await page.locator('dialog').innerText()).includes(`$${price} logged`));
    await page.close();

    // ---------------------------------------------------------------
    console.log('\nPhotos that fill in nothing');
    // ---------------------------------------------------------------
    page = await openForm(context, here.id);
    const wrong = await readPhoto(page, files.elsewhere);
    check('another store\'s receipt is refused', /is from a different McDonald.s/.test(wrong) && /Nothing was filled in/.test(wrong), wrong.slice(0, 140));
    check('and the price stays empty', (await page.locator('input[name="price"]').inputValue()) === '');
    const link = page.locator('dialog [role="status"] a');
    check('it links to that store\'s page',
      (await link.count()) === 1 && (await link.getAttribute('href')) === `/store/${there.id}`,
      await link.getAttribute('href').catch(() => 'no link'));

    const old = await readPhoto(page, files.old);
    check('a receipt older than a week is refused', /only receipts from the last 7 days/.test(old), old.slice(0, 140));

    const meal = await readPhoto(page, files.meal);
    check('a meal and a Spicy McChicken are not the sandwich', /not the sandwich on its own/.test(meal), meal.slice(0, 140));
    check('none of them filled anything in', (await page.locator('input[name="price"]').inputValue()) === '');
    await page.close();

    // ---------------------------------------------------------------
    console.log('\nAn app screenshot');
    // ---------------------------------------------------------------
    page = await openForm(context, here.id);
    const app = await readPhoto(page, files.app);
    check('it reads the app\'s price', app.includes(`Found a McChicken at $${price} in this app screenshot`), app.slice(0, 120));
    check('and sets the source to Mobile app', await page.locator('input[name="source"][value="app"]').isChecked());
    await page.close();

    check('nothing is logged to the console', noise.length === 0, noise.slice(0, 2).join(' | '));
    await context.close();

    // ---------------------------------------------------------------
    console.log('\nKeyboard');
    // ---------------------------------------------------------------
    const kb = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    page = await openForm(kb, here.id);
    let reached = false;
    for (let i = 0; i < 6 && !reached; i += 1) {
      await page.keyboard.press('Tab');
      reached = await page.evaluate(() => document.activeElement?.textContent?.includes('Read the price from a photo') ?? false);
    }
    check('the photo button is reachable by Tab', reached);
    await kb.close();
  } catch (error) {
    check('suite ran to completion', false, error.message);
    console.error(error);
  } finally {
    if (browser) await browser.close();
    const passed = results.filter((r) => r.passed).length;
    console.log(`\n${'='.repeat(64)}`);
    console.log(`Photo reader: ${passed}/${results.length} passed`);
    for (const r of results.filter((x) => !x.passed)) console.log(`  - ${r.name}${r.detail ? `  [${r.detail}]` : ''}`);
    console.log('='.repeat(64));
    process.exit(passed === results.length ? 0 : 1);
  }
})();
