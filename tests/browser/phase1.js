/**
 * Sandwich Index — Phase 1 smoke test
 *
 * Gate: root route loads, correct title, no console errors.
 * Plus a few Definition of Done items that are free to check this early.
 *
 * Run against the PRODUCTION build (next start), not the dev server — dev
 * emits its own console noise and does not exercise the real bundle.
 */

const { chromium } = require('playwright');

const TARGET_URL = process.env.TARGET_URL || 'http://localhost:3000';

const results = [];
function check(name, passed, detail = '') {
  results.push({ name, passed, detail });
  console.log(`${passed ? '  PASS' : '  FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
}

/**
 * Playwright's bundled Chromium will not start on this machine — it needs the
 * Microsoft Visual C++ Redistributable, which is not installed, and Windows
 * reports it as a side-by-side configuration error. Edge is Chromium under the
 * hood and has an intact runtime, so we prefer an installed browser channel and
 * fall back to the bundled build for machines where it does work.
 */
async function launchBrowser() {
  const attempts = [
    { channel: 'msedge', label: 'Edge (system channel)' },
    { channel: 'chrome', label: 'Chrome (system channel)' },
    { channel: undefined, label: 'bundled Chromium' },
  ];

  const failures = [];
  for (const attempt of attempts) {
    try {
      const options = { headless: false, slowMo: 60 };
      if (attempt.channel !== undefined) options.channel = attempt.channel;
      const browser = await chromium.launch(options);
      console.log(`Browser: ${attempt.label}`);
      return browser;
    } catch (error) {
      failures.push(`${attempt.label}: ${error.message.split('\n')[0]}`);
    }
  }

  throw new Error(`No usable browser.\n  ${failures.join('\n  ')}`);
}

(async () => {
  const browser = await launchBrowser();
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  const consoleErrors = [];
  const pageErrors = [];
  const failedRequests = [];

  page.on('console', (msg) => {
    if (msg.type() === 'error') consoleErrors.push(msg.text());
  });
  page.on('pageerror', (err) => pageErrors.push(err.message));
  page.on('requestfailed', (req) => {
    failedRequests.push(`${req.url()} — ${req.failure()?.errorText ?? 'unknown'}`);
  });

  try {
    console.log(`\nTarget: ${TARGET_URL}\n`);
    console.log('Root route');

    const response = await page.goto(TARGET_URL, { waitUntil: 'networkidle', timeout: 20000 });
    check('root route returns 200', response !== null && response.status() === 200,
      response ? `status ${response.status()}` : 'no response');

    const title = await page.title();
    // The title grew a descriptive tail in a later phase — an SEO improvement,
    // not a regression. The brand must still lead.
    check('page title leads with "Sandwich Index"', title.startsWith('Sandwich Index'), `got "${title}"`);

    const h1 = await page.locator('h1').first().textContent();
    check('h1 renders', (h1 ?? '').trim().length > 0, `"${(h1 ?? '').trim()}"`);

    // --- Definition of Done items that are cheap to verify now ---
    console.log('\nFooter obligations');

    const bodyText = await page.locator('body').innerText();
    check('OpenStreetMap attribution present',
      /OpenStreetMap/i.test(bodyText) && /Open Database Licence/i.test(bodyText));
    check('McDonald\'s non-affiliation disclaimer present',
      /not affiliated with, endorsed by, or sponsored by/i.test(bodyText));

    console.log('\nTypography');

    const bodyFont = await page.evaluate(() => getComputedStyle(document.body).fontFamily);
    const forbidden = ['Inter', 'Roboto', 'Arial', 'system-ui', '-apple-system', 'Segoe UI'];
    const offender = forbidden.find((f) => bodyFont.toLowerCase().includes(f.toLowerCase()));
    check('body font is not a forbidden/system face', offender === undefined,
      offender ? `found "${offender}" in ${bodyFont}` : bodyFont);

    const bodySize = await page.evaluate(() => getComputedStyle(document.body).fontSize);
    const lineHeight = await page.evaluate(() => {
      const cs = getComputedStyle(document.body);
      return parseFloat(cs.lineHeight) / parseFloat(cs.fontSize);
    });
    check('base font size is 16px', bodySize === '16px', bodySize);
    check('body line-height is at least 1.5', lineHeight >= 1.499, lineHeight.toFixed(3));

    console.log('\nKeyboard access');

    await page.keyboard.press('Tab');
    const firstFocus = await page.evaluate(() => {
      const el = document.activeElement;
      if (el === null) return null;
      const cs = getComputedStyle(el);
      return {
        text: (el.textContent ?? '').trim(),
        outlineWidth: cs.outlineWidth,
        outlineStyle: cs.outlineStyle,
      };
    });
    check('first Tab reaches the skip link',
      firstFocus !== null && /skip to main content/i.test(firstFocus.text),
      firstFocus ? `"${firstFocus.text}"` : 'nothing focused');
    check('focused element has a visible ring of 2px or more',
      firstFocus !== null &&
        firstFocus.outlineStyle !== 'none' &&
        parseFloat(firstFocus.outlineWidth) >= 2,
      firstFocus ? `${firstFocus.outlineStyle} ${firstFocus.outlineWidth}` : '');

    console.log('\nMobile layout');

    await page.setViewportSize({ width: 375, height: 667 });
    await page.waitForTimeout(300);
    const overflow = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    check('no horizontal scroll at 375px',
      overflow.scrollWidth <= overflow.clientWidth + 1,
      `scrollWidth ${overflow.scrollWidth} vs clientWidth ${overflow.clientWidth}`);

    const zoomBlocked = await page.evaluate(() => {
      const meta = document.querySelector('meta[name="viewport"]');
      const content = meta ? meta.getAttribute('content') ?? '' : '';
      return /user-scalable\s*=\s*no|maximum-scale\s*=\s*1(\.0)?\b/.test(content);
    });
    check('zoom is not disabled', zoomBlocked === false);

    console.log('\nOther routes');

    await page.setViewportSize({ width: 1280, height: 900 });
    const aboutResponse = await page.goto(`${TARGET_URL}/about`, { waitUntil: 'networkidle' });
    check('/about returns 200',
      aboutResponse !== null && aboutResponse.status() === 200,
      aboutResponse ? `status ${aboutResponse.status()}` : 'no response');

    await page.screenshot({ path: require('path').join(__dirname,'screenshots','phase1-home.png'), fullPage: true });

    console.log('\nConsole cleanliness');
    check('no console errors', consoleErrors.length === 0,
      consoleErrors.length > 0 ? consoleErrors.join(' | ') : 'clean');
    check('no uncaught page errors', pageErrors.length === 0,
      pageErrors.length > 0 ? pageErrors.join(' | ') : 'clean');
    check('no failed network requests', failedRequests.length === 0,
      failedRequests.length > 0 ? failedRequests.join(' | ') : 'clean');
  } catch (error) {
    check('test run completed without throwing', false, error.message);
  } finally {
    await browser.close();
  }

  const passed = results.filter((r) => r.passed).length;
  const failed = results.length - passed;
  console.log(`\n${'='.repeat(60)}`);
  console.log(`PHASE 1 RESULT: ${passed} passed, ${failed} failed, ${results.length} total`);
  console.log(`Screenshot: tests/browser/screenshots/phase1-home.png`);
  console.log('='.repeat(60));

  process.exit(failed > 0 ? 1 : 0);
})();
