# Assets and downloads for the landing redo

Every third-party file used or downloaded for this work, with its licence.

## Downloads

| File | Source | Size | Licence | Date | Kept at |
|------|--------|------|---------|------|---------|
| `kenney_food-kit.zip` (Food Kit 2.0, 200 models) | https://kenney.nl/assets/food-kit | 4.4 MB | Creative Commons Zero (CC0), per the pack's `License.txt` | 2026-11-10 | `C:\dev\mcdonalds tracker\tools\kenney\food-kit\` (outside the repo) |
| `d3-geo`, `@types/d3-geo` (devDependencies, build script only) | npm registry | small | ISC / MIT | 2026-11-10 | `node_modules` |
| `lighthouse` (run through `npx`, not installed) | npm registry | n/a | Apache-2.0 | 2026-11-10 | npm cache |
| `cloud-firestore-emulator-v1.22.0.jar` (fetched by firebase-tools) | Google, via firebase-tools | about 60 MB | Apache-2.0 | 2026-11-10 | `C:\dev\mcdonalds tracker\tools\firebase-emulators\` |

Not downloaded: City Kit (Commercial, Suburban, Roads), Car Kit, Mini Characters
and Mini Shop from kenney.nl. The site showed its "Thanks for downloading" screen
for each, but no file reached disk; the likely cause is the browser's prompt for
several downloads from one site, which was not answered. The cause was not
confirmed. Buildings, cars and people are drawn in
code instead, in the site's existing clay style.

## Models from Food Kit worth using

All in `Models/GLB format/`, each referencing the shared `Textures/colormap.png`.

| Model | Size | Triangles | Parts |
|-------|------|-----------|-------|
| `burger.glb` | 34 KB | 294 | `bun-bottom`, `bun-top`, `cheese`, `patty`, `salad`, `tomato` as separate nodes |
| `burger-cheese.glb` | 26 KB | 226 | `bun-bottom`, `bun-top`, `cheese`, `patty` |
| `sandwich.glb` | 20 KB | 176 | `lettuce`, `meat`, two `bun` nodes |
| `fries.glb` | 59 KB | 564 | two nodes |
| `soda.glb` | 12 KB | 188 | one node |
| `bag.glb` | 6 KB | 46 | one node |
| `meat-patty.glb`, `cheese-cut.glb`, `tomato-slice.glb`, `salad.glb` | 9 to 17 KB | 104 to 170 | single parts |

## Shipped in the site

| File under `public/` | Origin | Licence | Size |
|----------------------|--------|---------|------|
| `landing/burger.glb` | Kenney Food Kit 2.0, `Models/GLB format/burger.glb`, unmodified (cheese and tomato hidden and the patty retinted in code) | CC0 | 34 KB |
| `landing/Textures/colormap.png` | Kenney Food Kit 2.0, `Models/GLB format/Textures/colormap.png`, unmodified | CC0 | 11 KB |
