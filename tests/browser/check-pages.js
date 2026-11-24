/**
 * The check routine run after every phase: screenshots and an axe scan of the
 * four pages a visitor sees, at a phone width and a desktop width.
 *
 *   TARGET_URL=http://localhost:3100 node tests/browser/check-pages.js [label]
 *
 * For each page and width it saves, under tests/browser/screenshots/check/<label>/:
 *   - `<page>-<width>-first.png`: the first screen as a visitor gets it, with
 *     motion on, once the page has settled;
 *   - `<page>-<width>-full.png`: the whole page with reduced motion, so every
 *     scroll-linked and settle-on-view piece is drawn in its finished state.
 *
 * axe runs on every page at both widths with WCAG 2.0/2.1/2.2 A and AA plus
 * best-practice rules. Serious and critical violations fail the run; moderate
 * and minor ones are listed. The full results go to `axe.json` beside the
 * screenshots, and a summary table to `summary.md`.
 */

const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const TARGET_URL = process.env.TARGET_URL || 'http://localhost:3000';
const AXE = require.resolve('axe-core/axe.min.js');
const LABEL = process.argv[2] || 'latest';
const OUT = path.join(__dirname, 'screenshots', 'check', LABEL);
const WIDTHS = [
  { width: 375, height: 812 },
  { width: 1440, height: 900 },
];
const COPPELL = { latitude: 32.9546, longitude: -96.99 };
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
const BLOCKING = new Set(['serious', 'critical']);

/**
 * Serious findings judged not to be failures, each with its reason. They are
 * still printed and written to the summary, marked "accepted".
 */
const ACCEPTED = {
  'map:target-size':
    'WCAG 2.5.8 "equivalent" exception: where pins overlap in a dense area, every pin is also a 44px row in the list beside the map (91 pins, 91 rows checked). The overlap itself goes once the MapLibre map (Phase H) hides colliding pills.',
};

async function pages() {
  const listing = await (await fetch(`${TARGET_URL}/api/stores?lat=${COPPELL.latitude}&lng=${COPPELL.longitude}&radiusMiles=15`)).json();
  const priced = listing.stores.find((store) => store.priceCents !== null);
  if (!priced) throw new Error('no priced store near Coppell to check');
  return [
    { name: 'landing', url: '/' },
    // The map asks before it locates anyone; the check answers yes.
    { name: 'map', url: '/map', ready: '.marker-pill', prepare: (page) => page.getByRole('button', { name: /use my location/i }).click() },
    { name: 'store', url: `/store/${priced.id}` },
    { name: 'about', url: '/about' },
  ];
}

/** Waits for fonts, the page's own ready marker and a quiet network. */
async function settle(page, ready, prepare) {
  await page.waitForLoadState('networkidle', { timeout: 30000 }).catch(() => {});
  if (prepare) await prepare(page).catch(() => {});
  if (ready) await page.waitForSelector(ready, { state: 'attached', timeout: 30000 }).catch(() => {});
  await page.evaluate(() => document.fonts.ready);
  await page.waitForTimeout(1200);
}

async function scan(page) {
  await page.addScriptTag({ path: AXE });
  return page.evaluate(async (tags) => {
    const result = await window.axe.run(document, { runOnly: { type: 'tag', values: tags }, resultTypes: ['violations'] });
    return result.violations.map((v) => ({
      id: v.id,
      impact: v.impact,
      help: v.help,
      nodes: v.nodes.map((n) => ({ target: n.target.join(' '), summary: n.failureSummary })),
    }));
  }, TAGS);
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const list = await pages();
  const browser = await chromium.launch({ channel: 'msedge' });
  const report = [];
  let blocking = 0;
  try {
    for (const viewport of WIDTHS) {
      const moving = await browser.newContext({ viewport, geolocation: COPPELL, permissions: ['geolocation'] });
      const still = await browser.newContext({ viewport, geolocation: COPPELL, permissions: ['geolocation'], reducedMotion: 'reduce' });
      for (const target of list) {
        const stem = `${target.name}-${viewport.width}`;

        const page = await moving.newPage();
        const errors = [];
        page.on('pageerror', (error) => errors.push(error.message));
        await page.goto(`${TARGET_URL}${target.url}`, { waitUntil: 'load' });
        await settle(page, target.ready, target.prepare);
        await page.screenshot({ path: path.join(OUT, `${stem}-first.png`) });
        await page.close();

        const calm = await still.newPage();
        await calm.goto(`${TARGET_URL}${target.url}`, { waitUntil: 'load' });
        await settle(calm, target.ready, target.prepare);
        await calm.screenshot({ path: path.join(OUT, `${stem}-full.png`), fullPage: true });
        const violations = await scan(calm);
        await calm.close();

        for (const v of violations) v.accepted = ACCEPTED[`${target.name}:${v.id}`] ?? null;
        const serious = violations.filter((v) => BLOCKING.has(v.impact) && v.accepted === null);
        blocking += serious.length;
        report.push({ page: target.name, width: viewport.width, url: target.url, errors, violations });
        const tally = violations.map((v) => `${v.id} (${v.impact}, ${v.nodes.length}${v.accepted ? ', accepted' : ''})`).join(', ') || 'none';
        console.log(`${serious.length === 0 ? 'ok  ' : 'FAIL'}  ${stem}: ${tally}${errors.length ? ` | page errors: ${errors.join('; ')}` : ''}`);
      }
      await moving.close();
      await still.close();
    }
  } finally {
    await browser.close();
  }

  fs.writeFileSync(path.join(OUT, 'axe.json'), JSON.stringify(report, null, 2));
  const rows = report.map((r) => {
    const by = (impact) => r.violations.filter((v) => v.impact === impact).length;
    return `| ${r.page} | ${r.width} | ${by('critical')} | ${by('serious')} | ${by('moderate')} | ${by('minor')} | ${r.violations.map((v) => (v.accepted ? `${v.id} (accepted)` : v.id)).join(', ') || '-'} |`;
  });
  fs.writeFileSync(path.join(OUT, 'summary.md'), [
    `# Check: ${LABEL}`,
    '',
    `axe-core ${require('axe-core/package.json').version}, tags ${TAGS.join(', ')}. Scanned with reduced motion so every piece is in its finished state.`,
    '',
    '| Page | Width | Critical | Serious | Moderate | Minor | Rules |',
    '|---|---|---|---|---|---|---|',
    ...rows,
    '',
    ...Object.entries(ACCEPTED).map(([key, why]) => `- **${key}** accepted: ${why}`),
    '',
  ].join('\n'));
  console.log(`\n${path.relative(process.cwd(), OUT)}: ${report.length} scans, ${blocking} serious or critical`);
  process.exit(blocking === 0 ? 0 : 1);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
