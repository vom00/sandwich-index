/**
 * Keyboard-only navigation across the app.
 *
 * Nothing in the existing suites walks the app with Tab alone, so focus order,
 * focus visibility and keyboard traps are all unmeasured. Somebody who cannot
 * use a mouse has to be able to reach every control, see where they are, and
 * get back out of anything they enter.
 */
const { chromium } = require('playwright');

const TARGET_URL = 'http://localhost:3000';
const COPPELL = { latitude: 32.9546, longitude: -96.99 };

let passed = 0;
let failed = 0;
const failures = [];

function check(name, ok, detail = '') {
  if (ok) {
    passed += 1;
    console.log(`  PASS  ${name}${detail ? `  — ${detail}` : ''}`);
  } else {
    failed += 1;
    failures.push(`${name}${detail ? `  [${detail}]` : ''}`);
    console.log(`  FAIL  ${name}${detail ? `  — ${detail}` : ''}`);
  }
}

/** Describe whatever currently has focus. */
const FOCUSED = () => {
  const el = document.activeElement;
  if (!el || el === document.body) return null;
  const r = el.getBoundingClientRect();
  const s = getComputedStyle(el);
  return {
    tag: el.tagName,
    text: (el.innerText || el.getAttribute('aria-label') || el.placeholder || '').trim().slice(0, 40),
    // Document coordinates, not viewport ones. The page scrolls as focus
    // advances, so a viewport-relative y shrinks for elements further down and
    // every stop after the first scroll looks like a backwards jump.
    x: Math.round(r.x + window.scrollX),
    y: Math.round(r.y + window.scrollY),
    // A visible ring is either an outline or a box-shadow; both are used.
    hasRing: (s.outlineStyle !== 'none' && parseFloat(s.outlineWidth) > 0) || s.boxShadow !== 'none',
    inViewport: r.top >= -1 && r.bottom <= window.innerHeight + 1,
  };
};

async function tabThrough(page, steps) {
  const seen = [];
  for (let i = 0; i < steps; i += 1) {
    await page.keyboard.press('Tab');
    const f = await page.evaluate(FOCUSED);
    if (f === null) break;
    seen.push(f);
  }
  return seen;
}

