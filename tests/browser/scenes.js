/**
 * The three clay 3D scenes on the landing page: the kitchen line in the hero,
 * the headquarters in "Why it moves", somebody logging a price in "How a price
 * gets here".
 *
 * What each one promises, checked from the outside:
 *   - It reserves its space before three.js arrives, so the page doesn't shift.
 *   - It animates once on screen, and holds a single still frame under reduced
 *     motion, appearing without a fade.
 *   - It is decorative to assistive technology, with the meaning in a caption.
 *   - It sits where the layout says: beside its text on a wide screen, after
 *     the text (and the hero's call to action) on a phone, with no sideways
 *     scroll.
 *   - Nothing is logged to the console, warnings included.
 *
 * Screenshots of each scene go to tests/browser/screenshots/ for review.
 * Needs `npm run dev` and the emulator, like every suite here.
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const TARGET_URL = process.env.TARGET_URL || 'http://localhost:3000';
const SHOTS = path.join(__dirname, 'screenshots');
const SCENES = ['kitchen', 'headquarters', 'logging'];

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

/**
 * The box's layout position, not its painted one. The hero's figure rises in
 * with a transform, which moves pixels without shifting anything around it, so
 * boundingBox() would report a "shift" that isn't one.
 */
function layoutBox(page, scene) {
  return page.evaluate((name) => {
    const box = document.querySelector(`figure[data-scene="${name}"] > div`);
    if (box === null) return null;
    let y = 0;
    for (let el = box; el !== null; el = el.offsetParent) y += el.offsetTop;
    return { y, width: box.offsetWidth, height: box.offsetHeight };
  }, scene);
}

async function bringIntoView(page, scene) {
  await page.locator(`figure[data-scene="${scene}"]`).scrollIntoViewIfNeeded();
  await page.waitForSelector(`figure[data-scene="${scene}"] canvas[data-status="ready"]`, { timeout: 30000 });
}

function rect(page, selector) {
  return page.evaluate((s) => {
    const el = document.querySelector(s);
    if (el === null) return null;
    const r = el.getBoundingClientRect();
    return { top: r.top + window.scrollY, bottom: r.bottom + window.scrollY, left: r.left, right: r.right };
  }, selector);
}

