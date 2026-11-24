# Plan: monthly price-map video for X, made with Remotion (Phase D, item 12)

Plan only. Remotion is not installed, and nothing here is wired up.

## The video

| | |
|---|---|
| Length | 24 to 28 s, depending on which scenes have data |
| Size | 1080 × 1350 (4:5). X shows it full width on a phone, and the US map fits with room for type |
| Frame rate | 30 fps |
| File | H.264 MP4, no audio track, about 4 to 8 MB. X's limits are 512 MB and 2 min 20 s |
| Look | Paper `#fbfaf7` ground, ink type, tier colours only on dots and pills, IBM Plex Mono and the site's display face. No logos, arches, red or yellow |
| Loop | X loops short videos by itself, so the last 3 s hold a still end card. A restart then reads as a cut, not as motion stopping halfway |

## Scenes

Frame numbers are at 30 fps. Each scene is a `<Sequence>`, and every movement is a pure function
of the frame (`useCurrentFrame()` plus `interpolate`). That's the same rule the site follows:
nothing depends on how fast it plays.

| # | Frames | Scene | Data | Motion (site timings reused) |
|---|---|---|---|---|
| 1 | 0–60 | **Title.** "The McChicken index", then "November 2026" on split-flap tiles | Month | `components/landing/world/splitflap.ts` `planFlip`/`flipAt`, driven by frame time (75 ms per flap, 30 ms between columns) |
| 2 | 60–270 | **The country.** Every priced store as a dot, coloured by national tier. The map fills from the cheapest dots to the dearest | `src/data/landing/price-map.json` points `[x, y, cents, count]` and its p10/p90 | Dots fade in by price rank over 4 s with `--ease-out-quart`; the map holds still for the last 2 s |
| 3 | 270–450 | **Cheapest and priciest states.** Two pills over the map with the state name and its median | Data story JSON (below): `states.cheapest`, `states.priciest` | Pills rise 12 px over 600 ms (the `.reveal` rise); the figures roll on odometer wheels (1100 ms per wheel, 70 ms stagger, `--ease-out-expo`) |
| 4 | 450–630 | **Biggest movers.** Up to three stores, old price → new price | `movers[]` | Old price struck through, new one rolls in |
| 5 | 630–720 | **Confirmed this month.** "N prices confirmed by visitors" | `confirmed.count` | One odometer roll |
| 6 | 720–840 | **End card** (held still). Site host, "Every price has a source", and a source line naming the feeds and dates | `source` | None. It holds |

A scene with no data is left out, never filled in. `calculateMetadata()` reads the month's JSON,
drops any scene whose field is `null`, and works out `durationInFrames` from what's left. The
render log lists what was dropped. That's the same rule as the data story page in Phase G: never
invent a figure.

## Data: one file per month, shared with the data story page

The Phase G item 7 script (`scripts/build-monthly-story.ts`) writes
`src/data/monthly/<yyyy-mm>.json`. The data story page and this video both read that file, so
the page and the video can't disagree. The shape is `MonthlyStory` in `src/lib/monthly-story.ts`,
built in Phase G. It changed from this plan's first draft in three ways:

- **A state tie is kept whole.** `cheapest` and `priciest` each have one median and every state at
  it. November 2026's priciest is a three-way tie, so scene 3 shows all three names on one pill.
- **Movers carry their context.** There's how many stores were compared, how many went up and
  down, and how many share the largest change (`tiedAtTop`), so a tie is never hidden.
- **`missing` gives a reason for each blank field.** `calculateMetadata` drops a scene when its
  field is null, as planned. The price map comes straight from `price-map.json`, which the story
  no longer points to.

## Where it lives

- **A folder of its own, `video/`, with its own `package.json`.** Remotion and its renderer stay
  out of the site's `node_modules`, its lockfile and the Vercel build.
- **Shared code** comes in by relative import: the pure modules (`components/landing/world/splitflap.ts`,
  `lib/money.ts`, `lib/landing-map.ts`'s `priceTier`, the colour tokens). Nothing that touches
  Firestore or `server-only`.
- **Fonts** load from the site's own font files through `@remotion/fonts` and `staticFile()`.
  Not `@remotion/google-fonts`, which unpacks to 52 MB.
- **Entry:** `video/src/Root.tsx` registers one `<Composition id="MonthlyPriceMap">`. Its props
  are the month string, and `calculateMetadata` loads the JSON.

## Rendering and posting

- **Render:** `npx remotion render MonthlyPriceMap out/2026-11.mp4 --props='{"month":"2026-11"}'`
  on this machine. The first render downloads Remotion's Chrome Headless Shell. That's a
  download, so I'd state its size and ask first.
- **Not Remotion Lambda.** It runs on the owner's AWS account and costs money.
- **Running it monthly** without the owner touching it means a scheduled job, such as a GitHub
  Actions cron on the 1st. That's a deploy and CI change, and on a private repo it uses Actions
  minutes, so it's an ask.
- **Posting to X** needs an X developer account and API keys, or a person. Either way it's the
  owner's account, so it's outside this plan and an ask. Until then the render produces a file
  and stops.

## Packages (none installed; sizes from the npm registry, 4.0.546)

| Package | Unpacked | License | Needed for |
|---|---|---|---|
| `remotion` | 2.2 MB | Remotion License | Compositions, `Sequence`, `interpolate` |
| `@remotion/cli` | 0.6 MB | Remotion License | `remotion render` and the preview studio |
| `@remotion/renderer` | 3.1 MB | Remotion License | Rendering (pulled in by the CLI) |
| `@remotion/compositor-win32-x64-msvc` | 29.8 MB | Remotion License | Platform binary the renderer installs (Linux: 27.2 MB) |
| `@remotion/bundler` | 0.3 MB | Remotion License | Bundles the composition (webpack-based) |
| `@remotion/fonts` | 11 KB | MIT | Local font loading |
| Chrome Headless Shell | download at first render | Chromium licenses | Not measured; ask before downloading |

**License note.** Remotion is source-available, not open source. As I understand its license
page, it's free for individuals and for companies of up to three people; larger companies need a
paid company license. Sandwich Index is one person's project, so it should fall in the free tier.
Check remotion.dev/license before installing, because it can change.

**Remotion skills.** The official agent skills (`remotion-dev/skills`) are on the allowed list.
They'd be added when this moves from plan to build, not now.
