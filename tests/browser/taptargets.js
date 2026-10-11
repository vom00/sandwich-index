/**
 * Tap-target sweep across every route, at mobile and desktop.
 *
 * The 44px minimum was only ever asserted on /log, which is how a 20px
 * "Change location" button survived on the map. This measures every
 * interactive element on every route instead.
 *
 * Third-party map chrome (Leaflet zoom, attribution) is reported separately
 * rather than failed — it is not ours to restyle, and conflating it with our
 * own controls is what makes a failing check easy to ignore.
 */
const { chromium } = require('playwright');

const TARGET_URL = 'http://localhost:3000';
const MIN_PX = 44;
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

/**
 * What a finger can actually hit, which is often not the element's own box.
 *
 * Three corrections, each of which produced a false alarm before it was
 * added. A check that cries wolf gets ignored, and being ignored is precisely
 * how a genuine 20px button survived on the map for this long.
 *
 *   1. **A wrapping `<label>` is the target.** A 16px radio inside a 44px
 *      label is compliant — the whole label activates it. Measuring the input
 *      flagged all four source pickers on /log, which were built correctly.
 *   2. **An absolutely positioned ::after overlay counts.** That is how an
 *      inline control reaches 44px without taking layout space.
 *   3. **Inline links inside prose are exempt**, per the "inline" exception
 *      in WCAG 2.5.5 and 2.5.8: a link in the middle of a sentence cannot be
 *      given a 44px box without wrecking the line it sits in. The exception
 *      is for links *in flowing text* — an action styled to look like one
 *      still needs the target, which is why "Change location" was fixed
 *      rather than excused.
 */
const MEASURE = () => {
  const out = [];
  for (const el of document.querySelectorAll('a[href], button, input, select, textarea')) {
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0) continue;

    const label = el.closest('label');
    let height = label ? Math.max(r.height, label.getBoundingClientRect().height) : r.height;

    for (const pseudo of ['::after', '::before']) {
      const s = getComputedStyle(el, pseudo);
      if (s.content && s.content !== 'none' && s.position === 'absolute') {
        const h = parseFloat(s.minHeight) || parseFloat(s.height) || 0;
        if (h > height) height = h;
      }
    }

    // A link is "inline in prose" when its parent is a text block that says
    // more than the link does — the link is part of a sentence rather than
    // being the whole point of its container.
    const parent = el.parentElement;
    const parentText = parent ? (parent.innerText || '').trim() : '';
    const ownText = (el.innerText || '').trim();
    const inlineInProse =
      el.tagName === 'A' &&
      getComputedStyle(el).display === 'inline' &&
      parentText.length > ownText.length + 20;

    out.push({
      tag: el.tagName,
      text: (el.innerText || el.getAttribute('aria-label') || el.placeholder || '').trim().slice(0, 30),
      height: Math.round(height),
      width: Math.round(r.width),
      thirdParty: el.closest('.leaflet-container') !== null,
      exempt: inlineInProse,
    });
  }
  return out;
};

async function sweep(page, label, path) {
  await page.goto(`${TARGET_URL}${path}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(600);

  const controls = await page.evaluate(MEASURE);
  const ours = controls.filter((c) => !c.thirdParty && !c.exempt);
  const small = ours.filter((c) => c.height < MIN_PX);
  const thirdPartySmall = controls.filter((c) => c.thirdParty && c.height < MIN_PX);

  check(
    `${label}: every control of ours is at least ${MIN_PX}px`,
    small.length === 0,
    small.length === 0
      ? `${ours.length} controls checked`
      : small.map((c) => `"${c.text}" ${c.height}px`).join(', '),
  );

  if (thirdPartySmall.length > 0) {
    console.log(
      `        (third-party map chrome under ${MIN_PX}px, not ours: ` +
        `${thirdPartySmall.map((c) => `${c.text || c.tag} ${c.height}px`).join(', ')})`,
    );
  }
}

(async () => {
  let browser;
  try {
    browser = await chromium.launch({ channel: 'msedge', headless: false });

    for (const [device, viewport] of [
      ['mobile', { width: 375, height: 812 }],
      ['desktop', { width: 1280, height: 900 }],
    ]) {
      console.log(`\n${device.toUpperCase()} (${viewport.width}px)`);

      const context = await browser.newContext({
        viewport,
        isMobile: viewport.width < 768,
        hasTouch: viewport.width < 768,
        permissions: ['geolocation'],
        geolocation: COPPELL,
      });
      const page = await context.newPage();

      await sweep(page, `${device} /`, '/');
      await sweep(page, `${device} /about`, '/about');

      // The map and log both gate on location; seed it so the real UI renders.
      await page.goto(`${TARGET_URL}/map`, { waitUntil: 'networkidle' });
      const zip = page.locator('main input[type="text"]').first();
      if (await zip.count()) {
        await zip.fill('75019');
        await page.getByRole('button', { name: /Show stores/i }).click();
        await page.waitForTimeout(4000);
      }
      const mapControls = await page.evaluate(MEASURE);
      const mapOurs = mapControls.filter((c) => !c.thirdParty && !c.exempt && c.height < 44);
      check(
        `${device} /map: every control of ours is at least 44px`,
        mapOurs.length === 0,
        mapOurs.length === 0
          ? `${mapControls.filter((c) => !c.thirdParty && !c.exempt).length} controls checked`
          : mapOurs.map((c) => `"${c.text}" ${c.height}px`).join(', '),
      );

      // Grab a store link while still on the map — /log has none, so looking
      // for one after navigating away silently skipped the store page.
      const href = await page.evaluate(() => {
        const a = document.querySelector('a[href^="/store/"]');
        return a ? a.getAttribute('href') : null;
      });

      await sweep(page, `${device} /log`, '/log');

      if (href) {
        await sweep(page, `${device} /store`, href);
      } else {
        check(`${device} /store: a store page was reachable to sweep`, false,
          'no store link found on the map');
      }

      await context.close();
    }

    console.log('\n================================================================');
    console.log(`Tap targets: ${passed}/${passed + failed} passed`);
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
