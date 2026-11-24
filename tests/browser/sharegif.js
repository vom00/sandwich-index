/**
 * The receipt GIF a visitor can save from a store page.
 *
 * What it promises:
 *   - A priced store offers it; an unpriced one does not.
 *   - The button makes a real GIF, animated (more than one frame), that plays
 *     once (no loop extension) and stays a sensible size.
 *   - The encoding runs in a Web Worker, so the page keeps answering while
 *     it works.
 *   - It finishes on the store's own price.
 *
 * Needs the dev server and the emulator, like the other suites. Writes the
 * GIF and two stills of it to SHOTS for a look.
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const TARGET_URL = process.env.TARGET_URL || 'http://localhost:3000';
const SHOTS = process.env.SHOTS || path.join(__dirname, 'screenshots', 'sharegif');

const results = [];
function check(name, passed, detail = '') {
  results.push({ name, passed, detail });
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? `  [${detail}]` : ''}`);
}

/** Frames, and whether a NETSCAPE loop block is present, read from the bytes. */
function inspectGif(bytes) {
  const header = bytes.toString('ascii', 0, 6);
  let frames = 0;
  for (let i = 0; i < bytes.length - 1; i += 1) if (bytes[i] === 0x21 && bytes[i + 1] === 0xf9) frames += 1;
  return { header, frames, loops: bytes.includes(Buffer.from('NETSCAPE2.0')) };
}

(async () => {
  let browser;
  try {
    fs.mkdirSync(SHOTS, { recursive: true });
    const listing = await (await fetch(`${TARGET_URL}/api/stores?lat=32.9546&lng=-96.99&radiusMiles=15`)).json();
    const priced = listing.stores.find((store) => store.priceCents !== null);
    const unpriced = listing.stores.find((store) => store.priceCents === null);
    check('the emulator has a priced and an unpriced store', Boolean(priced && unpriced));
    if (!priced || !unpriced) throw new Error('no stores to test with');

    browser = await chromium.launch({ channel: 'msedge' });
    const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, acceptDownloads: true });
    const page = await context.newPage();

    await page.goto(`${TARGET_URL}/store/${unpriced.id}`, { waitUntil: 'load' });
    check('an unpriced store offers no GIF', (await page.getByRole('button', { name: /save the receipt as a gif/i }).count()) === 0);

    await page.goto(`${TARGET_URL}/store/${priced.id}`, { waitUntil: 'load' });
    const button = page.getByRole('button', { name: /save the receipt as a gif/i });
    check('a priced store offers the GIF', await button.isVisible());

    const workers = [];
    page.on('worker', (worker) => workers.push(worker.url()));
    const started = Date.now();
    const [download] = await Promise.all([page.waitForEvent('download', { timeout: 30000 }), button.click()]);
    const took = Date.now() - started;
    const file = path.join(SHOTS, download.suggestedFilename());
    await download.saveAs(file);
    const bytes = fs.readFileSync(file);
    const gif = inspectGif(bytes);

    check('the file is a GIF named for the store', gif.header === 'GIF89a' && download.suggestedFilename() === `mcchicken-price-${priced.id}.gif`,
      `${gif.header} ${download.suggestedFilename()}`);
    check('it is animated', gif.frames > 10, `${gif.frames} frames`);
    check('it plays once (no loop extension)', !gif.loops);
    check('it stays under 1.5 MB', bytes.length < 1.5 * 1024 * 1024, `${Math.round(bytes.length / 1024)} KB`);
    check('the encoding ran in a Web Worker', workers.some((url) => /worker/i.test(url)), workers.join(', ') || 'none');
    check('it is ready in under 8 seconds', took < 8000, `${took}ms`);
    check('the page says it was saved', /saved/i.test(await page.getByRole('status').filter({ hasText: /./ }).first().textContent()));

    // A look at it: part way through printing, and the held last frame.
    const still = await context.newPage();
    await still.setViewportSize({ width: 640, height: 640 });
    const src = `data:image/gif;base64,${bytes.toString('base64')}`;
    await still.setContent(`<body style="margin:0;background:#fff"><img src="${src}" width="600" height="600"></body>`);
    await still.waitForTimeout(900);
    await still.screenshot({ path: path.join(SHOTS, 'printing.png'), clip: { x: 0, y: 0, width: 600, height: 600 } });
    await still.waitForTimeout(4500);
    await still.screenshot({ path: path.join(SHOTS, 'finished.png'), clip: { x: 0, y: 0, width: 600, height: 600 } });
    const slip = await still.evaluate(() => {
      const img = document.querySelector('img');
      const canvas = Object.assign(document.createElement('canvas'), { width: 600, height: 600 });
      const context = canvas.getContext('2d');
      context.drawImage(img, 0, 0);
      const at = (x, y) => [...context.getImageData(x, y, 1, 1).data].slice(0, 3).join(',');
      return { slip: at(110, 330), ground: at(20, 20) };
    });
    check('the slip is white and the ground is sunken paper, exactly',
      slip.slip === '255,255,255' && slip.ground === '242,239,232', JSON.stringify(slip));
    const later = await still.screenshot({ clip: { x: 0, y: 0, width: 600, height: 600 } });
    await still.waitForTimeout(2500);
    const latest = await still.screenshot({ clip: { x: 0, y: 0, width: 600, height: 600 } });
    check('it stops on the last frame', later.equals(latest));
  } catch (error) {
    check('suite ran to completion', false, error.message);
    console.error(error);
  } finally {
    await browser?.close();
    const passed = results.filter((r) => r.passed).length;
    console.log(`\n${'='.repeat(64)}`);
    console.log(`Receipt GIF: ${passed}/${results.length} passed`);
    for (const r of results.filter((x) => !x.passed)) console.log(`  - ${r.name}${r.detail ? `  [${r.detail}]` : ''}`);
    console.log('='.repeat(64));
    process.exit(passed === results.length ? 0 : 1);
  }
})();
