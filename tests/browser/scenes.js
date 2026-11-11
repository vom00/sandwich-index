/**
 * The pinned scroll story on the landing page: one clay sandwich that comes
 * apart, rides a price ruler, and gives way to the national dot map.
 *
 * What it promises, checked from the outside:
 *   - The hero reserves the sandwich's space before three.js arrives, so the
 *     page doesn't shift when it does.
 *   - Scrolling is the timeline: the stage changes as the page scrolls, the
 *     ruler's reading moves with it, and the map is drawn by the last chapter.
 *   - Under reduced motion nothing is pinned or animated: the stage holds one
 *     still frame, appearing without a fade, and still pictures of the ruler
 *     and the map take the place of the moving ones.
 *   - It is decorative to assistive technology, and everything it shows is
 *     also written in the page as text.
 *   - It sits where the layout says: beside the headline on a wide screen,
 *     after the call to action on a phone, with no sideways scroll.
 *   - Nothing is logged to the console, warnings included.
 *
 * Screenshots of each chapter go to tests/browser/screenshots/ for review.
 * Needs `npm run dev` and the emulator, like every suite here.
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const TARGET_URL = process.env.TARGET_URL || 'http://localhost:3000';
const SHOTS = path.join(__dirname, 'screenshots');
const CHAPTERS = ['hero', 'explode', 'ruler', 'map'];

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

/** The hero slot's layout position, not its painted one. */
function slotBox(page) {
  return page.evaluate(() => {
    const box = document.querySelector('.lc-hero-slot');
    if (box === null) return null;
    let y = 0;
    for (let el = box; el !== null; el = el.offsetParent) y += el.offsetTop;
    return { y, width: box.offsetWidth, height: box.offsetHeight };
  });
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

function sceneReady(page) {
  return page.waitForSelector('canvas.lc-gl[data-ready="true"]', { state: 'attached', timeout: 30000 });
}

/**
 * Scroll to a story clock: 0 is the hero, 1.x the exploded sandwich, 2.x the
 * ruler, 3.x the map. The story writes its chapter boundaries on resize.
 */
async function scrollToClock(page, clock) {
  await page.waitForFunction(() => (document.querySelector('.lc-story')?.dataset.bounds ?? '') !== '');
  await page.evaluate((c) => {
    const bounds = document.querySelector('.lc-story').dataset.bounds.split(',').map(Number);
    const i = Math.min(3, Math.floor(c));
    window.scrollTo(0, Math.round(bounds[i] + (bounds[i + 1] - bounds[i]) * (c - i)));
  }, clock);
  await page.waitForTimeout(700);
}

(async () => {
  let browser;
  try {
    fs.mkdirSync(SHOTS, { recursive: true });
    browser = await chromium.launch({ channel: 'msedge' });

    // ---------------------------------------------------------------
    // Wide screen, motion allowed.
    const wide = await openLanding(browser, { viewport: { width: 1280, height: 900 } });
    const reserved = await slotBox(wide.page);
    check('[hero] the sandwich\'s box is reserved before three.js loads',
      reserved !== null && reserved.height > 100,
      reserved ? `${reserved.width}×${reserved.height}` : 'no box');

    await sceneReady(wide.page);
    await wide.page.waitForTimeout(600);
    const after = await slotBox(wide.page);
    check('[hero] the box does not move or resize when the scene arrives',
      reserved !== null && after !== null &&
      Math.abs(reserved.y - after.y) < 1 && Math.abs(reserved.height - after.height) < 1,
      after ? `y ${reserved.y}→${after.y}` : 'no box');

    const heading = await rect(wide.page, 'main h1');
    const slot = await rect(wide.page, '.lc-hero-slot');
    const sandwich = await rect(wide.page, 'canvas.lc-gl');
    check('[hero] the sandwich is beside the headline on a wide screen',
      slot.left >= heading.right - 1 && slot.top < heading.bottom, JSON.stringify({ slot, heading }));
    const centre = { x: (sandwich.left + sandwich.right) / 2, y: (sandwich.top + sandwich.bottom) / 2 };
    check('[hero] the sandwich is drawn inside its reserved box',
      sandwich.width > 100 &&
      centre.x > slot.left && centre.x < slot.right && centre.y > slot.top && centre.y < slot.bottom,
      JSON.stringify({ centre, slot }));

    const stage = wide.page.locator('.lc-stage');
    const frames = {};
    for (const [index, chapter] of CHAPTERS.entries()) {
      await scrollToClock(wide.page, index === 0 ? 0 : index + 0.55);
      frames[chapter] = await stage.screenshot({ path: path.join(SHOTS, `story-${chapter}.png`) });
    }
    for (let i = 1; i < CHAPTERS.length; i += 1) {
      check(`[${CHAPTERS[i]}] scrolling into the chapter changes the stage`,
        !frames[CHAPTERS[i]].equals(frames[CHAPTERS[i - 1]]));
    }

    await scrollToClock(wide.page, 2.3);
    const readingA = (await wide.page.locator('.lc-reading-fig').innerText()).trim();
    await scrollToClock(wide.page, 2.8);
    const readingB = (await wide.page.locator('.lc-reading-fig').innerText()).trim();
    check('[ruler] the reading is a price, and scroll moves it',
      /^\$\d+\.\d{2}$/.test(readingA) && /^\$\d+\.\d{2}$/.test(readingB) && readingA !== readingB,
      `${readingA} → ${readingB}`);

    await scrollToClock(wide.page, 3.9);
    const mapSize = await wide.page.waitForFunction(() => {
      const canvas = document.querySelector('canvas.lc-map');
      return canvas !== null && canvas.width > 300 ? canvas.width : false;
    }, null, { timeout: 30000 }).then((handle) => handle.jsonValue()).catch(() => 0);
    check('[map] the dot map is drawn by the last chapter', mapSize > 300, `${mapSize}px wide`);

    check('the stage is hidden from assistive technology',
      (await stage.getAttribute('aria-hidden')) === 'true');
    const written = await wide.page.evaluate(() => {
      const text = document.querySelector('.lc-chapters').innerText.replace(/\s+/g, ' ');
      const ends = [...document.querySelectorAll('.lc-hero-range b')].map((b) => b.textContent.trim());
      return {
        parts: ['Top bun', 'Shredded lettuce', 'Breaded chicken patty', 'Bottom bun'].filter((p) => !text.includes(p)),
        ends: ends.filter((e) => !document.querySelector('[data-ch="ruler"]').textContent.includes(e)),
        credit: /Source: Drive Thru Index \(https:\/\/drivethruindex\.com\)/.test(
          document.querySelector('[data-ch="map"]').textContent),
        endCount: ends.length,
      };
    });
    check('what the stage shows is also written as text',
      written.parts.length === 0 && written.endCount === 2 && written.ends.length === 0,
      JSON.stringify(written));
    check('the map chapter credits its source', written.credit);

    check('nothing is logged to the console', wide.noise.length === 0, wide.noise.slice(0, 3).join(' | '));
    await wide.context.close();

    // ---------------------------------------------------------------
    // Reduced motion: one still frame, nothing pinned, still pictures instead.
    const still = await openLanding(browser, { viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
    await sceneReady(still.page);
    await still.page.waitForTimeout(800);
    const stillSandwich = still.page.locator('canvas.lc-gl');
    const c = await stillSandwich.screenshot({ path: path.join(SHOTS, 'story-hero-still.png') });
    await still.page.waitForTimeout(1000);
    const d = await stillSandwich.screenshot();
    check('with reduced motion the sandwich holds still', c.equals(d));
    const transition = await stillSandwich.evaluate((el) => getComputedStyle(el).transitionDuration);
    check('with reduced motion it appears without a fade', /^0s/.test(transition), transition);

    const stillLayout = await still.page.evaluate(() => {
      const shown = (selector) => [...document.querySelectorAll(selector)]
        .map((el) => getComputedStyle(el).display !== 'none');
      return {
        stagePosition: getComputedStyle(document.querySelector('.lc-stage')).position,
        moving: shown('.lc-ruler, .lc-reading, .lc-map, .lc-labels'),
        statics: shown('.lc-static'),
      };
    });
    check('with reduced motion nothing is pinned',
      stillLayout.stagePosition !== 'sticky' && stillLayout.stagePosition !== 'fixed', stillLayout.stagePosition);
    check('with reduced motion the moving ruler and map are not shown',
      stillLayout.moving.length > 0 && stillLayout.moving.every((v) => !v), JSON.stringify(stillLayout.moving));
    check('with reduced motion still pictures take their place',
      stillLayout.statics.length >= 2 && stillLayout.statics.every(Boolean), JSON.stringify(stillLayout.statics));

    await still.page.locator('[data-ch="map"] .lc-static').scrollIntoViewIfNeeded();
    const stillMap = await still.page.waitForFunction(() => {
      const canvas = document.querySelector('[data-ch="map"] .lc-static canvas');
      return canvas !== null && canvas.width > 300 ? canvas.width : false;
    }, null, { timeout: 30000 }).then((handle) => handle.jsonValue()).catch(() => 0);
    check('with reduced motion the still map is drawn', stillMap > 300, `${stillMap}px wide`);
    await still.page.waitForTimeout(400);
    await still.page.locator('[data-ch="map"]').screenshot({ path: path.join(SHOTS, 'story-map-still.png') });

    check('nothing is logged under reduced motion either', still.noise.length === 0, still.noise.slice(0, 3).join(' | '));
    await still.context.close();

    // ---------------------------------------------------------------
    // Phone: text first, the sandwich after it, nothing wider than the screen.
    const phone = await openLanding(browser, { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
    const order = await phone.page.evaluate(() => {
      const top = (el) => el.getBoundingClientRect().top + window.scrollY;
      const bottom = (el) => el.getBoundingClientRect().bottom + window.scrollY;
      const cta = [...document.querySelectorAll('main a')].find((a) => /Find prices near you/.test(a.textContent));
      return { slotTop: top(document.querySelector('.lc-hero-slot')), ctaBottom: bottom(cta) };
    });
    check('[hero] on a phone the sandwich comes after the call to action',
      order.slotTop > order.ctaBottom, JSON.stringify(order));
    check('on a phone nothing scrolls sideways',
      await phone.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    await sceneReady(phone.page);
    for (const [index, chapter] of CHAPTERS.entries()) {
      await scrollToClock(phone.page, index === 0 ? 0 : index + 0.55);
      await phone.page.screenshot({ path: path.join(SHOTS, `story-${chapter}-phone.png`) });
    }
    check('on a phone nothing scrolls sideways at the end of the story either',
      await phone.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    check('nothing is logged on a phone', phone.noise.length === 0, phone.noise.slice(0, 3).join(' | '));
    await phone.context.close();
  } catch (error) {
    check('suite ran to completion', false, error.message);
    console.error(error);
  } finally {
    if (browser) await browser.close();

    const passed = results.filter((r) => r.passed).length;
    console.log(`\n${'='.repeat(64)}`);
    console.log(`Landing story: ${passed}/${results.length} passed`);
    for (const r of results.filter((x) => !x.passed)) {
      console.log(`  - ${r.name}${r.detail ? `  [${r.detail}]` : ''}`);
    }
    console.log('='.repeat(64));
    process.exit(passed === results.length ? 0 : 1);
  }
})();
