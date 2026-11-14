# Assets and downloads for the landing redo

Every third-party file used or downloaded for this work, with its licence.

## Downloads

| File | Source | Size | Licence | Date | Kept at |
|------|--------|------|---------|------|---------|
| `kenney_food-kit.zip` (Food Kit 2.0, 200 models) | https://kenney.nl/assets/food-kit | 4.4 MB | Creative Commons Zero (CC0), per the pack's `License.txt` | 2026-11-10 | `C:\dev\mcdonalds tracker\tools\kenney\food-kit\` (outside the repo) |
| `d3-geo`, `@types/d3-geo` (devDependencies, build script only) | npm registry | small | ISC / MIT | 2026-11-10 | `node_modules` |
| `lighthouse` (run through `npx`, not installed) | npm registry | n/a | Apache-2.0 | 2026-11-10 | npm cache |
| `cloud-firestore-emulator-v1.22.0.jar` (fetched by firebase-tools) | Google, via firebase-tools | about 60 MB | Apache-2.0 | 2026-11-10 | `C:\dev\mcdonalds tracker\tools\firebase-emulators\` |
| `kenney_mini-shop_2.1.zip` (Mini Shop 2.1) | https://kenney.nl/assets/mini-shop | 3.5 MB | Creative Commons Zero (CC0), per the pack's `License.txt` | 2026-11-14 | `C:\dev\mcdonalds tracker\tools\kenney\mini-shop\` (outside the repo) |
| `kenney_city-kit-suburban_20.zip` (City Kit Suburban 2.0) | https://kenney.nl/assets/city-kit-suburban | 2.9 MB | CC0, per `License.txt` | 2026-11-14 | `...\tools\kenney\city-kit-suburban\` |
| `kenney_city-kit-roads.zip` (City Kit Roads) | https://kenney.nl/assets/city-kit-roads | 2.7 MB | CC0, per `License.txt` | 2026-11-14 | `...\tools\kenney\city-kit-roads\` |
| `kenney_car-kit.zip` (Car Kit) | https://kenney.nl/assets/car-kit | 4.6 MB | CC0, per `License.txt` | 2026-11-14 | `...\tools\kenney\car-kit\` |
| `kenney_mini-characters.zip` (Mini Characters; looked at, not used) | https://kenney.nl/assets/mini-characters | 3.8 MB | CC0, per `License.txt` | 2026-11-14 | `...\tools\kenney\mini-characters\` |
| `kenney_city-kit-commercial_2.1.zip` (City Kit Commercial 2.1; looked at, not used) | https://kenney.nl/assets/city-kit-commercial | 3.9 MB | CC0, per `License.txt` | 2026-11-14 | `...\tools\kenney\city-kit-commercial\` |

The first attempt at the six Kenney kits (2026-11-10) left no files on disk;
they were downloaded again one at a time on 2026-11-14. Each zip is kept unpacked
beside it. The cashier is Mini Shop's employee and the restaurants are built from
Mini Shop walls, so Mini Characters and City Kit Commercial are not used.

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
| `landing/soda.glb` | Kenney Food Kit 2.0, `Models/GLB format/soda.glb`, unmodified (the cup on the tray in the opening shot; shares `colormap.png`) | CC0 | 12 KB |
| `landing/town.bin.gz` | Built by `scripts/pack-landing-models.mjs` from 19 Kenney models. Mini Shop: `wall`, `wall-window`, `wall-door-rotate`, `cash-register` (top only), `freezers-standing`, `character-employee` (idle pose). City Kit Suburban: `building-type-a`, `-c`, `-g`, `-h`, `tree-large`, `tree-small`. Car Kit: `sedan`, `hatchback-sports`, `suv`, `van`. City Kit Roads: `road-straight`, `road-driveway-single`, `light-curved`. Modified: textures dropped, colours moved onto the site's palette plus street colours (no red or yellow), positions quantised, gzipped. Rebuild with `node scripts/pack-landing-models.mjs`. | CC0 | 126 KB |
