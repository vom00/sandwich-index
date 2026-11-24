/**
 * The site header as a small price board (components/ui/SiteHeader.tsx).
 *
 *   TARGET_URL=http://localhost:3100 node tests/browser/header.js
 *
 * 1. On the landing, map, store and about pages, at 375 and 1440px, with
 *    motion on and with reduced motion: one main nav landmark, the current
 *    page marked with aria-current, the masthead showing the national median
 *    and its date from price-map.json, nothing scrolling sideways. Screenshots
 *    of each page at the top and after scrolling go to
 *    tests/browser/screenshots/check/header/.
 * 2. Once-only moments, in one tab at 1440px: the logo builds on a session's
 *    first page and is built on the next; the figure rolls the first time and
 *    again only when the stored figure differs; the bar slims past 24px and
 *    prints the receipt rule once; the ink stroke glides between tabs; the
 *    stamp presses (scale 0.97, offset collapses) and shows a focus ring.
 * 3. Reduced motion: every piece is in its final state from the first frame.
 * 4. Nothing in the header loops, and its timings stay inside the tokens.
 * 5. At 360px the masthead steps aside and the wordmark stays on one line.
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const TARGET_URL = process.env.TARGET_URL || 'http://localhost:3000';
const OUT = path.join(__dirname, 'screenshots', 'check', 'header');
const COPPELL = { latitude: 32.9546, longitude: -96.99 };
const MAP = JSON.parse(fs.readFileSync(path.join(__dirname, '../../src/data/landing/price-map.json'), 'utf8'));
const FIGURE = `$${(MAP.priceCents.median / 100).toFixed(2)}`;
const CHECKED = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' }).format(
  new Date(MAP.generatedFrom.newestObservedAt),
);

const results = [];
function check(name, passed, detail = '') {
  results.push({ name, passed, detail });
  console.log(`${passed ? '  PASS' : '  FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
}

/**
 * Watches the header from before the page's own scripts run: whether the
 * pre-paint styles were added (the logo's hold, the figure's roll), and per
 * frame for 2s, the top bun's opacity, the wordmark's clip, and whether the
 * masthead's wheels were rolling. `rollingAtFirst` is that on the first frame
 * the masthead existed, so a figure that rolls is never held still at zero.
 */
