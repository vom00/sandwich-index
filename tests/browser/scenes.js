/**
 * The landing page's world: one canvas pinned behind the opening chapters,
 * one camera that pulls back from a sandwich on a tray to the counter and its
 * price board, the restaurant, the street, and finally the national map.
 *
 * What it promises, checked from the outside:
 *   - The text paints first. The headline does not move when three.js
 *     arrives, because the canvas is laid over the page, not into it.
 *   - Scrolling is the camera: the page's own chapter positions map to a
 *     "beat" from 0 to 5, the stage changes with every chapter, and the price
 *     board steps through real prices that are also listed in the page.
 *   - On a wide screen the world is a panel to the right of the text.
 *   - Under reduced motion nothing is pinned or animated: the canvas is one
 *     still picture behind the hero, the chapters read as a plain page, and a
 *     flat map is drawn instead of the moving one.
 *   - Without WebGL the page is the chapters, with the flat map.
 *   - It is decorative to assistive technology, and everything it shows is
 *     also written in the page as text.
 *   - On a phone the sandwich sits after the call to action, the long lists
 *     stay readable to screen readers, and nothing scrolls sideways.
 *   - Nothing is logged to the console, warnings included.
 *
 * Screenshots of each beat go to tests/browser/screenshots/ for review.
 * Needs `npm run dev` and the emulator, like every suite here.
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const TARGET_URL = process.env.TARGET_URL || 'http://localhost:3000';
const SHOTS = path.join(__dirname, 'screenshots');
const BEATS = [
  ['tray', 0],
  ['counter', 1],
  ['restaurant', 2],
  ['street', 3],
  ['country', 4],
  ['settled', 4.99],
];

const results = [];
function check(name, passed, detail = '') {
  results.push({ name, passed, detail });
  console.log(`${passed ? '  PASS' : '  FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
}

async function openLanding(browser, options) {
  const context = await browser.newContext(options);
  const page = await context.newPage();
  const noise = [];
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') noise.push(m.text());
  });
  page.on('pageerror', (e) => noise.push('pageerror: ' + e.message));
  await page.goto(TARGET_URL, { waitUntil: 'domcontentloaded' });
  return { context, page, noise };
}

function rect(page, selector) {
  return page.evaluate((s) => {
    const el = document.querySelector(s);
    if (el === null) return null;
    const r = el.getBoundingClientRect();
    return {
      top: r.top + window.scrollY, bottom: r.bottom + window.scrollY,
      left: r.left, right: r.right, width: r.width, height: r.height,
    };
  }, selector);
}

/** An element's layout position, ignoring transforms (the entrance reveal slides text with one). */
function layoutBox(page, selector) {
  return page.evaluate((s) => {
    const el = document.querySelector(s);
    if (el === null) return null;
    let top = 0;
    let left = 0;
    for (let node = el; node !== null; node = node.offsetParent) {
      top += node.offsetTop;
      left += node.offsetLeft;
    }
    return { top, left, width: el.offsetWidth, height: el.offsetHeight };
  }, selector);
}

function sceneReady(page) {
  return page.waitForSelector('canvas.lp-gl[data-ready="true"]', { state: 'attached', timeout: 30000 });
}

/** Scroll to a beat (0..5) through the anchors the story writes, and wait for the camera to settle there. */
async function scrollToBeat(page, beat) {
  await page.waitForFunction(() => (document.querySelector('.lp-story')?.dataset.anchors ?? '') !== '');
  await page.evaluate((b) => {
    const anchors = document.querySelector('.lp-story').dataset.anchors.split(',').map(Number);
    const i = Math.min(anchors.length - 2, Math.floor(b));
    window.scrollTo(0, Math.round(anchors[i] + (anchors[i + 1] - anchors[i]) * (b - i)));
  }, beat);
  await page.waitForFunction(
    (b) => Math.abs(Number(document.querySelector('.lp-story').dataset.beat) - b) < 0.02,
    beat, { timeout: 10000 },
  ).catch(() => undefined);
  await page.waitForTimeout(250);
}

