# Proposal: the store and price data out of the server bundle (Phase F, item 3)

Not built. The owner chooses an option first.

## What's in the bundle today

`src/lib/stores.server.ts` lines 56–58 import three JSON files at the top of the module. So does
`src/lib/store-list.ts` line 17, for one small file. Every route that touches either module carries
all of them, whether it uses them or not.

| File | Size | Gzipped | Used for |
|---|---|---|---|
| `src/data/feeds/drivethruindex.json` | 3.51 MB | 443 KB | Feed prices recorded when an area syncs (`backfillFeedObservations`) |
| `src/data/us-stores.json` | 1.04 MB | 369 KB | The store list an area sync fills from (`bundledStoresNear`, `listedLocation`, `listedCountNear`) |
| `src/data/restaurant-numbers.json` | 0.48 MB | 181 KB | Restaurant numbers handed out on a sync (`restaurantNumberIndex`) |
| `src/data/us-stores-dti.json` | 12 KB | 6 KB | Stores the list lacks, placed from Drive Thru Index |

Measured in the production build (`.next-build`, Nov 24):

| Server chunk | Size | Of which JSON | Code | Loaded by |
|---|---|---|---|---|
| `chunks/_1wgjpdn._.js` | 4.45 MB | 4.41 MB | 44 KB | `/api/stores` |
| `chunks/_0x3z21b._.js` | 4.45 MB | 4.41 MB | 44 KB | `/api/stores/[id]/{history,recompute,submissions}`, `/api/stores/by-number/[number]` |
| `chunks/_0mmrbd4._.js` | 4.45 MB | 4.41 MB | 44 KB | both share-card images |
| `chunks/_07nnsmy._.js` | 4.45 MB | 4.41 MB | 44 KB | `/api/stores/sync` |
| `chunks/ssr/_0d1ufy1._.js` | 4.24 MB | 3.93 MB | 315 KB | every page: `/`, `/map`, `/store/[id]`, `/about`, `/log`, 404 |

Only the sync path reads the data, through `/api/stores` and `/api/stores/sync`. The pages, the
share cards and the other API routes never touch it. They still parse 4–4.5 MB on every cold start.

## Three ways to move it

### A. Keep it in the deployment, out of the bundle (recommended)

The three imports become lazy loaders, for example
`const rows = await import("@/data/us-stores.json")`, inside the sync code that needs them.
That code is already async. The bundler then puts the JSON in chunks of its own, which load only
the first time a sync runs on a server instance.

- **Effect (estimated from the measurements above):**
  - The page chunk drops from 4.24 MB to about 0.3 MB.
  - The share-card and per-store API chunks drop to about 44 KB.
  - Only a cold sync still loads the data.
- **No new service.** No env var, no Firestore change, no change to how data is refreshed. The
  twice-monthly `dti-refresh.yml` keeps opening a PR with the new snapshot, and the owner keeps
  approving data changes in review.
- **Code:** `stores.server.ts`. `bundledStoresNear` becomes async, so `ListedStoreSource` changes
  type. It has one caller (`api/stores/sync/route.ts`) and the default in `syncAreaIfStale`. `listedLocation` and `listedCountNear`
  take the loaded rows. `BUNDLED_FEEDS` becomes a loader.
- **Limit:** a feed refresh still needs a deploy, as it does today.
- **Possible step two:** split the files per area (geohash-3, about 200 files) so a cold sync loads
  only its own area. That's a build step over the same JSON, and needs no new service either.

### B. Vercel Blob

Upload the files, ideally split per area, as public blobs. The server fetches each with
`fetch(url, { next: { revalidate: 86400 } })`, so the data cache keeps them between requests.

- **Effect:** the same bundle savings as A. Plus, a data refresh could skip the deploy.
- **Needs the owner:**
  - Create a Blob store on the Vercel project.
  - A `BLOB_READ_WRITE_TOKEN` (env var and GitHub secret) so `dti-refresh.yml` can upload.
  - Reading public blobs needs no token.
  - Blob is billed by storage, operations and transfer. I couldn't confirm the Hobby plan's free
    allowance from Vercel's docs, so check `vercel.com/docs/vercel-blob/usage-and-pricing` first.
- **Changes:** a new service, an env var and a CI change. Uploading straight to Blob would also
  drop today's review step, so I'd keep the PR and upload on merge.

### C. Firestore

Store the rows as one document per area per dataset, for example `listedCells/{geohash4}` with a
`rows` array, which keeps each under the 1 MB document limit.

- **Effect:** the same bundle savings. Each sync reads two or three more documents.
- **Costs:**
  - A data-model change and new security rules.
  - A first upload of several thousand writes, then about 5,000 writes a month for the feed
    refreshes. That's on the Spark plan, where the free tier was used up three times in
    October and November.
  - `dti-refresh.yml` would need a service-account key in GitHub secrets to write.
- **Not recommended** while the project is on Spark.

## Recommendation

**A.** It's the smallest change that gets the data out of every route that doesn't use it. It needs
no new service, key or schema, and it keeps the owner's review of each data refresh. If refreshing
without a deploy matters later, B can build on the same loaders.

## Item 4, done alongside: the landing page

- **Change:** `src/app/page.tsx` is now static with hourly revalidation (`revalidate = 3600`),
  replacing `dynamic = "force-dynamic"`.
- **Build output:** `○ /   1h   1y`.
- **Local production server:** `x-nextjs-cache: HIT`,
  `Cache-Control: s-maxage=3600, stale-while-revalidate=31532400`, about 2 ms per response.
- **Chunk sizes:** the same before and after (the table above), because they're almost entirely
  the data in item 3. They only shrink once an option is chosen and built.
- **Build-time reads:** a production build now reads Firestore once to render the page (about
  500 reads). If Firestore can't answer, the Vercel build fails and the live deployment stays
  as it was.
