# Plan: Blender clips for the burger and the soda (Phase D, item 11)

Plan only. Nothing here is installed, exported or wired in yet.

## What changes for the reader

Today the opening shot pulls the burger apart in code. In `world.ts` `update()`, each layer's
height is `base + lift * sin(...)` between beats 0.04 and 0.76. The plan swaps those code-made
numbers for an authored clip, so the layers can tip, settle and overlap like a real sandwich
instead of moving straight up. The soda gets one small clip in the same beat window: the straw
drops into the lid.

The rules don't change:

- **Driven by the beat, never by a clock.** A clip is scrubbed with `mixer.setTime(...)` from the
  beat. It never calls `play()` with time running. Any scroll position draws on its own, and
  nothing loops.
- **One moment per page.** The clips sit inside the existing camera pull-back (beat 0 to 1.1).
  They add no new moment.
- **Reduced motion.** `WorldStory` already pins the beat at 0, so the clip shows its first frame
  (the closed burger, straw up), still.
- **No frames while idle.** `busy()` doesn't change. The clip moves only when the beat moves, and
  the beat already keeps the render loop going.

## The source models

- `public/landing/burger.glb`: Kenney Food Kit 2.0, CC0, 34 KB. Nodes `bun-bottom`, `patty`,
  `salad`, `bun-top`, plus `cheese` and `tomato`, which code hides.
- `public/landing/soda.glb`: Kenney, CC0, 12 KB. One node, so the straw has to be split off in
  Blender.
- Both reference `Textures/colormap.png` (11 KB). Code recolours every part, so the texture is
  fetched and never shown. Exporting from Blender without it saves that request (see "Size
  budget").

## Authoring: a script, not hand animation

The owner doesn't do manual steps, and nobody should keyframe by hand. A Blender Python script
builds the clip from numbers kept in the repo:

- **Script:** `scripts/blender/burger-clip.py`, run headless:
  `blender -b -P scripts/blender/burger-clip.py -- --out public/landing/burger.glb`.
- **Input:** the Kenney source GLBs (already in the repo).
- **Keys:** `scripts/blender/clips.json`. It starts from today's `lift` values (patty 0.08, salad
  0.17, mayo 0.22, top bun 0.30), then adds a few degrees of tilt and a later settle per layer.
  Changing the motion means changing one number and re-running the script.
- **What it does:**
  1. Applies today's per-layer scale tweaks (patty 1.14 × 0.8, salad 1.06 × 1.1) to the mesh
     data, so code no longer has to.
  2. Adds the mayo disc as a real mesh, so code no longer builds a cylinder.
  3. Removes `cheese` and `tomato`.
  4. Splits the soda's straw into its own node.
  5. Keyframes object transforms only: no armature, no shape keys, no morph targets. Each moving
     part gets 4 to 6 keys on translation and rotation, with linear interpolation.
- **Clip length is 1.0 s.** The beat window maps to clip time directly:
  `t = span(beat, 0.04, 0.76) * clip.duration`.
- **Blender** is not installed on this machine. It's a separate download (blender.org,
  installer about 350 MB, GPL; files it exports carry no GPL obligation). The glTF exporter is
  Khronos glTF-Blender-IO, Apache-2.0, bundled with Blender. Installing it is a download, so I'll
  ask before doing it.

## Export format

| Setting | Value | Why |
|---|---|---|
| Format | glTF Binary (`.glb`) | One request per model, like today |
| Up axis | +Y | Matches three |
| Materials | None (or one placeholder) | Code supplies the palette's Lambert materials; no texture fetch |
| Animation | Actions, one per file: `burger-open`, `soda-straw` | The mixer finds each clip by name |
| Sampling | Off ("Always sample animations" unticked); "Optimize animation size" on | Keeps only the authored keys |
| Node names | Kept: `bun-bottom`, `patty`, `salad`, `mayo`, `bun-top`, `cup`, `straw` | Tracks bind by name |
| Compression | None. Optional `gltfpack -kn` for `KHR_mesh_quantization` | No decoder, no WebAssembly, no CSP change (`docs/landing-redo/research.md` §6) |

## Size budget

| File | Today | Budget with clip | Notes |
|---|---|---|---|
| `burger.glb` | 34 KB | ≤ 40 KB | Cheese and tomato removed (about −8 KB of geometry), mayo and keys added (about +3 KB) |
| `soda.glb` | 12 KB | ≤ 16 KB | Straw split off, one short clip |
| `Textures/colormap.png` | 11 KB | 0 KB | No longer referenced, so not fetched |
| **Total** | 57 KB | **≤ 56 KB** | The clips should cost nothing net |

Animation data at this scale is small. Five parts × two channels × six keys × three or four
floats comes to under 2 KB. A clip that blows the budget is a sign that sampling was left on.
The Blender script would print each file's size and exit non-zero over budget.
(`scripts/pack-landing-models.mjs` only prints sizes for `town.bin.gz` today, so it enforces
nothing.)

On the JavaScript side, `AnimationMixer` and `PropertyBinding` are in three's core.
`GLTFLoader` already pulls in the clip and track classes, so the added bundle cost is mostly the
mixer itself. That's an estimate until a build measures it. No new package.

## Where three.js plays them

All of it is in `src/components/landing/world/world.ts`.

1. **`buildSandwich()` (~line 426)** keeps the GLB's node tree instead of rebuilding loose meshes:
   - Scale the root by `unit` rather than baking the scale into the geometry.
   - Swap each mesh's geometry for `smoothPart(...)` and its material for the palette Lambert.
   - Then `const mixer = new AnimationMixer(burger.scene)`,
     `const action = mixer.clipAction(clip)`, and `action.play()` once. With time never
     advanced, nothing moves by itself.
   - It returns `{ group, mixers: [burgerMixer, sodaMixer], clipDuration }` in place of `layers`.
2. **`update(beat, now?)` (~line 1089):** the two lines that compute `open` and set each layer's
   `position.y` become
   `for (const m of sandwich.mixers) m.setTime(span(beat, 0.04, 0.76) * sandwich.clipDuration)`.
   The shadow-dirty check below them (`sandwichBeat !== lastSandwichBeat`) stays as it is.
3. **Warm-up (~line 1160):** `renderer.compile` and the three warm-up frames don't change. The
   clip has no programs or textures of its own.
4. **Fallback:** if a GLB has no clip (an old file, or a failed export), `update()` keeps today's
   `sin` lift. The page never breaks on a missing clip.

## How it would be checked

- `tests/browser/scenes.js` gets one new check. It uses the suite's `scrollToBeat()` to reach
  beats 0, 0.4 and 1.1, then compares canvas pixels in the sandwich's region: 0 and 1.1 match
  (closed), and 0.4 differs (open). The world exposes no positions to the page, and this check
  doesn't add any.
- `motion.js` "nothing requests frames while idle" already covers the no-loop rule.
- A byte check on both files against the budget above.
- Screenshots at 375 and 1440 px of beats 0, 0.4 and 1.1, before and after, side by side.

## If Blender is a no

The same motion can be written as an `AnimationClip` built in code from `clips.json`
(`VectorKeyframeTrack` and `QuaternionKeyframeTrack`). That costs zero bytes on the wire and
needs no Blender. You lose the ability to shape it by eye in Blender later.