(async () => {
  let browser;
  try {
    browser = await chromium.launch({ channel: 'msedge', headless: false });
    const context = await browser.newContext({
      viewport: { width: 1280, height: 900 },
      permissions: ['geolocation'],
      geolocation: COPPELL,
    });
    const page = await context.newPage();

    // ---------------------------------------------------------------
    console.log('\n1. The skip link — the first thing a keyboard user meets');
    // ---------------------------------------------------------------
    await page.goto(TARGET_URL, { waitUntil: 'networkidle' });
    await page.keyboard.press('Tab');
    const first = await page.evaluate(FOCUSED);
    check('first Tab lands on the skip link', /skip/i.test(first?.text ?? ''), first?.text ?? 'nothing focused');
    check('the skip link is visible once focused', (first?.inViewport ?? false) && (first?.hasRing ?? false),
      `inViewport=${first?.inViewport} ring=${first?.hasRing}`);

    await page.keyboard.press('Enter');
    await page.waitForTimeout(300);
    const afterSkip = await page.evaluate(() => {
      const el = document.activeElement;
      const main = document.querySelector('main');
      return {
        hash: location.hash,
        insideMain: el !== null && main !== null && (main === el || main.contains(el)),
      };
    });
    check('activating it moves past the header', afterSkip.hash === '#main' || afterSkip.insideMain,
      `hash=${afterSkip.hash} insideMain=${afterSkip.insideMain}`);

    // ---------------------------------------------------------------
    console.log('\n2. Focus order follows reading order on the landing page');
    // ---------------------------------------------------------------
    await page.goto(TARGET_URL, { waitUntil: 'networkidle' });
    const landing = await tabThrough(page, 14);
    check('every stop is reachable and identifiable', landing.every((f) => f.text.length > 0),
      `${landing.filter((f) => f.text.length === 0).length} unlabelled of ${landing.length}`);
    check('every stop shows a focus ring', landing.every((f) => f.hasRing),
      `${landing.filter((f) => !f.hasRing).length} without a ring`);

    // Reading order is top-to-bottom; a stop that jumps upward by more than a
    // row is the classic symptom of a DOM order that fights the layout — but
    // only within a column. Moving to the top of a column further right is
    // correct reading order, so a rightward move excuses the rise.
    const backJumps = landing.filter(
      (f, i) => i > 0 && f.y < landing[i - 1].y - 80 && f.x <= landing[i - 1].x,
    );
    check('focus does not jump back up the page', backJumps.length === 0,
      backJumps.map((f) => `"${f.text}" at y=${f.y}`).join(', ') || 'monotonic');

    // ---------------------------------------------------------------
    console.log('\n3. The map is operable without a mouse');
    // ---------------------------------------------------------------
    await page.goto(`${TARGET_URL}/map`, { waitUntil: 'networkidle' });
    const zip = page.locator('main input[type="text"]').first();
    if (await zip.count()) {
      await zip.fill('75019');
      await page.getByRole('button', { name: /Show stores/i }).click();
      await page.waitForTimeout(4000);
    }

    const mapStops = await tabThrough(page, 12);
    check('the map page is tabbable', mapStops.length > 0, `${mapStops.length} stops`);
    check('every map stop has a focus ring', mapStops.every((f) => f.hasRing),
      `${mapStops.filter((f) => !f.hasRing).length} without`);
    check('no stop is focused while scrolled out of view',
      mapStops.every((f) => f.inViewport),
      mapStops.filter((f) => !f.inViewport).map((f) => `"${f.text}"`).join(', ') || 'all visible');

    // ---------------------------------------------------------------
    console.log('\n4. The submit dialog traps focus, and gives it back');
    // ---------------------------------------------------------------
    const storeHref = await page.evaluate(() => {
      const a = document.querySelector('a[href^="/store/"]');
      return a ? a.getAttribute('href') : null;
    });

    if (storeHref === null) {
      check('a store page was reachable', false, 'no store link on the map');
    } else {
      await page.goto(`${TARGET_URL}${storeHref}`, { waitUntil: 'networkidle' });

      const opener = page.getByRole('button', { name: /Log a price|Log the first price/ });
      await opener.focus();
      await page.keyboard.press('Enter');
      await page.waitForSelector('dialog[open]', { timeout: 8000 });

      const inDialogStart = await page.evaluate(() => {
        const d = document.querySelector('dialog[open]');
        return d !== null && d.contains(document.activeElement);
      });
      check('opening by keyboard moves focus into the dialog', inDialogStart);

      // Twelve tabs is more than the dialog holds, so this wraps repeatedly.
      //
      // What must never happen is focus landing on a *control behind the
      // dialog*. Passing through `document.body` for a single tab as the cycle
      // wraps is normal browser behaviour for `showModal()` — the background
      // is inert, nothing there is reachable, and the very next tab is back
      // inside. Asserting "always inside" instead of "never on background
      // content" fails a dialog that is behaving correctly.
      const escapes = [];
      for (let i = 0; i < 12; i += 1) {
        await page.keyboard.press('Tab');
        const state = await page.evaluate(() => {
          const d = document.querySelector('dialog[open]');
          if (d === null) return { verdict: 'closed' };
          const a = document.activeElement;
          if (d.contains(a)) return { verdict: 'inside' };
          if (a === document.body || a === document.documentElement) {
            return { verdict: 'wrapping', modal: d.matches(':modal') };
          }
          return { verdict: 'escaped', to: `${a.tagName}:${(a.innerText || '').trim().slice(0, 20)}` };
        });
        if (state.verdict === 'escaped' || state.verdict === 'closed') {
          escapes.push(`${state.verdict}${state.to ? ` to ${state.to}` : ''} after ${i + 1} tabs`);
          break;
        }
      }
      check('focus never reaches a control behind the dialog', escapes.length === 0,
        escapes[0] ?? 'background unreachable across 12 tabs');

      await page.keyboard.press('Escape');
      await page.waitForTimeout(500);
      const returned = await page.evaluate(() => {
        const el = document.activeElement;
        return {
          closed: document.querySelector('dialog[open]') === null,
          text: (el?.innerText || '').trim().slice(0, 30),
        };
      });
      check('Escape closes the dialog', returned.closed);
      check('focus returns to the control that opened it', /log a price|log the first price/i.test(returned.text),
        returned.text || 'focus lost to the body');
    }

    console.log('\n================================================================');
    console.log(`Keyboard: ${passed}/${passed + failed} passed`);
    for (const f of failures) console.log(`  - ${f}`);
    console.log('================================================================');
    process.exit(failed === 0 ? 0 : 1);
  } catch (error) {
    console.error(error);
    process.exit(1);
  } finally {
    if (browser) await browser.close();
  }
})();