function watchHeader() {
  window.__header = { gate: false, roll: false, bun: [], word: [], rolling: false, rollingAtFirst: null };
  new MutationObserver((records) => {
    for (const record of records) {
      for (const node of record.addedNodes) {
        if (node.id === 'header-boot') window.__header.gate = true;
        if (node.id === 'header-boot-figure') window.__header.roll = true;
      }
    }
  }).observe(document, { childList: true, subtree: true });
  const start = performance.now();
  const tick = () => {
    const bun = document.querySelector('.logo-layer[data-layer="bun"]');
    const word = document.querySelector('.logo-word');
    if (bun) window.__header.bun.push(Number(getComputedStyle(bun).opacity));
    if (word) window.__header.word.push(getComputedStyle(word).clipPath);
    if (document.querySelector('.masthead')) {
      const rolling = document.getAnimations().some((a) => a.animationName === 'odo-roll' && a.effect?.target?.closest?.('.masthead'));
      if (window.__header.rollingAtFirst === null) window.__header.rollingAtFirst = rolling;
      if (rolling) window.__header.rolling = true;
    }
    if (performance.now() - start < 2000) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

async function pricedStoreId() {
  const response = await fetch(`${TARGET_URL}/api/stores?lat=${COPPELL.latitude}&lng=${COPPELL.longitude}&radiusMiles=15`);
  if (!response.ok) return null;
  const body = await response.json();
  return body.stores.find((store) => store.priceCents !== null)?.id ?? null;
}

async function headerState(page) {
  return page.evaluate(() => {
    const header = document.querySelector('body > header.site-header');
    const current = header?.querySelector('[aria-current="page"]');
    const masthead = header?.querySelector('.masthead');
    return {
      banner: header !== null,
      navs: document.querySelectorAll('nav').length,
      mainNavs: header ? header.querySelectorAll('nav[aria-label="Main"]').length : 0,
      current: current ? (current.getAttribute('aria-label') ?? current.textContent.trim()) : null,
      masthead: masthead ? masthead.textContent : null,
      mastheadShown: masthead ? getComputedStyle(masthead).display !== 'none' : false,
      checked: masthead?.querySelector('time')?.getAttribute('datetime') ?? null,
      sideways: document.documentElement.scrollWidth > window.innerWidth,
    };
  });
}

async function scrollState(page) {
  return page.evaluate(() => {
    const header = document.querySelector('.site-header');
    return {
      scrolled: window.scrollY,
      slim: header.hasAttribute('data-slim'),
      rule: header.dataset.rule,
      transform: getComputedStyle(header).transform,
      receipt: Number(getComputedStyle(header.querySelector('.rule-receipt')).opacity),
      // The hairline is torn off by a clip while the receipt prints, so it
      // counts as shown only if it is opaque and not clipped away.
      plain: (() => {
        const style = getComputedStyle(header.querySelector('.rule-plain'));
        return Number(style.opacity) > 0 && !style.clipPath.startsWith("inset(0px 0px 0px 100%") ? 1 : 0;
      })(),
      // Running only: a finished print holds its last frame (fill both).
      ruleAnimations: header.querySelector('.site-header-rule').getAnimations({ subtree: true }).filter((a) => a.playState === 'running').length,
    };
  });
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const storeId = await pricedStoreId();
  check('a priced store exists to check its page', storeId !== null);
  const pages = [
    { name: 'landing', url: '/', current: 'Sandwich Index' },
    { name: 'map', url: '/map', current: 'Map' },
    ...(storeId === null ? [] : [{ name: 'store', url: `/store/${storeId}`, current: 'Map' }]),
    { name: 'about', url: '/about', current: 'About the data' },
  ];

  const browser = await chromium.launch({ channel: 'msedge' });
  try {
    // --- 1 and 3. Every page, both widths, motion on and off.
    for (const viewport of [{ width: 375, height: 812 }, { width: 1440, height: 900 }]) {
      for (const motion of ['on', 'reduced']) {
        const context = await browser.newContext({
          viewport,
          isMobile: viewport.width < 768,
          hasTouch: viewport.width < 768,
          reducedMotion: motion === 'reduced' ? 'reduce' : 'no-preference',
        });
        await context.addInitScript(watchHeader);
        for (const target of pages) {
          const tag = `[${viewport.width} ${motion}] ${target.name}`;
          const stem = `${target.name}-${viewport.width}-${motion}`;
          const page = await context.newPage();
          const errors = [];
          page.on('pageerror', (error) => errors.push(error.message));
          await page.goto(TARGET_URL + target.url, { waitUntil: 'load' });
          await page.evaluate(() => document.fonts.ready);
          await page.waitForTimeout(1800);

          const state = await headerState(page);
          check(`${tag}: one banner with one main nav landmark`, state.banner && state.mainNavs === 1, `navs on page ${state.navs}`);
          check(`${tag}: "${target.current}" is the current page`, state.current === target.current, String(state.current));
          check(`${tag}: masthead shows ${FIGURE} and ${CHECKED}`,
            state.mastheadShown && state.masthead.includes(FIGURE) && state.masthead.includes(CHECKED)
              && state.checked === MAP.generatedFrom.newestObservedAt.slice(0, 10),
            state.masthead);
          check(`${tag}: nothing scrolls sideways`, !state.sideways);
          check(`${tag}: no page errors`, errors.length === 0, errors.join('; '));

          if (motion === 'reduced') {
            const first = await page.evaluate(() => window.__header);
            check(`${tag}: logo, wordmark and figure are final from the first frame`,
              !first.gate && !first.roll && first.bun.every((o) => o === 1) && first.word.every((c) => c === 'none') && !first.rolling,
              `gate ${first.gate}, roll ${first.roll}, min bun ${Math.min(...first.bun)}, rolling ${first.rolling}`);
          }

          await page.screenshot({ path: path.join(OUT, `${stem}-top.png`) });
          await page.mouse.move(viewport.width / 2, viewport.height / 2);
          await page.mouse.wheel(0, 600);
          await page.waitForTimeout(motion === 'reduced' ? 60 : 500);
          const scrolled = await scrollState(page);
          if (scrolled.scrolled > 24) {
            check(`${tag}: past 24px the bar slims and the receipt rule shows`,
              scrolled.slim && scrolled.transform.endsWith(', -8)') && scrolled.receipt === 1 && scrolled.plain === 0,
              JSON.stringify(scrolled));
            if (motion === 'reduced') {
              check(`${tag}: the rule swaps without printing`, scrolled.ruleAnimations === 0, String(scrolled.ruleAnimations));
            }
          } else {
            // The map fills the viewport; the window itself does not scroll.
            check(`${tag}: a page that cannot scroll keeps the full bar`, !scrolled.slim && scrolled.rule === 'plain', JSON.stringify(scrolled));
          }
          // Headless Edge can capture the first frame after one big wheel jump
          // before it has painted the sticky bar (with or without slimming), so
          // the picture waits for the scroll to settle.
          await page.waitForTimeout(400);
          await page.screenshot({ path: path.join(OUT, `${stem}-scrolled.png`) });
          await page.close();
        }
        await context.close();
      }
    }

    // --- 2. Once-only moments in one tab.
    {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      await context.addInitScript(watchHeader);
      const page = await context.newPage();
      await page.goto(`${TARGET_URL}/about`, { waitUntil: 'load' });
      await page.waitForTimeout(2200);
      const first = await page.evaluate(() => ({ ...window.__header, built: sessionStorage.getItem('si-logo-built'), seen: localStorage.getItem('si-masthead-seen') }));
      check('first page of a session: the gate holds the logo before paint', first.gate);
      check('first page: the layers drop in (start hidden, end at full opacity)',
        first.bun[0] === 0 && first.bun.at(-1) === 1, `first ${first.bun[0]}, last ${first.bun.at(-1)}`);
      check('first page: the wordmark inks in left to right',
        first.word.some((c) => /inset\(0px [1-9]/.test(c)) && ['none', 'inset(0px)', 'inset(0px 0% 0px 0px)'].includes(first.word.at(-1)),
        `${first.word[0]} → ${first.word.at(-1)}`);
      check('first visit: the figure rolls from the first frame, never held still at zero',
        first.roll && first.rollingAtFirst === true && first.seen === String(MAP.priceCents.median),
        `roll ${first.roll}, rolling at first frame ${first.rollingAtFirst}, seen ${first.seen}`);
      check('the session is marked as built', first.built === '1');
      const settled = await page.evaluate(() => {
        const header = document.querySelector('.site-header');
        const animations = header.getAnimations({ subtree: true });
        return { running: animations.filter((a) => a.playState === 'running').length, endless: animations.filter((a) => a.effect?.getComputedTiming().iterations === Infinity).length };
      });
      check('after 2s nothing in the header is still moving, and nothing loops', settled.running === 0 && settled.endless === 0, JSON.stringify(settled));

      // The slim bar and the receipt rule.
      await page.mouse.move(700, 450);
      await page.mouse.wheel(0, 400);
      await page.waitForTimeout(80);
      const printing = await scrollState(page);
      check('first time past 24px: the rule prints', printing.rule === 'print' && printing.ruleAnimations > 0, JSON.stringify(printing));
      await page.waitForTimeout(400);
      const slim = await scrollState(page);
      check('the bar slims by 8px and the receipt holds', slim.slim && slim.transform.endsWith(', -8)') && slim.receipt === 1 && slim.ruleAnimations === 0, JSON.stringify(slim));
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(400);
      const top = await scrollState(page);
      check('back at the top: the full bar and the plain hairline return', !top.slim && top.rule === 'plain' && top.plain === 1, JSON.stringify(top));
      await page.mouse.wheel(0, 400);
      await page.waitForTimeout(80);
      const again = await scrollState(page);
      check('second time past 24px: the receipt is there without a replay', again.rule === 'receipt' && again.ruleAnimations === 0, JSON.stringify(again));
      await page.evaluate(() => window.scrollTo(0, 0));
      await page.waitForTimeout(300);

      // The stamp: press, then the focus ring.
      const stamp = page.locator('nav[aria-label="Main"] a.stamp');
      const box = await stamp.locator('.stamp-face').boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
      await page.mouse.down();
      await page.waitForTimeout(200);
      const pressed = await page.evaluate(() => {
        const face = document.querySelector('.stamp-face');
        return { face: getComputedStyle(face).transform, shadow: getComputedStyle(face, '::before').transform };
      });
      await page.mouse.move(10, 600);
      await page.mouse.up();
      check('the stamp presses down: scale 0.97 and the offset collapses',
        pressed.face === 'matrix(0.97, 0, 0, 0.97, 1, 1)' && ['none', 'matrix(1, 0, 0, 1, 0, 0)'].includes(pressed.shadow), JSON.stringify(pressed));
      // From the Map link, one Tab forward, as a keyboard user would arrive.
      await page.focus('nav[aria-label="Main"] a[href="/map"]');
      await page.keyboard.press('Tab');
      const focused = await page.evaluate(() => document.activeElement?.classList.contains('stamp'));
      const ring = await page.evaluate(() => {
        const face = getComputedStyle(document.querySelector('.stamp-face'));
        return `${face.outlineStyle} ${face.outlineWidth} ${face.outlineOffset}`;
      });
      check('the stamp shows a visible focus ring from the keyboard', focused && ring === 'solid 2px 3px', ring);
      check('the stamp is named "Log prices"', (await stamp.getAttribute('aria-label')) === 'Log prices');

      // The ink stroke glides from About to Log prices.
      const from = await page.evaluate(() => document.querySelector('.nav-ink').getBoundingClientRect().left);
      await page.evaluate(() => {
        window.__ink = [];
        const start = performance.now();
        const tick = () => {
          const ink = document.querySelector('.nav-ink');
          if (ink) window.__ink.push({ t: performance.now() - start, x: ink.getBoundingClientRect().left });
          if (performance.now() - start < 1500) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      });
      await stamp.click();
      await page.waitForURL(/\/log$/);
      await page.waitForTimeout(1600);
      const glide = await page.evaluate(() => ({
        samples: window.__ink,
        to: document.querySelector('.stamp .nav-ink')?.getBoundingClientRect().left ?? null,
        settled: document.querySelector('.nav-ink')?.hasAttribute('data-settled'),
        current: document.querySelector('nav [aria-current="page"]')?.getAttribute('aria-label'),
      }));
      const lo = Math.min(from, glide.to);
      const hi = Math.max(from, glide.to);
      const between = glide.samples.filter((s) => s.x > lo + 2 && s.x < hi - 2);
      const span = between.length ? between.at(-1).t - between[0].t : 0;
      check('the ink stroke glides to the new tab (in between frames, under 240ms)',
        glide.current === 'Log prices' && between.length > 0 && span < 240,
        `${Math.round(from)} → ${Math.round(glide.to)}, ${between.length} frames between, ${Math.round(span)}ms`);
      check('the stroke arrives settled (it does not draw again)', glide.settled === true);

      // Next page of the same session: built from the start, figure still.
      await page.goto(`${TARGET_URL}/map`, { waitUntil: 'load' });
      await page.waitForTimeout(800);
      const second = await page.evaluate(() => window.__header);
      check('a later page of the session shows the logo built, the figure still',
        !second.gate && !second.roll && second.bun.every((o) => o === 1) && !second.rolling,
        `gate ${second.gate}, roll ${second.roll}, min bun ${Math.min(...second.bun)}, rolling ${second.rolling}`);

      // A different stored figure rolls again (a changed median); the logo stays built.
      await page.evaluate(() => localStorage.setItem('si-masthead-seen', '1'));
      await page.goto(`${TARGET_URL}/about`, { waitUntil: 'load' });
      await page.waitForTimeout(800);
      const changed = await page.evaluate(() => ({ ...window.__header, seen: localStorage.getItem('si-masthead-seen') }));
      check('a changed figure rolls again, and only the figure',
        !changed.gate && changed.roll && changed.rollingAtFirst === true && changed.bun.every((o) => o === 1)
          && changed.seen === String(MAP.priceCents.median),
        `gate ${changed.gate}, roll ${changed.roll}, rolling at first frame ${changed.rollingAtFirst}, min bun ${Math.min(...changed.bun)}`);

      // Timing tokens.
      const timing = await page.evaluate(() => {
        const s = (selector, pseudo) => getComputedStyle(document.querySelector(selector), pseudo);
        return {
          bar: s('.site-header').transitionDuration,
          row: s('.site-header-row').transitionDuration,
          stamp: s('.stamp-face').transitionDuration,
          spring: 'motion',
        };
      });
      check('slim transitions stay under 240ms and the stamp at 120ms',
        timing.bar === '0.2s' && timing.row === '0.2s' && timing.stamp === '0.12s', JSON.stringify(timing));
      await context.close();
    }

    // --- 5. A phone narrower than 375px.
    {
      const context = await browser.newContext({ viewport: { width: 360, height: 760 }, isMobile: true, hasTouch: true });
      const page = await context.newPage();
      await page.goto(`${TARGET_URL}/about`, { waitUntil: 'load' });
      await page.waitForTimeout(1500);
      const narrow = await page.evaluate(() => ({
        masthead: getComputedStyle(document.querySelector('.masthead')).display,
        word: document.querySelector('.logo-word').getBoundingClientRect().height,
        gap: document.querySelector('nav').getBoundingClientRect().left - document.querySelector('.logo-word').getBoundingClientRect().right,
        sideways: document.documentElement.scrollWidth > window.innerWidth,
      }));
      check('[360] the masthead steps aside and the wordmark stays on one line',
        narrow.masthead === 'none' && narrow.word < 32 && narrow.gap > 8 && !narrow.sideways, JSON.stringify(narrow));
      await page.screenshot({ path: path.join(OUT, 'about-360-on-top.png') });
      await context.close();
    }
  } catch (error) {
    check('suite ran to completion', false, error.message);
    console.error(error);
  } finally {
    await browser.close();
  }

  const failed = results.filter((r) => !r.passed);
  console.log(`\n${results.length - failed.length}/${results.length} passed; screenshots in ${path.relative(process.cwd(), OUT)}`);
  process.exit(failed.length === 0 ? 0 : 1);
})();
