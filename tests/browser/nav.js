/**
 * Site navigation: every page has a way home.
 *
 * Until 2026-10-12 the map and store pages had no link back to the landing
 * page; the only way out was the browser's back button. The site header fixed
 * that, and this suite keeps it fixed: on every route the wordmark links home,
 * the main nav is present, the current section is marked with aria-current,
 * and the header never forces a phone to scroll sideways.
 */

const { chromium } = require('playwright');

const TARGET_URL = process.env.TARGET_URL || 'http://localhost:3000';

const results = [];
function check(name, passed, detail = '') {
  results.push({ name, passed, detail });
  console.log(`${passed ? '  PASS' : '  FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
}

async function anyStoreId(page) {
  const response = await page.request.get(`${TARGET_URL}/api/stores?lat=32.9546&lng=-97.015&radiusMiles=15`);
  if (!response.ok()) return null;
  const body = await response.json();
  const stores = Array.isArray(body) ? body : body.stores ?? [];
  return stores[0]?.id ?? null;
}

(async () => {
  let browser;
  try {
    browser = await chromium.launch({ channel: 'msedge' });

    for (const viewport of [{ width: 1280, height: 900 }, { width: 375, height: 812 }]) {
      const context = await browser.newContext({ viewport, isMobile: viewport.width < 768 });
      const page = await context.newPage();
      const storeId = await anyStoreId(page);
      const routes = [
        { path: '/', current: 'Sandwich Index' },
        { path: '/map', current: 'Map' },
        { path: '/log', current: 'Log prices' },
        { path: '/about', current: 'About the data' },
        ...(storeId === null ? [] : [{ path: `/store/${storeId}`, current: 'Map' }]),
      ];
      const tag = `${viewport.width}px`;
      if (storeId === null) check(`[${tag}] a store exists to test its page`, false, 'no stores near Coppell');

      for (const route of routes) {
        await page.goto(TARGET_URL + route.path, { waitUntil: 'domcontentloaded' });
        const header = await page.evaluate(() => {
          const banner = document.querySelector('body > header');
          const home = banner?.querySelector('a[href="/"]');
          const nav = banner?.querySelector('nav[aria-label="Main"]');
          const current = banner?.querySelector('a[aria-current="page"]');
          return {
            home: home !== null && home !== undefined,
            navLinks: nav ? nav.querySelectorAll('a').length : 0,
            current: current ? (current.getAttribute('aria-label') ?? current.textContent.trim()) : null,
            sideways: document.documentElement.scrollWidth > window.innerWidth,
          };
        });
        check(`[${tag}] ${route.path} has a link home and the main nav`,
          header.home && header.navLinks === 3, JSON.stringify(header));
        check(`[${tag}] ${route.path} marks "${route.current}" as the current page`,
          header.current === route.current, String(header.current));
        check(`[${tag}] ${route.path} does not scroll sideways`, !header.sideways);
      }

      // The case that was broken: from the map, back to the landing page.
      await page.goto(`${TARGET_URL}/map`, { waitUntil: 'domcontentloaded' });
      await page.locator('body > header a[href="/"]').click();
      await page.waitForURL(`${TARGET_URL}/`, { timeout: 15000 });
      check(`[${tag}] the wordmark on the map leads back to the landing page`,
        new URL(page.url()).pathname === '/', page.url());

      await context.close();
    }
  } catch (error) {
    check('suite ran to completion', false, error.message);
    console.error(error);
  } finally {
    if (browser) await browser.close();

    const passed = results.filter((r) => r.passed).length;
    console.log(`\n${'='.repeat(64)}`);
    console.log(`Navigation: ${passed}/${results.length} passed`);
    for (const r of results.filter((x) => !x.passed)) {
      console.log(`  - ${r.name}${r.detail ? `  [${r.detail}]` : ''}`);
    }
    console.log('='.repeat(64));
    process.exit(passed === results.length ? 0 : 1);
  }
})();
