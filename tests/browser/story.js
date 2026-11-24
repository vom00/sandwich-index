/**
 * The monthly data story (`/story/<yyyy-mm>`).
 *
 * What it promises:
 *   - Every figure on the page is the one in the month's file
 *     (`src/data/monthly/<yyyy-mm>.json`), and nothing more: the state
 *     medians and names, the change counts and each named store's two prices.
 *   - A figure the file leaves null is shown blank, says why, and is named in
 *     the introduction. No number stands in for it.
 *   - The visitor count is read live from the database: with
 *     FIRESTORE_EMULATOR_HOST set it must equal the accepted reports sent in
 *     the month there.
 *   - Only months on file exist; any other is a 404.
 *   - One moment: the two medians roll up once as the page opens, then stop.
 *     Under reduced motion nothing rolls.
 *
 * Needs the dev server; with FIRESTORE_EMULATOR_HOST it also reads the
 * emulator the server uses, to check the live count.
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const TARGET_URL = process.env.TARGET_URL || 'http://localhost:3000';
const DIR = path.join(__dirname, '../../src/data/monthly');

const results = [];
function check(name, passed, detail = '') {
  results.push({ name, passed, detail });
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? `  [${detail}]` : ''}`);
}

const dollars = (cents) => `$${(cents / 100).toFixed(2)}`;
const count = (n) => n.toLocaleString('en-US');

/** Accepted reports sent in the month, read from the emulator the way the page reads them. */
async function emulatorConfirmed(month) {
  const host = process.env.FIRESTORE_EMULATOR_HOST;
  if (!host) return null;
  const [year, mm] = month.split('-').map(Number);
  const at = (y, m) => ({ timestampValue: new Date(Date.UTC(y, m - 1, 1)).toISOString() });
  const project = process.env.FIREBASE_PROJECT_ID || 'demo-sandwich-index';
  const response = await fetch(`http://${host}/v1/projects/${project}/databases/(default)/documents:runQuery`, {
    method: 'POST',
    headers: { Authorization: 'Bearer owner', 'Content-Type': 'application/json' },
    body: JSON.stringify({ structuredQuery: {
      from: [{ collectionId: 'submissions' }],
      select: { fields: [{ fieldPath: 'status' }] },
      where: { compositeFilter: { op: 'AND', filters: [
        { fieldFilter: { field: { fieldPath: 'submittedAt' }, op: 'GREATER_THAN_OR_EQUAL', value: at(year, mm) } },
        { fieldFilter: { field: { fieldPath: 'submittedAt' }, op: 'LESS_THAN', value: at(year, mm + 1) } },
      ] } },
    } }),
  });
  const rows = await response.json();
  return rows.filter((row) => row.document?.fields?.status?.stringValue === 'accepted').length;
}