const cents = (text) => Math.round(Number(text.replace(/[^0-9.]/g, '')) * 100);

(async () => {
  let browser;
  try {
    fs.mkdirSync(SHOTS, { recursive: true });
    browser = await chromium.launch({ channel: 'msedge' });

    // ---------------------------------------------------------------
    // Wide screen, motion allowed.
    const wide = await openLanding(browser, { viewport: { width: 1280, height: 900 } });
    // The web fonts settle the text first; what is checked here is the scene's arrival.
    await wide.page.evaluate(() => document.fonts.ready);
    const early = await wide.page.locator('canvas.lp-gl[data-ready="true"]').count();
    const before = await layoutBox(wide.page, 'main h1');
    check('[hero] the headline paints before three.js loads', before !== null && before.height > 40,
      before ? `${Math.round(before.width)}×${Math.round(before.height)}` : 'no h1');

    await sceneReady(wide.page);
    await wide.page.waitForTimeout(600);
    const after = await layoutBox(wide.page, 'main h1');
    check('[hero] the headline does not move when the scene arrives',
      before !== null && after !== null && Math.abs(before.top - after.top) < 1 && Math.abs(before.left - after.left) < 1,
      after ? `top ${before.top}→${after.top}${early ? ' (scene was already up)' : ''}` : 'no h1');

    const copy = await rect(wide.page, '.lp-hero-copy');
    const canvas = await rect(wide.page, 'canvas.lp-gl');
    check('[hero] on a wide screen the world is a panel right of the text',
      canvas.width > 300 && canvas.left >= copy.right - 1 && canvas.right >= 1270,
      JSON.stringify({ copyRight: copy.right, canvasLeft: canvas.left, canvasRight: canvas.right }));

    const stage = wide.page.locator('.lp-stage');
    const frames = {};
    for (const [name, beat] of BEATS) {
      await scrollToBeat(wide.page, beat);
      frames[name] = await stage.screenshot({ path: path.join(SHOTS, `world-${name}.png`) });
    }
    for (let i = 1; i < BEATS.length; i += 1) {
      check(`[${BEATS[i][0]}] scrolling to the beat changes the stage`,
        !frames[BEATS[i][0]].equals(frames[BEATS[i - 1][0]]));
    }

    await scrollToBeat(wide.page, 2.5);
    const followed = Number(await wide.page.locator('.lp-story').getAttribute('data-beat'));
    check('the camera follows the scroll position', Math.abs(followed - 2.5) < 0.02, `beat ${followed}`);

    const listed = await wide.page.evaluate(() =>
      [...document.querySelectorAll('.lp-board li .tabular')].map((el) => el.textContent.trim()));
    const listedCents = listed.map(cents);
    const boards = [];
    for (const beat of [0.5, 1, 1.5, 1.79]) {
      await scrollToBeat(wide.page, beat);
      boards.push(Number(await wide.page.locator('.lp-story').getAttribute('data-board')));
    }
    check('[counter] the board steps through prices as the page scrolls',
      new Set(boards).size >= 3 && boards.every((b, i) => i === 0 || b >= boards[i - 1]), boards.join(' → '));
    check('[counter] every price the board shows is listed in the page',
      boards.length > 0 && boards.every((b) => listedCents.includes(b)), `${boards.join(',')} in ${listed.join(',')}`);

    await scrollToBeat(wide.page, 1);
    const calls = Number(await wide.page.locator('.lp-story').getAttribute('data-calls'));
    check('[counter] the busiest shot stays cheap to draw', calls > 0 && calls <= 40, `${calls} draw calls`);
    const quality = await wide.page.locator('.lp-story').getAttribute('data-quality');
    check('the quality tier is reported', /^[012]$/.test(quality ?? ''), quality ?? 'none');

    check('the stage is hidden from assistive technology', (await stage.getAttribute('aria-hidden')) === 'true');
    const written = await wide.page.evaluate(() => {
      const ends = [...document.querySelectorAll('.lp-hero-range b')].map((b) => b.textContent.trim());
      const board = document.querySelector('[data-beat="1"]').textContent;
      const map = document.querySelector('[data-beat="4"]').textContent;
      return {
        ends,
        missing: ends.filter((e) => !board.includes(e)),
        credit: /Source: Drive Thru Index \(https:\/\/drivethruindex\.com\)/.test(map),
        headings: [...document.querySelectorAll('.lp-chapters [data-beat] h2')].length,
        flatMap: getComputedStyle(document.querySelector('.lp-static')).display,
      };
    });
    check('the cheapest and dearest prices are written in the counter chapter',
      written.ends.length >= 2 && written.missing.length === 0, JSON.stringify(written.ends));
    check('every chapter has a heading', written.headings === 4, `${written.headings}`);
    check('the map chapter credits its source', written.credit);
    check('the flat map stays hidden while the 3D one is shown', written.flatMap === 'none', written.flatMap);

    check('nothing is logged to the console', wide.noise.length === 0, wide.noise.slice(0, 3).join(' | '));
    await wide.context.close();

    // ---------------------------------------------------------------
    // Reduced motion: one still picture, nothing pinned, the flat map instead.
    const still = await openLanding(browser, { viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
    await sceneReady(still.page);
    await still.page.waitForTimeout(800);
    const picture = still.page.locator('canvas.lp-gl');
    const c = await picture.screenshot({ path: path.join(SHOTS, 'world-still.png') });
    await still.page.waitForTimeout(1000);
    const d = await picture.screenshot();
    check('with reduced motion the picture holds still', c.equals(d));
    const transition = await picture.evaluate((el) => getComputedStyle(el).transitionDuration);
    check('with reduced motion it appears without a fade', /^0s/.test(transition), transition);

    const stillLayout = await still.page.evaluate(() => {
      const stageEl = document.querySelector('.lp-stage');
      return {
        stagePosition: getComputedStyle(stageEl).position,
        stageBottom: Math.round(stageEl.getBoundingClientRect().bottom),
        heroBottom: Math.round(document.querySelector('.lp-hero').getBoundingClientRect().bottom),
        copy: [...document.querySelectorAll('.lp-copy')].map((el) => getComputedStyle(el).position),
        flatMap: getComputedStyle(document.querySelector('.lp-static')).display,
      };
    });
    check('with reduced motion nothing is pinned',
      stillLayout.stagePosition === 'absolute' && stillLayout.copy.every((p) => p === 'static'),
      JSON.stringify({ stage: stillLayout.stagePosition, copy: stillLayout.copy }));
    check('with reduced motion the picture ends where the hero does',
      Math.abs(stillLayout.stageBottom - stillLayout.heroBottom) <= 2,
      `${stillLayout.stageBottom} vs ${stillLayout.heroBottom}`);

    await still.page.evaluate(() => window.scrollTo(0, document.body.scrollHeight / 2));
    await still.page.waitForTimeout(500);
    const stillBeat = await still.page.locator('.lp-story').getAttribute('data-beat');
    check('with reduced motion scrolling does not move the camera', Number(stillBeat) === 0, `beat ${stillBeat}`);

    check('with reduced motion the flat map takes the moving one\'s place', stillLayout.flatMap === 'block', stillLayout.flatMap);
    await still.page.locator('.lp-static').scrollIntoViewIfNeeded();
    const stillMap = await still.page.waitForFunction(() => {
      const el = document.querySelector('.lp-static canvas');
      return el !== null && el.width > 300 ? el.width : false;
    }, null, { timeout: 30000 }).then((handle) => handle.jsonValue()).catch(() => 0);
    check('with reduced motion the flat map is drawn', stillMap > 300, `${stillMap}px wide`);
    await still.page.waitForTimeout(400);
    await still.page.locator('[data-beat="4"]').screenshot({ path: path.join(SHOTS, 'world-map-still.png') });

    check('nothing is logged under reduced motion either', still.noise.length === 0, still.noise.slice(0, 3).join(' | '));
    await still.context.close();

    // ---------------------------------------------------------------
    // Phone: text first, the sandwich after it, nothing wider than the screen.
    const phone = await openLanding(browser, { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
    const order = await phone.page.evaluate(() => {
      const top = (el) => el.getBoundingClientRect().top + window.scrollY;
      const bottom = (el) => el.getBoundingClientRect().bottom + window.scrollY;
      const cta = [...document.querySelectorAll('main a')].find((a) => /Find prices near you/.test(a.textContent));
      return { roomTop: top(document.querySelector('[data-hero-room]')), ctaBottom: bottom(cta) };
    });
    check('[hero] on a phone the sandwich comes after the call to action',
      order.roomTop > order.ctaBottom, JSON.stringify(order));
    check('on a phone nothing scrolls sideways',
      await phone.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await sceneReady(phone.page);
    const detail = await phone.page.evaluate(() => {
      const list = document.querySelector('.lp-board');
      return { width: list.getBoundingClientRect().width, items: list.querySelectorAll('li').length };
    });
    check('on a phone the price list is kept for screen readers but off the screen',
      detail.width <= 1 && detail.items >= 2, JSON.stringify(detail));
    for (const [name, beat] of BEATS) {
      await scrollToBeat(phone.page, beat);
      await phone.page.screenshot({ path: path.join(SHOTS, `world-${name}-phone.png`) });
    }
    check('on a phone nothing scrolls sideways at the end of the story either',
      await phone.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    check('nothing is logged on a phone', phone.noise.length === 0, phone.noise.slice(0, 3).join(' | '));
    await phone.context.close();
    await browser.close();

    // ---------------------------------------------------------------
    // No WebGL: the chapters are the page, with the flat map.
    browser = await chromium.launch({ channel: 'msedge', args: ['--disable-webgl', '--disable-3d-apis'] });
    const plain = await openLanding(browser, { viewport: { width: 1280, height: 900 } });
    await plain.page.waitForFunction(() => document.querySelector('.lp-story')?.dataset.gl === 'off', null, { timeout: 15000 })
      .catch(() => undefined);
    const plainLayout = await plain.page.evaluate(() => ({
      gl: document.querySelector('.lp-story').dataset.gl,
      stage: getComputedStyle(document.querySelector('.lp-stage')).display,
      copy: [...document.querySelectorAll('.lp-copy')].map((el) => getComputedStyle(el).position),
      flatMap: getComputedStyle(document.querySelector('.lp-static')).display,
    }));
    check('without WebGL the story says so', plainLayout.gl === 'off', plainLayout.gl ?? 'unset');
    check('without WebGL there is no stage and nothing is pinned',
      plainLayout.stage === 'none' && plainLayout.copy.every((p) => p === 'static'), JSON.stringify(plainLayout));
    await plain.page.locator('.lp-static').scrollIntoViewIfNeeded();
    const plainMap = await plain.page.waitForFunction(() => {
      const el = document.querySelector('.lp-static canvas');
      return el !== null && el.width > 300 ? el.width : false;
    }, null, { timeout: 30000 }).then((handle) => handle.jsonValue()).catch(() => 0);
    check('without WebGL the flat map is drawn', plainMap > 300, `${plainMap}px wide`);
    check('nothing is logged without WebGL', plain.noise.length === 0, plain.noise.slice(0, 3).join(' | '));
    await plain.context.close();
  } catch (error) {
    check('suite ran to completion', false, error.message);
    console.error(error);
  } finally {
    if (browser) await browser.close();

    const passed = results.filter((r) => r.passed).length;
    console.log(`\n${'='.repeat(64)}`);
    console.log(`Landing world: ${passed}/${results.length} passed`);
    for (const r of results.filter((x) => !x.passed)) {
      console.log(`  - ${r.name}${r.detail ? `  [${r.detail}]` : ''}`);
    }
    console.log('='.repeat(64));
    process.exit(passed === results.length ? 0 : 1);
  }
})();
