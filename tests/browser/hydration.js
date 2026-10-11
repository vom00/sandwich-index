/**
 * Verifies the `suppressHydrationWarning` added to <body> in layout.tsx.
 *
 * Two halves, and the second matters as much as the first:
 *   A. Grammarly-style attributes on <body> before hydration → no warning.
 *   B. A tampered attribute on a CHILD of <body> → still warns.
 *
 * B is the safety argument for the change. Without it, "the suppression only
 * covers this one element" is a claim from the React docs rather than something
 * observed in this app.
 */

const { chromium } = require('playwright');

const TARGET_URL = process.env.TARGET_URL || 'http://localhost:3000';

const results = [];
function check(name, passed, detail = '') {
  results.push({ name, passed, detail });
  console.log(`${passed ? '  PASS' : '  FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
}

/**
 * Run `stamp` against the live DOM as early as an extension would: as soon as
 * the target element is parsed, well before the Next bundle hydrates.
 *
 * `addInitScript` executes at document-start, when `document.documentElement`
 * is still null — so a MutationObserver cannot be attached to anything yet.
 * Polling on a zero timeout runs during parsing and catches the element the
 * moment it appears, which is the window an extension writes in.
 *
 * `stamp` must return true once it has done its work.
 */
function earlyDomScript(stampSource) {
  return `
    (() => {
      const stamp = ${String(stampSource)};
      let attempts = 0;
      const poll = () => {
        try { if (stamp()) { window.__stamped = true; return; } } catch { /* not yet */ }
        if (attempts++ < 2000) setTimeout(poll, 0);
      };
      poll();
    })();
  `;
}

async function collectHydrationErrors(browser, mutate, label) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const page = await context.newPage();

  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));

  await page.addInitScript(earlyDomScript(mutate));
  await page.goto(TARGET_URL, { waitUntil: 'load' });
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(900);

  const hydration = errors.filter((e) => /hydrat/i.test(e));
  const stamped = await page.evaluate(() => window.__stamped === true);
  console.log(`    (${label}: injected=${stamped}, ${errors.length} console errors, ${hydration.length} hydration)`);
  await context.close();
  return { errors, hydration, stamped };
}

(async () => {
  let browser;
  try {
    browser = await chromium.launch({ headless: false, channel: 'msedge' });

    // ---------------------------------------------------------------
    console.log('A. Extension attributes on <body>');
    // ---------------------------------------------------------------
    const grammarly = () => {
      if (!document.body) return false;
      document.body.setAttribute('data-new-gr-c-s-check-loaded', '14.1318.0');
      document.body.setAttribute('data-gr-ext-installed', '');
      return true;
    };

    const withExtension = await collectHydrationErrors(browser, grammarly, 'grammarly');
    check('the injection actually ran before hydration',
      withExtension.stamped === true, `window.__stamped = ${withExtension.stamped}`);
    check('no hydration warning with extension attributes on <body>',
      withExtension.hydration.length === 0,
      withExtension.hydration.slice(0, 1).join(' ').slice(0, 120));
    check('no other console errors either',
      withExtension.errors.length === 0,
      withExtension.errors.slice(0, 2).join(' | ').slice(0, 140));

    // ---------------------------------------------------------------
    console.log('\nB. A real mismatch on a child of <body> is still caught');
    // ---------------------------------------------------------------
    const tamperChild = () => {
      // The skip link is the first child of <body>, so this is the closest a
      // mismatch can get to the suppressed element without being on it.
      const link = document.querySelector('a.skip-link');
      if (link === null) return false;
      // The server rendered class="skip-link". Change it before React looks,
      // exactly as a genuine mismatch would appear.
      link.setAttribute('class', 'skip-link tampered-by-test');
      return true;
    };

    const withTamper = await collectHydrationErrors(browser, tamperChild, 'tampered child');
    check('the tamper actually ran before hydration',
      withTamper.stamped === true, `window.__stamped = ${withTamper.stamped}`);
    check('a mismatch one level inside <body> still raises a hydration warning',
      withTamper.hydration.length > 0,
      withTamper.hydration.length === 0
        ? 'suppression may be leaking into children'
        : withTamper.hydration[0].slice(0, 100));

    // ---------------------------------------------------------------
    console.log('\nC. Clean browser, no extension');
    // ---------------------------------------------------------------
    const clean = await collectHydrationErrors(browser, () => true, 'clean');
    check('no console errors at all in a clean browser',
      clean.errors.length === 0, clean.errors.slice(0, 2).join(' | ').slice(0, 140));

    // The page still has to work, not merely be quiet.
    const workingContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
    const workingPage = await workingContext.newPage();
    await workingPage.addInitScript(earlyDomScript(grammarly));
    await workingPage.goto(TARGET_URL, { waitUntil: 'load' });
    await workingPage.waitForLoadState('networkidle');
    await workingPage.waitForTimeout(1200);

    const heroSettled = await workingPage.locator('.hero-figure').textContent();
    check('hero still hydrates and counts up with the extension present',
      /^\$\d+\.\d{2}$/.test((heroSettled ?? '').trim()), (heroSettled ?? '').trim());

    const bodyAttrs = await workingPage.evaluate(() => ({
      grammarly: document.body.hasAttribute('data-gr-ext-installed'),
      className: document.body.className,
    }));
    check('React left the extension attributes alone rather than stripping them',
      bodyAttrs.grammarly, JSON.stringify(bodyAttrs));
    check('our own body className survived hydration intact',
      bodyAttrs.className === 'flex min-h-full flex-col', bodyAttrs.className);

    await workingContext.close();
  } catch (error) {
    check('suite ran to completion', false, error.message);
    console.error(error);
  } finally {
    if (browser) await browser.close();

    const passed = results.filter((r) => r.passed).length;
    console.log(`\n${'='.repeat(64)}`);
    console.log(`Hydration: ${passed}/${results.length} passed`);
    for (const r of results.filter((x) => !x.passed)) {
      console.log(`  - ${r.name}${r.detail ? `  [${r.detail}]` : ''}`);
    }
    console.log('='.repeat(64));
    process.exit(passed === results.length ? 0 : 1);
  }
})();