(async () => {
  let browser;
  try {
    const month = fs.readdirSync(DIR).filter((f) => /^\d{4}-\d{2}\.json$/.test(f)).map((f) => f.slice(0, 7)).sort().at(-1);
    check('a month is on file', Boolean(month), month);
    const story = JSON.parse(fs.readFileSync(path.join(DIR, `${month}.json`), 'utf8'));

    const missingStatus = (await fetch(`${TARGET_URL}/story/1999-01`)).status;
    check('a month not on file is a 404', missingStatus === 404, String(missingStatus));

    browser = await chromium.launch({ channel: 'msedge' });
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: 'no-preference' });
    const page = await context.newPage();
    const response = await page.goto(`${TARGET_URL}/story/${month}`, { waitUntil: 'load' });
    check('the month\'s page opens', response.status() === 200);

    const read = () => page.evaluate(() => {
      const section = (id) => document.querySelector(`[aria-labelledby="${id}"]`);
      const text = (el) => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
      return {
        h1: text(document.querySelector('h1')),
        intro: text(document.querySelector('main h1 + p')),
        cards: [...(section('states')?.querySelectorAll('.odo') ?? [])].map((odo) => ({
          value: odo.querySelector('.sr-only')?.textContent,
          card: text(odo.closest('.reveal')),
        })),
        movers: text(section('movers')?.querySelector('p')),
        rows: [...(section('movers')?.querySelectorAll('li') ?? [])].map((li) => ({
          text: text(li),
          href: li.querySelector('a')?.getAttribute('href'),
        })),
        blanks: Object.fromEntries(['states', 'movers', 'confirmed'].map((id) => [id, text(section(id)?.querySelector('.border-dashed'))])),
        confirmed: text(section('confirmed')),
        counted: section('confirmed')?.querySelector('[data-counted]')?.getAttribute('data-counted') ?? null,
        rolling: document.getAnimations().filter((a) => a.effect?.pseudoElement === '::before' && a.effect.target?.classList?.contains('odo-col')).length,
      };
    });
    const seen = await read();

    check('the heading is the month', /^[A-Z][a-z]+ \d{4}$/.test(seen.h1), seen.h1);

    if (story.states) {
      const { cheapest, priciest } = story.states;
      check('the two medians are the file\'s', seen.cards.map((c) => c.value).join(' ') === `${dollars(cheapest.medianCents)} ${dollars(priciest.medianCents)}`,
        seen.cards.map((c) => c.value).join(' '));
      check('each card names its states and store counts from the file',
        [cheapest, priciest].every((rank, i) => rank.states.every((s) => seen.cards[i]?.card.includes(count(s.stores)))));
    } else {
      check('no state figures, and the slot says why', seen.cards.length === 0 && seen.blanks.states.includes(story.missing.find((m) => m.field === 'states').reason));
    }

    if (story.movers) {
      const m = story.movers;
      check('the change counts are the file\'s',
        [m.compared, m.up + m.down, m.up, m.down].every((n) => seen.movers.includes(count(n))), seen.movers);
      check('each named store shows its two prices and links to its page',
        seen.rows.length === m.top.length && m.top.every((mover, i) =>
          seen.rows[i].text.includes(mover.label) && seen.rows[i].text.includes(dollars(mover.fromCents)) &&
          seen.rows[i].text.includes(dollars(mover.toCents)) && seen.rows[i].href === `/store/${mover.storeId}`),
        seen.rows.map((r) => r.text).join(' | '));
    } else {
      check('no store changes, and the slot says why', seen.rows.length === 0 && seen.blanks.movers.includes(story.missing.find((x) => x.field === 'movers').reason));
    }

    const live = await emulatorConfirmed(month);
    if (live !== null) {
      const figure = /([\d,]+)\s*reports? from visitors accepted/.exec(seen.confirmed)?.[1];
      check('the confirmed count is read live and equals the database\'s', seen.counted !== null && figure === count(live),
        `page ${figure ?? 'none'}, emulator ${live}`);
    } else if (story.confirmed) {
      check('the confirmed count is the file\'s', seen.confirmed.includes(count(story.confirmed.count)));
    } else {
      const reason = story.missing.find((x) => x.field === 'confirmed').reason;
      check('the confirmed count is blank, with no number in its place, and says why',
        seen.blanks.confirmed.includes(reason) && !/\d/.test(seen.confirmed.replace(reason, '')), seen.confirmed);
    }

    const blanks = story.missing.filter((m) => m.field !== 'feed' && !(m.field === 'confirmed' && seen.counted !== null));
    check('the introduction names every blank', blanks.length === 0 || /left blank/.test(seen.intro), seen.intro);

    check('the medians roll as the page opens', seen.rolling > 0, `${seen.rolling} wheels`);
    await page.waitForTimeout(1800);
    // Time-based animations only: the headings' word rise runs on a view
    // timeline, so it is "running" for as long as it is on screen and moves
    // only when the reader scrolls.
    check('and settle once, then stop', await page.evaluate(() =>
      document.getAnimations().filter((a) =>
        a.timeline instanceof DocumentTimeline && a.effect?.target?.closest?.('main') && a.playState === 'running').length === 0));
    await context.close();

    const calm = await browser.newContext({ viewport: { width: 375, height: 812 }, reducedMotion: 'reduce' });
    const still = await calm.newPage();
    await still.goto(`${TARGET_URL}/story/${month}`, { waitUntil: 'load' });
    check('under reduced motion nothing rolls', await still.evaluate(() =>
      document.getAnimations().filter((a) => a.effect?.pseudoElement === '::before' && a.effect.target?.classList?.contains('odo-col')).length === 0));
    check('and nothing is wider than a phone', await still.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await calm.close();
  } catch (error) {
    check('suite ran to completion', false, error.message);
    console.error(error);
  } finally {
    await browser?.close();
    const passed = results.filter((r) => r.passed).length;
    console.log(`\n${'='.repeat(64)}`);
    console.log(`Monthly story: ${passed}/${results.length} passed`);
    for (const r of results.filter((x) => !x.passed)) console.log(`  - ${r.name}${r.detail ? `  [${r.detail}]` : ''}`);
    console.log('='.repeat(64));
    process.exit(passed === results.length ? 0 : 1);
  }
})();
