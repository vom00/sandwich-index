/**
 * Sandwich Index — Phase 5: the landing page
 *
 * Checks the page against the design brief rather than against itself: the hero
 * number is the live dataset figure, the load sequence is staggered and fully
 * reduced-motion guarded, the three steps are not three identical cards, and
 * none of the explicitly forbidden generic-AI aesthetics are present.
 *
 * Requires: a server on :3000 and the seeded Firestore emulator on :8080.
 */

const { chromium } = require('playwright');
const path = require('path');

const TARGET_URL = process.env.TARGET_URL || 'http://localhost:3000';
const SHOTS = process.env.TEMP || require('os').tmpdir();

const results = [];
function check(name, passed, detail = '') {
  results.push({ name, passed, detail });
  console.log(`${passed ? '  PASS' : '  FAIL'}  ${name}${detail ? `  — ${detail}` : ''}`);
}

async function launchBrowser() {
  for (const channel of ['msedge', 'chrome', undefined]) {
    try {
      const options = { headless: false };
      if (channel) options.channel = channel;
      const browser = await chromium.launch(options);
      console.log(`Browser: ${channel ?? 'bundled chromium'}\n`);
      return browser;
    } catch { /* try next */ }
  }
  throw new Error('No usable browser');
}

const money = (cents) => `$${(cents / 100).toFixed(2)}`;

