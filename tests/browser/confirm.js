/**
 * "Still this price?": one tap on a store page confirms the price on file.
 *
 * What it promises:
 *   - A priced store offers it, with one button per place a price is seen
 *     (no delivery); an unpriced store does not.
 *   - One tap, no typing: the store's price is dated today, a report of that
 *     same price and source appears in the log, and a feed's price becomes a
 *     visitor's.
 *   - It is an ordinary report, so the once-a-day rule holds: a second tap
 *     the same day, by the same visitor, is refused and says so.
 *
 * Needs the dev server and the emulator, like the other suites. It writes
 * reports to the emulator (never to production). Each run uses a fresh
 * browser context, so a fresh anonymous visitor.
 */
const { chromium } = require('playwright');

const TARGET_URL = process.env.TARGET_URL || 'http://localhost:3000';

const results = [];
function check(name, passed, detail = '') {
  results.push({ name, passed, detail });
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? `  [${detail}]` : ''}`);
}

const history = async (id) => (await fetch(`${TARGET_URL}/api/stores/${id}/history`)).json();

(async () => {
  let browser;
  try {
    const listing = await (await fetch(`${TARGET_URL}/api/stores?lat=32.9546&lng=-96.99&radiusMiles=15`)).json();
    // A store priced by a feed, so the confirm visibly turns it into a
    // visitor's price; any priced store would do for the rest.
    const target =
      listing.stores.find((store) => store.priceCents !== null && store.priceFeed !== null && store.heldPriceCents === null) ??
      listing.stores.find((store) => store.priceCents !== null);
    const unpriced = listing.stores.find((store) => store.priceCents === null);
    check('the emulator has a priced and an unpriced store', Boolean(target && unpriced));
    if (!target || !unpriced) throw new Error('no stores to test with');
    const price = `$${(target.priceCents / 100).toFixed(2)}`;

    browser = await chromium.launch({ channel: 'msedge' });
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const page = await context.newPage();

    await page.goto(`${TARGET_URL}/store/${unpriced.id}`, { waitUntil: 'networkidle' });
    check('an unpriced store has nothing to confirm', (await page.getByRole('group', { name: /still \$/i }).count()) === 0);

    await page.goto(`${TARGET_URL}/store/${target.id}`, { waitUntil: 'networkidle' });
    const group = page.getByRole('group', { name: new RegExp(`still \\${price}`, 'i') });
    check('a priced store asks "Still <price>?"', await group.isVisible(), price);
    const labels = await group.getByRole('button').allTextContents();
    check('one button per place a price is seen, no delivery',
      labels.join('|') === 'In store|Drive-thru|Mobile app', labels.join('|'));
    check('no text field to type in', (await group.locator('input').count()) === 0);

    const before = await history(target.id);
    const reportsBefore = (before.submissions ?? []).length;

    await group.getByRole('button', { name: 'Drive-thru' }).click();
    const thanks = page.getByRole('status').filter({ hasText: /confirmed as of today/i });
    await thanks.waitFor({ timeout: 20000 });
    check('one tap: thanked, the price confirmed as of today', (await thanks.textContent()).includes(price));

    const after = await history(target.id);
    const newest = (after.submissions ?? [])[0];
    check('a report of that same price and source was recorded',
      (after.submissions ?? []).length === reportsBefore + 1 && newest?.priceCents === target.priceCents && newest?.source === 'drive_thru',
      JSON.stringify(newest ?? null));
    check('the store\'s price is dated today and now a visitor\'s',
      after.store?.priceFeed === null && Date.now() - new Date(after.store?.pricedAt).getTime() < 10 * 60 * 1000,
      `priceFeed ${after.store?.priceFeed}, pricedAt ${after.store?.pricedAt}`);

    await page.goto(`${TARGET_URL}/store/${target.id}`, { waitUntil: 'networkidle' });
    const card = await page.locator('[data-morph-page]').textContent();
    check('the page says so after a reload', /last confirmed today/.test(card));

    const again = page.getByRole('group', { name: new RegExp(`still \\${price}`, 'i') });
    await again.getByRole('button', { name: 'In store' }).click();
    const refused = page.getByRole('status').filter({ hasText: /already logged/i });
    await refused.waitFor({ timeout: 20000 });
    check('a second tap the same day is refused, and says why', await refused.isVisible(), await refused.textContent());
    const unchanged = await history(target.id);
    check('and records nothing', (unchanged.submissions ?? []).length === reportsBefore + 1);
  } catch (error) {
    check('suite ran to completion', false, error.message);
    console.error(error);
  } finally {
    await browser?.close();
    const passed = results.filter((r) => r.passed).length;
    console.log(`\n${'='.repeat(64)}`);
    console.log(`Still this price: ${passed}/${results.length} passed`);
    for (const r of results.filter((x) => !x.passed)) console.log(`  - ${r.name}${r.detail ? `  [${r.detail}]` : ''}`);
    console.log('='.repeat(64));
    process.exit(passed === results.length ? 0 : 1);
  }
})();
