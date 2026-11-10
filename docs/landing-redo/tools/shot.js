/**
 * One screenshot of one URL.
 *
 *   node docs/landing-redo/tools/shot.js <url> <out.png> [width] [height] [scrollY] [--full]
 */
const { chromium } = require('playwright');

const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
const full = process.argv.includes('--full');
const [url, out, width = '1440', height = '900', scrollY = '0'] = args;

(async () => {
  const browser = await chromium.launch({ channel: 'msedge', headless: false });
  const page = await browser.newPage({ viewport: { width: Number(width), height: Number(height) } });
  await page.goto(url, { waitUntil: 'load', timeout: 60000 });
  await page.waitForTimeout(2500);
  if (Number(scrollY) > 0) {
    await page.evaluate((y) => window.scrollTo(0, y), Number(scrollY));
    await page.waitForTimeout(1200);
  }
  await page.screenshot({ path: out, fullPage: full });
  await browser.close();
  console.log('wrote', out);
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