(async () => {
  const browser = await launchBrowser();

  try {
    // =================================================================
    console.log('1. Hero — the live dataset number');
    // =================================================================
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    const consoleErrors = [];
    const badResponses = [];
    page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
    page.on('pageerror', (e) => consoleErrors.push('pageerror: ' + e.message));
    page.on('response', (r) => { if (r.status() >= 400) badResponses.push(`${r.status()} ${r.url()}`); });

    await page.goto(TARGET_URL, { waitUntil: 'load' });
    await page.waitForLoadState('networkidle');

    // Independent read of the truth, from the API rather than the page.
    const truth = await page.evaluate(async () => {
      const response = await fetch('/api/stores?lat=32.9546&lng=-96.99&radiusMiles=40');
      const body = await response.json();
      const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
      const current = body.stores
        .filter((s) => s.priceCents !== null)
        .filter((s) => s.pricedAt !== null && new Date(s.pricedAt).getTime() > cutoff)
        .sort((a, b) => a.priceCents - b.priceCents);
      return {
        low: current[0]?.priceCents ?? null,
        high: current[current.length - 1]?.priceCents ?? null,
        count: current.length,
      };
    });
    const expectedSpread = truth.high - truth.low;
    console.log(`  (dataset: ${truth.count} current stores, ${money(truth.low)}–${money(truth.high)})`);

    const h1 = page.locator('h1');
    check('exactly one h1', await h1.count() === 1);

    // The hero number counts up on load, so read it once it has settled or the
    // assertion catches a frame partway through the animation.
    await page.waitForFunction(
      (expected) => {
        const el = document.querySelector('.hero-figure');
        return el === null || el.textContent.trim() === expected;
      },
      money(expectedSpread),
      { timeout: 5000 },
    ).catch(() => {});

    const h1Text = (await h1.innerText()).replace(/\s+/g, ' ').trim();
    check('hero number is the real spread, not a placeholder',
      h1Text.startsWith(money(expectedSpread)), `${h1Text.slice(0, 60)} (expected ${money(expectedSpread)})`);
    check('hero states what the number means',
      /separates the cheapest McChicken in the index from the priciest/.test(h1Text));

    const heroSize = await page.locator('.hero-figure').evaluate((el) =>
      parseFloat(getComputedStyle(el).fontSize));
    check('hero number is rendered enormous', heroSize >= 120, `${Math.round(heroSize)}px`);

    // `section:first-of-type` matches once per parent, which picks up the
    // inverted band as well. Scope to the hero explicitly.
    const hero = page.locator('main > div > section').first();

    const endpoints = await hero.locator('.tabular').allInnerTexts();
    check('interval bar shows the two real endpoints',
      endpoints.includes(money(truth.low)) && endpoints.includes(money(truth.high)),
      endpoints.join(' '));

    const ctas = await hero.locator('a').allInnerTexts();
    check('hero offers exactly one call to action', ctas.length === 1, ctas.join(' | '));

    // =================================================================
    console.log('\n2. Live proof — real rows, real links');
    // =================================================================
    const proof = page.locator('section', {
      has: page.getByRole('heading', { name: /ends of the range|What is on file/ }),
    }).first();

    const rows = proof.locator('ol li a');
    const rowCount = await rows.count();
    check('leaderboard renders rows', rowCount >= 3, `${rowCount} rows`);

    const firstRow = (await rows.first().innerText()).replace(/\s+/g, ' ');
    check('cheapest row shows the cheapest real median',
      firstRow.includes(money(truth.low)), firstRow.slice(0, 70));

    const hrefs = await rows.evaluateAll((els) => els.map((e) => e.getAttribute('href')));
    check('every row links to a real store page',
      hrefs.every((h) => /^\/store\/(node|way|relation)-\d+$/.test(h)), hrefs.slice(0, 2).join(' '));

    const probe = await page.evaluate(async (href) => {
      const response = await fetch(href);
      return response.status;
    }, hrefs[0]);
    check('the first linked store page actually resolves', probe === 200, String(probe));

    const rowPrices = await proof.locator('ol li .tabular').allInnerTexts();
    check('every leaderboard figure is formatted currency or a rank',
      // Ranks are padded to two digits and grow a third past 99 stores.
      rowPrices.every((t) => /^(\$\d+\.\d{2}|\d{2,})$/.test(t.trim())),
      rowPrices.filter((t) => !/^(\$\d+\.\d{2}|\d{2,})$/.test(t.trim())).join(', ') || 'all ok');

    // =================================================================
    console.log('\n3. "How it works" is not three identical cards');
    // =================================================================
    const how = page.locator('section', {
      has: page.getByRole('heading', { name: 'How a price gets here' }),
    });
    const stepBoxes = await how.locator('ol > li').evaluateAll((els) =>
      els.map((el) => {
        const r = el.getBoundingClientRect();
        const s = getComputedStyle(el);
        return {
          left: Math.round(r.left),
          width: Math.round(r.width),
          radius: s.borderRadius,
          shadow: s.boxShadow,
        };
      }));

    check('there are three steps', stepBoxes.length === 3, `${stepBoxes.length}`);
    check('each step is offset further than the last',
      stepBoxes[0].left < stepBoxes[1].left && stepBoxes[1].left < stepBoxes[2].left,
      stepBoxes.map((b) => b.left).join(' < '));
    check('each step has a different measure',
      new Set(stepBoxes.map((b) => b.width)).size === 3,
      stepBoxes.map((b) => b.width).join(', '));
    check('steps are not cards — no rounded boxes or drop shadows',
      stepBoxes.every((b) => b.radius === '0px' && b.shadow === 'none'),
      stepBoxes.map((b) => `${b.radius}/${b.shadow}`).join(' | '));

    // =================================================================
    console.log('\n4. Forbidden generic-AI aesthetics');
    // =================================================================
    const fonts = await page.evaluate(() => {
      const first = (el) => getComputedStyle(el).fontFamily.split(',')[0].replace(/["']/g, '').trim();
      return { body: first(document.body), h1: first(document.querySelector('h1')) };
    });
    check('body face is the loaded Plex Sans, not a system stack',
      /Plex.?Sans/i.test(fonts.body), fonts.body);
    check('display face is the loaded Fraunces, not a system stack',
      /Fraunces/i.test(fonts.h1), fonts.h1);
    check('no Inter, Roboto, Arial or system-ui anywhere in the resolved stacks',
      !/\b(Inter|Roboto|Arial|system-ui|-apple-system|Space Grotesk)\b/i.test(
        [fonts.body, fonts.h1].join(' ')),
      [fonts.body, fonts.h1].join(' | '));

    const gradients = await page.evaluate(() =>
      [...document.querySelectorAll('*')]
        .map((el) => getComputedStyle(el).backgroundImage)
        .filter((v) => v.includes('gradient')));
    check('no purple-to-blue gradient', gradients.length === 0, gradients.slice(0, 2).join(' '));

    const emoji = await page.evaluate(() => {
      const text = document.body.innerText;
      const found = text.match(/\p{Extended_Pictographic}/gu);
      return found ? [...new Set(found)] : [];
    });
    check('no emoji used anywhere', emoji.length === 0, emoji.join(' '));

    const centeredHero = await page.locator('h1').evaluate((el) =>
      getComputedStyle(el).textAlign);
    check('hero is not centered', centeredHero !== 'center', centeredHero);

    // =================================================================
    console.log('\n5. Structure and accessibility');
    // =================================================================
    const headings = await page.evaluate(() =>
      [...document.querySelectorAll('h1,h2,h3,h4,h5,h6')]
        .map((h) => Number(h.tagName[1])));
    let skipped = null;
    for (let i = 1; i < headings.length; i += 1) {
      if (headings[i] - headings[i - 1] > 1) { skipped = `h${headings[i - 1]} → h${headings[i]}`; break; }
    }
    check('heading levels never skip', skipped === null, skipped ?? headings.join(''));

    const base = await page.evaluate(() => {
      const s = getComputedStyle(document.body);
      return { size: parseFloat(s.fontSize), lh: parseFloat(s.lineHeight) / parseFloat(s.fontSize) };
    });
    check('base type is 16px at 1.5 line-height',
      base.size === 16 && Math.abs(base.lh - 1.5) < 0.01, `${base.size}px / ${base.lh.toFixed(2)}`);

    const zoomBlocked = await page.evaluate(() => {
      const meta = document.querySelector('meta[name="viewport"]');
      return meta ? /user-scalable\s*=\s*no|maximum-scale\s*=\s*1/.test(meta.content) : false;
    });
    check('zoom is not disabled', !zoomBlocked);

    // Focus rings: walk the page and confirm every stop draws a ring 2px+.
    await page.evaluate(() => window.scrollTo(0, 0));
    const ringFailures = [];
    for (let i = 0; i < 14; i += 1) {
      await page.keyboard.press('Tab');
      const ring = await page.evaluate(() => {
        const el = document.activeElement;
        if (el === null || el === document.body) return null;
        const s = getComputedStyle(el);
        return {
          label: (el.textContent || '').trim().slice(0, 26),
          width: parseFloat(s.outlineWidth),
          style: s.outlineStyle,
          color: s.outlineColor,
        };
      });
      if (ring === null) break;
      if (ring.width < 2 || ring.style === 'none') {
        ringFailures.push(`${ring.label}: ${ring.width}px ${ring.style}`);
      }
    }
    check('every focus stop draws a 2px+ ring', ringFailures.length === 0,
      ringFailures.slice(0, 3).join(' | '));

    const inkRing = await page.evaluate(() => {
      const band = document.querySelector('.on-ink');
      const link = band.querySelector('a');
      link.focus();
      return getComputedStyle(link).outlineColor;
    });
    check('focus ring inside the inverted band is light, not the dark blue',
      inkRing !== 'rgb(18, 57, 94)', inkRing);

    const smallTargets = await page.evaluate(() =>
      [...document.querySelectorAll('a, button')]
        .filter((el) => el.getBoundingClientRect().height > 0)
        // WCAG 2.5.8 exempts inline targets — a link inside a sentence is
        // sized by the prose around it and cannot be enlarged without
        // wrecking the line. Anything standing on its own is not exempt.
        .filter((el) => {
          const parent = el.parentElement;
          if (parent === null) return true;
          const own = (el.textContent || '').trim();
          const surrounding = (parent.textContent || '').trim();
          return own === surrounding;
        })
        .filter((el) => el.getBoundingClientRect().height < 44)
        .map((el) => `${(el.textContent || '').trim().slice(0, 22)}:${Math.round(el.getBoundingClientRect().height)}px`));
    check('every standalone link and button clears 44px', smallTargets.length === 0,
      smallTargets.join(', '));

    check('OpenStreetMap credited', /OpenStreetMap/.test(await page.locator('footer').innerText()));
    check('non-affiliation disclaimer present',
      /not affiliated with, endorsed by, or sponsored by/.test(await page.locator('footer').innerText()));

    check('no console errors', consoleErrors.length === 0, consoleErrors.slice(0, 2).join(' | '));
    check('no failed requests', badResponses.length === 0, badResponses.slice(0, 2).join(' | '));

    await page.screenshot({ path: path.join(SHOTS, 'phase5-landing-desktop.png'), fullPage: true });
    await context.close();

    // =================================================================
    console.log('\n6. Load sequence — staggered, and guarded');
    // =================================================================
    const animContext = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      reducedMotion: 'no-preference',
    });
    const animPage = await animContext.newPage();

    // Record every frame rather than polling for them. A 25ms sample interval
    // cannot reliably catch the opening $0.00, and "we did not see it" is not
    // the same finding as "it was not there".
    await animPage.addInitScript(() => {
      window.__heroFrames = [];
      const attach = () => {
        const el = document.querySelector('.hero-figure');
        if (el === null) {
          requestAnimationFrame(attach);
          return;
        }
        window.__heroFrames.push(el.textContent.trim());
        new MutationObserver(() => window.__heroFrames.push(el.textContent.trim()))
          .observe(el, { childList: true, characterData: true, subtree: true });
      };
      attach();
    });

    await animPage.goto(TARGET_URL, { waitUntil: 'load' });
    await animPage.waitForTimeout(1400);
    const samples = await animPage.evaluate(() => window.__heroFrames ?? []);
    const distinct = [...new Set(samples)];
    check('hero number counts up rather than appearing',
      distinct.length > 3, `${distinct.length} distinct values, e.g. ${distinct.slice(0, 4).join(' → ')}`);
    // The first sample is the server-rendered figure — correct with no JS at
    // all — and hydration then resets it to zero to run the count.
    check('the count starts at zero and lands on the real figure',
      distinct.includes('$0.00') && samples[samples.length - 1] === money(expectedSpread),
      `${distinct.slice(0, 3).join(' → ')} … ${samples[samples.length - 1]}`);
    check('no frame of the count-up shows a negative price',
      !samples.some((s) => s.startsWith('-')),
      samples.filter((s) => s.startsWith('-')).slice(0, 3).join(' '));

    await animPage.waitForLoadState('networkidle');
    const stagger = await animPage.evaluate(() =>
      [...document.querySelectorAll('.reveal')].map((el) => {
        const s = getComputedStyle(el);
        return { name: s.animationName, delay: s.animationDelay, duration: s.animationDuration };
      }));
    check('reveal elements share one keyframe animation',
      stagger.length >= 4 && stagger.every((s) => s.name === 'rise'),
      `${stagger.length} elements`);
    check('reveals are staggered by animation-delay',
      new Set(stagger.map((s) => s.delay)).size > 1,
      stagger.map((s) => s.delay).join(' '));
    check('no reveal exceeds the 600ms hero budget',
      stagger.every((s) => parseFloat(s.duration) <= 0.6),
      [...new Set(stagger.map((s) => s.duration))].join(' '));

    // Tabular figures: the count-up must not resize its own box.
    const widths = await animPage.evaluate(async () => {
      const el = document.querySelector('.hero-figure');
      const seen = new Set();
      for (let i = 0; i < 10; i += 1) {
        seen.add(Math.round(el.getBoundingClientRect().width));
        await new Promise((r) => setTimeout(r, 20));
      }
      return [...seen];
    });
    check('hero figure keeps a constant width while counting',
      widths.length === 1, widths.join(', '));
    await animContext.close();

    // =================================================================
    console.log('\n7. prefers-reduced-motion: reduce');
    // =================================================================
    const stillContext = await browser.newContext({
      viewport: { width: 1440, height: 1000 },
      reducedMotion: 'reduce',
    });
    const stillPage = await stillContext.newPage();
    const stillErrors = [];
    stillPage.on('pageerror', (e) => stillErrors.push(e.message));

    const stillSamples = [];
    await stillPage.goto(TARGET_URL, { waitUntil: 'commit' });
    for (let i = 0; i < 20; i += 1) {
      const value = await stillPage.evaluate(() => {
        const el = document.querySelector('.hero-figure');
        return el ? el.textContent.trim() : null;
      }).catch(() => null);
      if (value !== null) stillSamples.push(value);
      await stillPage.waitForTimeout(25);
    }
    check('hero number does not count up under reduced motion',
      new Set(stillSamples).size === 1 && stillSamples[0] === money(expectedSpread),
      [...new Set(stillSamples)].join(' → '));

    await stillPage.waitForLoadState('networkidle');
    const stillReveals = await stillPage.evaluate(() =>
      [...document.querySelectorAll('.reveal')].map((el) => {
        const s = getComputedStyle(el);
        return { name: s.animationName, opacity: s.opacity, transform: s.transform };
      }));
    check('reveal animation is removed, not shortened',
      stillReveals.every((s) => s.name === 'none'),
      [...new Set(stillReveals.map((s) => s.name))].join(' '));
    check('nothing is left stranded invisible or displaced',
      stillReveals.every((s) => s.opacity === '1' &&
        (s.transform === 'none' || s.transform === 'matrix(1, 0, 0, 1, 0, 0)')),
      stillReveals.filter((s) => s.opacity !== '1').length + ' invisible');
    check('no page errors under reduced motion', stillErrors.length === 0,
      stillErrors.slice(0, 2).join(' | '));
    await stillContext.close();

    // =================================================================
    console.log('\n8. Responsive — 375, 768, 1440');
    // =================================================================
    for (const [label, width, height] of [['mobile', 375, 812], ['tablet', 768, 1024], ['desktop', 1440, 1000]]) {
      const sizeContext = await browser.newContext({
        viewport: { width, height },
        isMobile: width < 768,
        hasTouch: width < 768,
      });
      const sizePage = await sizeContext.newPage();
      await sizePage.goto(TARGET_URL, { waitUntil: 'load' });
      await sizePage.waitForLoadState('networkidle');

      const overflow = await sizePage.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth);
      check(`no horizontal scroll at ${width}px (${label})`, overflow <= 0, `${overflow}px`);

      const heroFits = await sizePage.evaluate(() => {
        const el = document.querySelector('.hero-figure');
        return el === null || el.getBoundingClientRect().right <= window.innerWidth + 1;
      });
      check(`hero number fits the ${label} viewport`, heroFits);

      // Cumulative layout shift over the load sequence.
      const cls = await sizePage.evaluate(() => new Promise((resolve) => {
        let total = 0;
        const observer = new PerformanceObserver((list) => {
          for (const entry of list.getEntries()) {
            if (!entry.hadRecentInput) total += entry.value;
          }
        });
        observer.observe({ type: 'layout-shift', buffered: true });
        setTimeout(() => { observer.disconnect(); resolve(total); }, 1500);
      }));
      check(`layout shift stays under 0.1 at ${width}px`, cls < 0.1, cls.toFixed(4));

      if (label !== 'tablet') {
        await sizePage.screenshot({
          path: path.join(SHOTS, `phase5-landing-${label}.png`),
          fullPage: true,
        });
      }
      await sizeContext.close();
    }

  } catch (error) {
    check('suite ran to completion', false, error.message);
    console.error(error);
  } finally {
    await browser.close();

    const passed = results.filter((r) => r.passed).length;
    console.log(`\n${'='.repeat(64)}`);
    console.log(`Phase 5: ${passed}/${results.length} passed`);
    if (passed !== results.length) {
      console.log('\nFailures:');
      for (const r of results.filter((x) => !x.passed)) {
        console.log(`  - ${r.name}${r.detail ? `  [${r.detail}]` : ''}`);
      }
    }
    console.log(`Screenshots in ${SHOTS}`);
    console.log('='.repeat(64));
    process.exit(passed === results.length ? 0 : 1);
  }
})();
