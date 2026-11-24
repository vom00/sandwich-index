/**
 * Sharing and search: what a link preview and a crawler get.
 *
 * What it promises:
 *   - A store page's Open Graph and Twitter tags name that store (not the
 *     site), and point at an absolute 1200x630 PNG share card.
 *   - The card renders for a priced and an unpriced store, and a bad or
 *     unknown store id gets a 404, not a card.
 *   - Other pages keep their own titles and the site name; the landing page
 *     and pages without a card of their own share the price spread's card.
 *   - The sitemap lists the fixed pages, each once, under the site's own
 *     origin, and no store pages yet.
 *
 * Plain HTTP, no browser. Needs `npm run dev` and the emulator, like the
 * other suites.
 */

const TARGET_URL = process.env.TARGET_URL || 'http://localhost:3000';
// The origin the build names itself by (NEXT_PUBLIC_SITE_URL, baked in at
// build time), which need not be the port a local copy is served on.
const SITE_URL = (process.env.SITE_URL || TARGET_URL).replace(/\/$/, '');

const results = [];
function check(name, passed, detail = '') {
  results.push({ name, passed, detail });
  console.log(`${passed ? 'PASS' : 'FAIL'}  ${name}${detail ? `  [${detail}]` : ''}`);
}

/** Every <meta property|name=... content=...> in the page, keyed by its property or name. */
function metaTags(html) {
  const tags = {};
  for (const [, key, content] of html.matchAll(/<meta (?:property|name)="([^"]+)" content="([^"]*)"/g)) {
    tags[key] = content.replace(/&#x27;/g, "'").replace(/&amp;/g, '&');
  }
  return tags;
}

/** The PNG's own width and height, from its header. */
function pngSize(bytes) {
  const view = Buffer.from(bytes);
  if (view.toString('ascii', 1, 4) !== 'PNG') return null;
  return { width: view.readUInt32BE(16), height: view.readUInt32BE(20) };
}

async function storesNear(lat, lng) {
  const response = await fetch(`${TARGET_URL}/api/stores?lat=${lat}&lng=${lng}&radiusMiles=15`);
  return (await response.json()).stores ?? [];
}

(async () => {
  try {
    const stores = await storesNear(32.9546, -96.99);
    const priced = stores.find((store) => store.priceCents !== null && store.address !== null);
    const unpriced = stores.find((store) => store.priceCents === null);
    check('the emulator has a priced and an unpriced store to share', Boolean(priced && unpriced),
      `${stores.length} stores nearby`);
    if (!priced || !unpriced) throw new Error('no stores to test with');

    // ---------------------------------------------------------------
    console.log('\nStore page tags');
    // ---------------------------------------------------------------
    const tags = metaTags(await (await fetch(`${TARGET_URL}/store/${priced.id}`)).text());
    check('og:title names the store', (tags['og:title'] ?? '').startsWith(priced.address), tags['og:title']);
    check('og:description gives its price', (tags['og:description'] ?? '').includes(`$${(priced.priceCents / 100).toFixed(2)}`),
      tags['og:description']);
    check('og:site_name is the site', tags['og:site_name'] === 'Sandwich Index');
    check('og:type is website', tags['og:type'] === 'website');
    const image = tags['og:image'] ?? '';
    check('og:image is the store\'s own card, as an absolute URL',
      image.startsWith(`${SITE_URL}/store/${priced.id}/opengraph-image`), image);
    check('og:image is declared 1200x630 PNG with alt text',
      tags['og:image:width'] === '1200' && tags['og:image:height'] === '630' &&
      tags['og:image:type'] === 'image/png' && (tags['og:image:alt'] ?? '').length > 20);
    check('twitter:card is a large image', tags['twitter:card'] === 'summary_large_image');
    check('twitter:title and twitter:image match Open Graph',
      tags['twitter:title'] === tags['og:title'] && tags['twitter:image'] === image);

    // ---------------------------------------------------------------
    console.log('\nShare card');
    // ---------------------------------------------------------------
    for (const [label, store] of [['priced', priced], ['unpriced', unpriced]]) {
      const response = await fetch(`${TARGET_URL}/store/${store.id}/opengraph-image`);
      const size = response.ok ? pngSize(await response.arrayBuffer()) : null;
      check(`the ${label} store's card is a 1200x630 PNG`,
        response.status === 200 && response.headers.get('content-type') === 'image/png' &&
        size?.width === 1200 && size?.height === 630,
        `${response.status} ${response.headers.get('content-type')} ${size ? `${size.width}x${size.height}` : ''}`);
    }
    for (const id of ['node-1', 'not-a-store']) {
      const response = await fetch(`${TARGET_URL}/store/${id}/opengraph-image`);
      check(`no card for ${id}`, response.status === 404, `${response.status}`);
    }

    // ---------------------------------------------------------------
    console.log('\nSpread card');
    // ---------------------------------------------------------------
    {
      const home = metaTags(await (await fetch(`${TARGET_URL}/`)).text());
      const spreadImage = home['og:image'] ?? '';
      check('the landing page shares the spread card, as an absolute URL',
        spreadImage.startsWith(`${SITE_URL}/opengraph-image`), spreadImage);
      check('the spread card is declared 1200x630 PNG with alt text',
        home['og:image:width'] === '1200' && home['og:image:height'] === '630' &&
        home['og:image:type'] === 'image/png' && /cheapest and the priciest/.test(home['og:image:alt'] ?? ''));
      const map = metaTags(await (await fetch(`${TARGET_URL}/map`)).text());
      check('a page without a card of its own shares the spread card', map['og:image'] === spreadImage, map['og:image']);
      check('a store page keeps its own card', image !== spreadImage && image.includes('/store/'));
      const response = await fetch(`${TARGET_URL}/opengraph-image`);
      const size = response.ok ? pngSize(await response.arrayBuffer()) : null;
      check('the spread card is a 1200x630 PNG',
        response.status === 200 && response.headers.get('content-type') === 'image/png' &&
        size?.width === 1200 && size?.height === 630,
        `${response.status} ${size ? `${size.width}x${size.height}` : ''}`);
      const cache = response.headers.get('cache-control') ?? '';
      check('the spread card is cached for an hour, not marked immutable',
        /max-age=3600/.test(cache) && !/immutable/.test(cache), cache);
    }

    // ---------------------------------------------------------------
    console.log('\nOther pages');
    // ---------------------------------------------------------------
    for (const path of ['/', '/about']) {
      const page = metaTags(await (await fetch(`${TARGET_URL}${path}`)).text());
      check(`${path} keeps its own og:title`, (page['og:title'] ?? '').length > 0 && page['og:title'] !== tags['og:title'],
        page['og:title']);
      check(`${path} names the site`, page['og:site_name'] === 'Sandwich Index');
    }

    // ---------------------------------------------------------------
    console.log('\nSitemap');
    // ---------------------------------------------------------------
    const xml = await (await fetch(`${TARGET_URL}/sitemap.xml`)).text();
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
    for (const path of ['/', '/map', '/log', '/about']) {
      check(`the sitemap lists ${path}`, locs.includes(`${SITE_URL}${path}`));
    }
    // Store pages are held back until a full crawl's reads are paid for
    // (src/app/sitemap.ts; the listing version is on sitemap-all-stores).
    check('the sitemap does not list store pages yet', !locs.some((loc) => loc.includes('/store/')));
    check('every URL is listed once', new Set(locs).size === locs.length, `${locs.length - new Set(locs).size} repeats`);
    check('every URL is under the site\'s origin', locs.length > 0 && locs.every((loc) => loc.startsWith(`${SITE_URL}/`)));
  } catch (error) {
    check('suite ran to completion', false, error.message);
    console.error(error);
  } finally {
    const passed = results.filter((r) => r.passed).length;
    console.log(`\n${'='.repeat(64)}`);
    console.log(`Sharing: ${passed}/${results.length} passed`);
    for (const r of results.filter((x) => !x.passed)) console.log(`  - ${r.name}${r.detail ? `  [${r.detail}]` : ''}`);
    console.log('='.repeat(64));
    process.exit(passed === results.length ? 0 : 1);
  }
})();
