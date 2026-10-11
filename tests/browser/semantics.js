/**
 * Screen-reader semantics: landmarks, heading hierarchy, live regions.
 *
 * The existing suites run axe with the `wcag2a`/`wcag2aa` tags, which do *not*
 * include axe's best-practice rules — `heading-order`, `landmark-one-main`,
 * `region`, `landmark-unique` and friends all sit outside those tags. So a
 * skipped heading level or a second <main> passes every check the app
 * currently has. This runs that missing tier, plus a few structural checks
 * axe cannot make on its own.
 */
const { chromium } = require('playwright');

// Resolved from this file rather than an absolute path, so the suite travels
// with the repo instead of being pinned to one machine's home directory.
const AXE = require.resolve('axe-core/axe.min.js');
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

/** Structure axe does not judge: landmark counts and heading levels. */
const STRUCTURE = () => {
  const headings = [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')]
    .filter((h) => h.offsetParent !== null || h.getClientRects().length > 0)
    .map((h) => ({ level: Number(h.tagName[1]), text: h.innerText.trim().slice(0, 40) }));

  const skips = [];
  for (let i = 1; i < headings.length; i += 1) {
    const jump = headings[i].level - headings[i - 1].level;
    if (jump > 1) skips.push(`h${headings[i - 1].level} → h${headings[i].level} at "${headings[i].text}"`);
  }

  return {
    mains: document.querySelectorAll('main, [role="main"]').length,
    banners: document.querySelectorAll('body > header, [role="banner"]').length,
    contentinfos: document.querySelectorAll('footer, [role="contentinfo"]').length,
    h1s: headings.filter((h) => h.level === 1).length,
    firstHeadingLevel: headings[0]?.level ?? null,
    headingCount: headings.length,
    skips,
    // A live region has to exist before the message does, or the change is
    // never announced — screen readers watch mounted nodes.
    liveRegions: [...document.querySelectorAll('[aria-live], [role="status"], [role="alert"]')].map(
      (n) => ({
        role: n.getAttribute('role') ?? '',
        live: n.getAttribute('aria-live') ?? '',
        atomic: n.getAttribute('aria-atomic') ?? '',
      }),
    ),
    // Every list must be a real list, and every table cell must have a header.
    listsWithBadChildren: [...document.querySelectorAll('ul, ol')].filter((l) =>
      [...l.children].some((c) => c.tagName !== 'LI' && c.tagName !== 'TEMPLATE'),
    ).length,
    tablesWithoutHeaders: [...document.querySelectorAll('table')].filter(
      (t) => t.querySelectorAll('th').length === 0,
    ).length,
  };
};

async function auditPage(page, label, url, { expectLive = false } = {}) {
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);

  const s = await page.evaluate(STRUCTURE);

  check(`${label}: exactly one main landmark`, s.mains === 1, `${s.mains} found`);
  check(`${label}: exactly one h1`, s.h1s === 1, `${s.h1s} found`);
  check(`${label}: the document starts at h1`, s.firstHeadingLevel === 1,
    `starts at h${s.firstHeadingLevel}`);
  check(`${label}: heading levels are not skipped`, s.skips.length === 0,
    s.skips.join('; ') || `${s.headingCount} headings, contiguous`);
  check(`${label}: one contentinfo landmark`, s.contentinfos === 1, `${s.contentinfos} found`);
  check(`${label}: lists contain only list items`, s.listsWithBadChildren === 0,
    `${s.listsWithBadChildren} malformed`);
  check(`${label}: tables have header cells`, s.tablesWithoutHeaders === 0,
    `${s.tablesWithoutHeaders} without`);

  if (expectLive) {
    check(`${label}: a live region is mounted before it has anything to say`,
      s.liveRegions.length > 0,
      JSON.stringify(s.liveRegions.slice(0, 3)));
    check(`${label}: live regions are polite, never assertive`,
      s.liveRegions.every((r) => r.live !== 'assertive' && r.role !== 'alert'),
      s.liveRegions.filter((r) => r.live === 'assertive' || r.role === 'alert').length + ' assertive');
  }

  // axe's best-practice tier, which the WCAG-tagged runs skip.
  await page.addScriptTag({ path: AXE });
  const results = await page.evaluate(async () =>
    // `axe` is injected into the page by the script tag above, so it exists
    // at run time even though nothing in this file declares it.
    await window.axe.run(document, { runOnly: { type: 'tag', values: ['best-practice'] } }),
  );
  const violations = results.violations.filter((v) => v.impact !== 'minor');
  check(`${label}: axe best-practice rules`, violations.length === 0,
    violations.map((v) => `${v.id} (${v.nodes.length})`).join(', ') || 'clean');
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

    console.log('\nLanding');
    await auditPage(page, '/', TARGET_URL);

    console.log('\nAbout');
    await auditPage(page, '/about', `${TARGET_URL}/about`);

    console.log('\nMap (location gate)');
    await auditPage(page, '/map gate', `${TARGET_URL}/map`);

    console.log('\nMap (stores loaded)');
    const zip = page.locator('main input[type="text"]').first();
    if (await zip.count()) {
      await zip.fill('75019');
      await page.getByRole('button', { name: /Show stores/i }).click();
      await page.waitForTimeout(4000);
    }
    const mapLoaded = await page.evaluate(STRUCTURE);
    check('/map loaded: exactly one main landmark', mapLoaded.mains === 1, `${mapLoaded.mains} found`);
    check('/map loaded: heading levels are not skipped', mapLoaded.skips.length === 0,
      mapLoaded.skips.join('; ') || `${mapLoaded.headingCount} headings`);
    check('/map loaded: lists contain only list items', mapLoaded.listsWithBadChildren === 0,
      `${mapLoaded.listsWithBadChildren} malformed`);

    const storeHref = await page.evaluate(() => {
      const a = document.querySelector('a[href^="/store/"]');
      return a ? a.getAttribute('href') : null;
    });

    console.log('\nLog');
    await auditPage(page, '/log', `${TARGET_URL}/log`, { expectLive: true });

    if (storeHref !== null) {
      console.log('\nStore');
      await auditPage(page, '/store', `${TARGET_URL}${storeHref}`);
    }

    console.log('\n================================================================');
    console.log(`Semantics: ${passed}/${passed + failed} passed`);
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
