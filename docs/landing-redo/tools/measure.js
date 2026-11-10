/**
 * Shared measurement for the landing redo trials, so every direction is judged
 * the same way.
 *
 *   node docs/landing-redo/tools/measure.js <url> <outDir> [--no-trace]
 *
 * Writes into <outDir>:
 *   shot-<width>-<0..4>.png   the viewport at five scroll positions, three widths
 *   metrics.json              load metrics, scroll frame timings, console noise
 *
 * Runs Edge with a window (not headless) so WebGL uses the real GPU. The phone
 * trace is taken under 4x CPU throttling, the usual stand-in for a mid-range
 * handset; treat it as a comparison between directions, not as a field number.
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const [url, outDir] = process.argv.slice(2);
const withTrace = !process.argv.includes('--no-trace');
if (!url || !outDir) {
  console.error('usage: node measure.js <url> <outDir> [--no-trace]');
  process.exit(1);
}

const SIZES = [
  { name: '375', width: 375, height: 812, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  { name: '768', width: 768, height: 1024, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  { name: '1440', width: 1440, height: 900, deviceScaleFactor: 1, isMobile: false, hasTouch: false },
];

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function summarise(deltas) {
  if (deltas.length === 0) return null;
  const sorted = [...deltas].sort((a, b) => a - b);
  const sum = deltas.reduce((a, b) => a + b, 0);
  const at = (q) => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
  return {
    frames: deltas.length,
    avgFps: Math.round((1000 / (sum / deltas.length)) * 10) / 10,
    p50Ms: Math.round(at(0.5) * 10) / 10,
    p95Ms: Math.round(at(0.95) * 10) / 10,
    maxMs: Math.round(sorted[sorted.length - 1] * 10) / 10,
    over33MsPct: Math.round((deltas.filter((d) => d > 33.4).length / deltas.length) * 1000) / 10,
    over50MsPct: Math.round((deltas.filter((d) => d > 50).length / deltas.length) * 1000) / 10,
  };
}

async function open(browser, size, noise) {
  const context = await browser.newContext({
    viewport: { width: size.width, height: size.height },
    deviceScaleFactor: size.deviceScaleFactor,
    isMobile: size.isMobile,
    hasTouch: size.hasTouch,
  });
  const page = await context.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error' || m.type() === 'warning') noise.push(`[${size.name}] ${m.type()}: ${m.text()}`);
  });
  page.on('pageerror', (e) => noise.push(`[${size.name}] pageerror: ${e.message}`));
  await page.addInitScript(() => {
    window.__lcp = 0;
    window.__cls = 0;
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) window.__lcp = entry.startTime;
    }).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) if (!entry.hadRecentInput) window.__cls += entry.value;
    }).observe({ type: 'layout-shift', buffered: true });
  });
  return { context, page };
}

/** Scroll top to bottom with wheel events while recording frame intervals. */
async function trace(page, size, throttle) {
  const client = await page.context().newCDPSession(page);
  if (throttle > 1) await client.send('Emulation.setCPUThrottlingRate', { rate: throttle });
  await page.evaluate(() => window.scrollTo(0, 0));
  await wait(600);
  await page.evaluate(() => {
    window.__frames = [];
    let last = performance.now();
    const tick = (now) => {
      window.__frames.push(now - last);
      last = now;
      window.__raf = requestAnimationFrame(tick);
    };
    window.__raf = requestAnimationFrame(tick);
  });
  const max = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
  // About 1,200 px a second: a deliberate read, not a fling.
  const step = 40;
  await page.mouse.move(size.width / 2, size.height / 2);
  for (let y = 0; y < max; y += step) {
    await page.mouse.wheel(0, step);
    await wait(33);
  }
  await wait(400);
  const deltas = await page.evaluate(() => {
    cancelAnimationFrame(window.__raf);
    return window.__frames.slice(2);
  });
  if (throttle > 1) await client.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  return { throttle, scrollPx: max, ...summarise(deltas) };
}

(async () => {
  fs.mkdirSync(outDir, { recursive: true });
  const noise = [];
  const metrics = { url, at: new Date().toISOString(), sizes: {}, noise };
  const browser = await chromium.launch({ channel: 'msedge', headless: false });
  try {
    for (const size of SIZES) {
      const { context, page } = await open(browser, size, noise);
      await page.goto(url, { waitUntil: 'load', timeout: 60000 });
      await wait(3500);
      const dims = await page.evaluate(() => ({
        scrollHeight: document.documentElement.scrollHeight,
        sideways: document.documentElement.scrollWidth > window.innerWidth + 1,
        canvases: document.querySelectorAll('canvas').length,
        h1: document.querySelectorAll('h1').length,
      }));
      const max = Math.max(0, dims.scrollHeight - size.height);
      for (let i = 0; i < 5; i += 1) {
        await page.evaluate((y) => window.scrollTo(0, y), Math.round((max * i) / 4));
        await wait(1100);
        await page.screenshot({ path: path.join(outDir, `shot-${size.name}-${i}.png`) });
      }
      const load = await page.evaluate(() => ({
        lcpMs: Math.round(window.__lcp),
        cls: Math.round(window.__cls * 10000) / 10000,
      }));
      const entry = { ...dims, ...load };
      if (withTrace && size.name === '375') entry.scroll = await trace(page, size, 4);
      if (withTrace && size.name === '1440') entry.scroll = await trace(page, size, 1);
      metrics.sizes[size.name] = entry;
      await context.close();
    }
  } finally {
    await browser.close();
  }
  fs.writeFileSync(path.join(outDir, 'metrics.json'), JSON.stringify(metrics, null, 2));
  console.log(JSON.stringify(metrics, null, 2));
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