(async () => {
  let browser;
  try {
    fs.mkdirSync(SHOTS, { recursive: true });
    browser = await chromium.launch({ channel: 'msedge' });

    // ---------------------------------------------------------------
    // Wide screen, motion allowed.
    const wide = await openLanding(browser, { viewport: { width: 1280, height: 900 } });
    const reserved = {};
    for (const scene of SCENES) {
      reserved[scene] = await layoutBox(wide.page, scene);
      check(`[${scene}] its box is reserved before three.js loads`,
        reserved[scene] !== null && reserved[scene].height > 100,
        reserved[scene] ? `${reserved[scene].width}×${reserved[scene].height}` : 'no box');
    }

    for (const scene of SCENES) {
      await bringIntoView(wide.page, scene);
      const after = await layoutBox(wide.page, scene);
      check(`[${scene}] the box does not move or resize when the scene arrives`,
        reserved[scene] !== null && after !== null &&
        Math.abs(reserved[scene].y - after.y) < 1 && Math.abs(reserved[scene].height - after.height) < 1,
        after ? `y ${reserved[scene].y}→${after.y}` : 'no box');

      const canvas = wide.page.locator(`figure[data-scene="${scene}"] canvas`);
      await wide.page.waitForTimeout(800);
      const a = await canvas.screenshot({ path: path.join(SHOTS, `scene-${scene}.png`) });
      await wide.page.waitForTimeout(1000);
      const b = await canvas.screenshot();
      check(`[${scene}] it animates`, !a.equals(b));

      check(`[${scene}] the canvas is hidden from assistive technology`,
        (await canvas.getAttribute('aria-hidden')) === 'true');
      const caption = (await wide.page.locator(`figure[data-scene="${scene}"] figcaption`).innerText()).trim();
      check(`[${scene}] a caption says what the scene shows`, caption.length > 30, caption);
    }

    // Placement on a wide screen.
    const heroHeading = await rect(wide.page, 'main h1');
    const kitchen = await rect(wide.page, 'figure[data-scene="kitchen"]');
    check('[kitchen] beside the headline on a wide screen',
      kitchen.left >= heroHeading.right - 1 && kitchen.top < heroHeading.bottom, JSON.stringify({ kitchen, heroHeading }));
    const premiseText = await rect(wide.page, 'figure[data-scene="headquarters"] ~ div');
    const hq = await rect(wide.page, 'figure[data-scene="headquarters"]');
    check('[headquarters] beside the section text on a wide screen',
      premiseText !== null && hq.right <= premiseText.left + 1 && hq.top < premiseText.bottom,
      JSON.stringify({ hq, premiseText }));
    const steps = await rect(wide.page, 'figure[data-scene="logging"]');
    const stepsList = await rect(wide.page, 'main ol');
    check('[logging] beside the steps on a wide screen',
      stepsList !== null && steps.left >= stepsList.right - 1, JSON.stringify({ steps, stepsList }));

    check('nothing is logged to the console', wide.noise.length === 0, wide.noise.slice(0, 3).join(' | '));
    await wide.context.close();

    // ---------------------------------------------------------------
    // Reduced motion: one still frame, never animated, no fade.
    const still = await openLanding(browser, { viewport: { width: 1280, height: 900 }, reducedMotion: 'reduce' });
    for (const scene of SCENES) {
      await bringIntoView(still.page, scene);
      const canvas = still.page.locator(`figure[data-scene="${scene}"] canvas`);
      await still.page.waitForTimeout(800);
      const c = await canvas.screenshot({ path: path.join(SHOTS, `scene-${scene}-still.png`) });
      await still.page.waitForTimeout(1000);
      const d = await canvas.screenshot();
      check(`[${scene}] with reduced motion it holds still`, c.equals(d));
      const transition = await canvas.evaluate((el) => getComputedStyle(el).transitionDuration);
      check(`[${scene}] with reduced motion it appears without a fade`, /^0s/.test(transition), transition);
    }
    check('nothing is logged under reduced motion either', still.noise.length === 0, still.noise.slice(0, 3).join(' | '));
    await still.context.close();

    // ---------------------------------------------------------------
    // Phone: text first, scenes after it, nothing wider than the screen.
    const phone = await openLanding(browser, { viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true });
    const order = await phone.page.evaluate(() => {
      const top = (el) => el.getBoundingClientRect().top + window.scrollY;
      const bottom = (el) => el.getBoundingClientRect().bottom + window.scrollY;
      const cta = [...document.querySelectorAll('main a')].find((a) => /Find prices near you/.test(a.textContent));
      const hq = document.querySelector('figure[data-scene="headquarters"]');
      return {
        kitchenTop: top(document.querySelector('figure[data-scene="kitchen"]')),
        ctaBottom: bottom(cta),
        hqTop: top(hq),
        premiseTextBottom: bottom(hq.parentElement.querySelector(':scope > div')),
      };
    });
    check('[kitchen] on a phone it comes after the call to action',
      order.kitchenTop > order.ctaBottom, JSON.stringify(order));
    check('[headquarters] on a phone it comes after the section text',
      order.hqTop > order.premiseTextBottom, JSON.stringify(order));
    check('on a phone nothing scrolls sideways',
      await phone.page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth));
    for (const scene of SCENES) {
      await bringIntoView(phone.page, scene);
      await phone.page.waitForTimeout(600);
      await phone.page.locator(`figure[data-scene="${scene}"] canvas`)
        .screenshot({ path: path.join(SHOTS, `scene-${scene}-phone.png`) });
    }
    check('nothing is logged on a phone', phone.noise.length === 0, phone.noise.slice(0, 3).join(' | '));
    await phone.context.close();
  } catch (error) {
    check('suite ran to completion', false, error.message);
    console.error(error);
  } finally {
    if (browser) await browser.close();

    const passed = results.filter((r) => r.passed).length;
    console.log(`\n${'='.repeat(64)}`);
    console.log(`Clay scenes: ${passed}/${results.length} passed`);
    for (const r of results.filter((x) => !x.passed)) {
      console.log(`  - ${r.name}${r.detail ? `  [${r.detail}]` : ''}`);
    }
    console.log('='.repeat(64));
    process.exit(passed === results.length ? 0 : 1);
  }
})();
