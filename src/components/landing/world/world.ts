/**
 * The landing world: one world, one camera.
 *
 * A single three.js scene holds everything the story visits: a sandwich on a
 * tray, the counter and price board behind it, the restaurant around them, a
 * street of restaurants, and the national dot map. The walls, fittings,
 * cashier, houses, trees, cars, road and street lights are Kenney models (CC0),
 * packed onto the site's palette by scripts/pack-landing-models.mjs. One camera moves through it
 * as a pure function of a "beat" number (0 = macro sandwich, 5 = map settled
 * to one side), so any scroll position can be drawn on its own and nothing
 * depends on how fast the reader scrolled.
 *
 * Budget decisions, all for phones:
 * - Static geometry is baked into a few vertex-coloured meshes (one draw call
 *   for the whole interior, one for the street, one for the other buildings,
 *   one for 3,862 map columns). About 18 draw calls at most.
 * - Matte Lambert materials, no physically based shading.
 * - Shadows are faked with soft blobs everywhere. The only real shadow is the
 *   sandwich on its tray, from a tiny shadow camera that re-renders only while
 *   the sandwich moves, and the quality tier can switch it off.
 * - The map's reveal is done in the vertex shader, so it costs no CPU per frame.
 */

import {
  AmbientLight,
  BoxGeometry,
  BufferAttribute,
  BufferGeometry,
  CanvasTexture,
  Color,
  CylinderGeometry,
  DirectionalLight,
  Group,
  HemisphereLight,
  InstancedMesh,
  Material,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  MeshLambertMaterial,
  Object3D,
  PCFShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  Quaternion,
  Scene,
  SRGBColorSpace,
  Texture,
  Vector3,
  WebGLRenderer,
} from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { mergeGeometries, mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";

import { loadParts, type Parts } from "./parts";
import { flipAt, planFlip, stillColumns, textAt, type FlapFrame, type Flip } from "./splitflap";
import { loadPriceMap, priceTier, type PriceMap, type PriceMapScale } from "@/lib/landing-map";
import { formatCents } from "@/lib/money";

/* -------------------------------------------------------------------------- */
/* Palette: the site's tokens where they exist, muted everyday colours where not. */

const C = {
  paper: "#fbfaf7",
  ground: "#ece7dc",
  groundEdge: "#ddd6c8",
  floor: "#d8d0bf",
  roof: "#d2cab9",
  roofTrim: "#bdb3a0",
  canopy: "#5b6470",
  counter: "#b49c7e",
  counterTop: "#f4f1ea",
  steel: "#8e8a7e",
  steelDark: "#77736a",
  steelLight: "#aeb4b8",
  tile: "#9fcfc6",
  lawn: "#b5d59a",
  charcoal: "#3b3a34",
  lot: "#e2dbcc",
  tray: "#5b6470",
  liner: "#f4f1ea",
  bunTop: "#c98d52",
  bunBottom: "#d6a46e",
  patty: "#b07433",
  lettuce: "#93b866",
  mayo: "#f2ecdc",
  cup: "#e9e5dc",
  tierLow: "#0f5c55",
  tierMid: "#8a5a12",
  tierHigh: "#7b2d3b",
  tierNone: "#c9c1b0",
  ink: "#15140f",
  board: "#23221e",
  blob: "#3b3424",
} as const;

const TIER_COLOR = { low: C.tierLow, mid: C.tierMid, high: C.tierHigh, none: C.tierNone } as const;

/* -------------------------------------------------------------------------- */
/* Small maths.                                                                 */

const clamp01 = (v: number) => Math.min(1, Math.max(0, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smooth = (t: number) => t * t * (3 - 2 * t);
/** 0→1 across [from, to], eased in and out, flat outside. */
const span = (t: number, from: number, to: number) => smooth(clamp01((t - from) / (to - from)));
const easeOutBack = (t: number) => {
  const c1 = 1.6;
  return 1 + (c1 + 1) * (t - 1) ** 3 + c1 * (t - 1) ** 2;
};
const DEG = Math.PI / 180;

/* -------------------------------------------------------------------------- */
/* World layout (units are roughly feet / 3).                                  */

/** World units per map unit. The map box is 1000 × 620. */
const M = 12;
const BW = 10;
const BD = 8;
const BH = 3.4;
const SITES = [-36, -18, 0, 18, 36, 54] as const;
const HERO = 2;
const COUNTER_Z = -0.8;
const COUNTER_TOP = 1.07;
const TRAY_TOP = COUNTER_TOP + 0.056;
const SANDWICH_AT = new Vector3(-0.26, TRAY_TOP, -0.72);
const SODA_AT = new Vector3(0.24, TRAY_TOP, -0.95);
const BOARD_Y = 2.45;
/** Kenney Mini Shop wall modules, squeezed to this thickness (see WALL_DEPTH). */
const WALL_T = 0.36;
const BOARD_Z = -BD / 2 + WALL_T + 0.13;
const POLE_HEIGHT = 6.2;
const TAG_W = 4.6;
const TAG_H = 3.0;

/* -------------------------------------------------------------------------- */
/* Building helpers: build with ordinary meshes, then bake to one geometry.     */

type V3 = readonly [number, number, number];

/** Kenney Mini Shop props at this scale: its employee stands 1.73 tall. */
const SHOP = 2.4;
/** Mini Shop wall modules are 1 × 1 × 0.6; squeezed to this depth they are 0.36 thick. */
const WALL_DEPTH = 0.6;
const BACK = -BD / 2 + WALL_T;

class Kit {
  readonly root = new Group();
  private readonly materials = new Map<string, MeshLambertMaterial>();

  constructor(private readonly parts: Parts) {}

  material(color: string): MeshLambertMaterial {
    let found = this.materials.get(color);
    if (found === undefined) {
      found = new MeshLambertMaterial({ color });
      this.materials.set(color, found);
    }
    return found;
  }

  add(geometry: BufferGeometry, color: string, at: V3, rotation: V3 = [0, 0, 0], parent: Object3D = this.root): Mesh {
    const result = new Mesh(geometry, this.material(color));
    result.position.set(at[0], at[1], at[2]);
    result.rotation.set(rotation[0], rotation[1], rotation[2]);
    parent.add(result);
    return result;
  }

  box(w: number, h: number, d: number, color: string, at: V3, radius = 0, rotation?: V3): Mesh {
    const geometry = radius > 0 ? new RoundedBoxGeometry(w, h, d, 2, radius) : new BoxGeometry(w, h, d);
    return this.add(geometry, color, at, rotation);
  }

  cylinder(top: number, bottom: number, h: number, color: string, at: V3, segments = 14, rotation?: V3): Mesh {
    return this.add(new CylinderGeometry(top, bottom, h, segments), color, at, rotation);
  }

  /**
   * A Kenney part (see parts.ts), scaled, turned about y, and placed so the
   * middle of its footprint is at `at` x/z and its underside at `at` y.
   */
  part(name: string, at: V3, scale: number | V3 = 1, turn = 0, parent: Object3D = this.root): Mesh {
    const geometry = this.parts.get(name);
    if (geometry === undefined) throw new Error(`world: no part ${name}`);
    const box = geometry.boundingBox!;
    const s = typeof scale === "number" ? [scale, scale, scale] : scale;
    const ox = ((box.min.x + box.max.x) / 2) * s[0];
    const oz = ((box.min.z + box.max.z) / 2) * s[2];
    const cos = Math.cos(turn);
    const sin = Math.sin(turn);
    const result = new Mesh(geometry, this.material("#ffffff"));
    result.position.set(at[0] - (cos * ox + sin * oz), at[1] - box.min.y * s[1], at[2] - (-sin * ox + cos * oz));
    result.rotation.y = turn;
    result.scale.set(s[0], s[1], s[2]);
    // Shared between kits: baking copies it, disposing must leave it alone.
    result.userData.shared = true;
    parent.add(result);
    return result;
  }

  bake(): BufferGeometry {
    const geometry = bake(this.root);
    this.dispose();
    return geometry;
  }

  dispose(): void {
    disposeTree(this.root);
    for (const material of this.materials.values()) material.dispose();
    this.materials.clear();
  }
}

function disposeTree(root: Object3D): void {
  root.traverse((object) => {
    const candidate = object as Mesh;
    if (candidate.isMesh !== true || candidate.userData.shared === true) return;
    candidate.geometry.dispose();
    const material = candidate.material;
    if (Array.isArray(material)) material.forEach((m) => m.dispose());
    else material.dispose();
  });
}

/**
 * Every mesh under `root`, transformed and vertex-coloured, as one indexed
 * geometry. Kenney parts bring their own colours; everything else takes its
 * material's.
 */
function bake(root: Object3D): BufferGeometry {
  root.updateMatrixWorld(true);
  const parts: BufferGeometry[] = [];
  root.traverse((object) => {
    const candidate = object as Mesh;
    if (candidate.isMesh !== true || !candidate.visible) return;
    const source = candidate.geometry;
    const part = new BufferGeometry();
    const position = source.getAttribute("position");
    const count = position.count;
    part.setAttribute("position", position.clone());
    const normal = source.getAttribute("normal") as BufferAttribute | undefined;
    if (normal !== undefined) part.setAttribute("normal", normal.clone());
    const own = source.getAttribute("color") as BufferAttribute | undefined;
    if (own !== undefined) {
      part.setAttribute("color", own.clone());
    } else {
      const material = (Array.isArray(candidate.material) ? candidate.material[0] : candidate.material) as Material & {
        color?: Color;
      };
      const color = material.color ?? new Color(C.ink);
      const colors = new Float32Array(count * 3);
      for (let i = 0; i < count; i += 1) {
        colors[i * 3] = color.r;
        colors[i * 3 + 1] = color.g;
        colors[i * 3 + 2] = color.b;
      }
      part.setAttribute("color", new BufferAttribute(colors, 3));
    }
    part.setIndex(source.index !== null ? source.index.clone() : Array.from({ length: count }, (_, i) => i));
    if (normal === undefined) part.computeVertexNormals();
    part.applyMatrix4(candidate.matrixWorld);
    parts.push(part);
  });
  const merged = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (merged === null) throw new Error("bake: nothing to merge");
  merged.computeBoundingSphere();
  return merged;
}

/* -------------------------------------------------------------------------- */
/* Pieces of the world. The restaurants are Kenney Mini Shop wall modules; the  */
/* street, houses, cars, lights and trees are Kenney's City and Car kits.       */

/** A run of wall modules along one side, `length` long, centred on `center`. */
function wallRun(kit: Kit, names: readonly string[], center: V3, length: number, turn: number): void {
  const w = length / names.length;
  names.forEach((name, i) => {
    const offset = -length / 2 + w / 2 + i * w;
    kit.part(name, [center[0] + Math.cos(turn) * offset, center[1], center[2] - Math.sin(turn) * offset], [w, BH, WALL_DEPTH], turn);
  });
}

/** Back and side walls, inside the front wall's line. */
function buildWalls(kit: Kit): void {
  wallRun(kit, ["wall", "wall", "wall"], [0, 0, -BD / 2 + WALL_T / 2], BW, 0);
  wallRun(kit, ["wall", "wall"], [-BW / 2 + WALL_T / 2, 0, 0], BD - 2 * WALL_T, Math.PI / 2);
  wallRun(kit, ["wall", "wall"], [BW / 2 - WALL_T / 2, 0, 0], BD - 2 * WALL_T, -Math.PI / 2);
}

/**
 * Floor, kitchen, board frame, counter, till, cashier, tray. The back and side
 * walls are their own mesh: the outside of the building still needs them after
 * the interior is hidden.
 */
function buildInterior(kit: Kit): void {
  kit.box(BW, 0.24, BD, C.floor, [0, -0.1, 0]);
  // Board frame on the back wall; the face is a separate textured plane.
  kit.box(3.7, 1.5, 0.12, C.charcoal, [0, BOARD_Y, BACK + 0.06], 0.04);
  // Kitchen: drinks fridges either side of the board, a low steel line under
  // it (kept plain and low: it is the backdrop to the first shot).
  for (const x of [-3.45, 3.45]) kit.part("fridge", [x, 0, BACK + 0.6], SHOP);
  kit.box(4.3, 0.95, 0.7, C.steelLight, [0, 0.475, BACK + 0.4], 0.04);
  kit.box(4.3, 0.12, 0.66, C.steelDark, [0, 0.06, BACK + 0.4]);
  // Tiles above the line, under the board.
  kit.box(4.3, 0.62, 0.04, C.tile, [0, 1.3, BACK + 0.02]);
  // Front counter.
  kit.box(6, 1.0, 0.8, C.counter, [0, 0.5, COUNTER_Z], 0.05);
  kit.box(6.2, 0.07, 0.98, C.counterTop, [0, COUNTER_TOP - 0.035, COUNTER_Z], 0.03);
  // Lifted a hair off the worktop: its base plate sat exactly in the counter
  // top's plane, and the two flickered through each other.
  kit.part("till", [2.45, COUNTER_TOP + 0.006, COUNTER_Z - 0.05], 1.5);
  // The cashier.
  kit.part("employee", [1.45, 0, -1.75], SHOP);
  // Tray, liner.
  kit.box(1.15, 0.05, 0.78, C.tray, [-0.05, COUNTER_TOP + 0.025, -0.78], 0.02);
  kit.box(0.98, 0.008, 0.62, C.liner, [-0.05, TRAY_TOP - 0.002, -0.78]);
}

/** Front wall, windows, door and canopy, from y = 0 so it can grow. */
function buildFront(kit: Kit): void {
  wallRun(kit, ["wall-window", "wall-door", "wall-window"], [0, 0, BD / 2 - WALL_T / 2], BW, 0);
  kit.box(BW + 0.6, 0.12, 1.3, C.canopy, [0, 2.92, BD / 2 + 0.6], 0.04);
}

/** Roof slab, parapet and rooftop unit, centred on x/z so it can grow out. */
function buildRoof(kit: Kit): void {
  kit.box(BW + 0.3, 0.3, BD + 0.3, C.roof, [0, BH + 0.15, 0], 0.06);
  kit.box(BW + 0.3, 0.35, 0.22, C.roofTrim, [0, BH + 0.45, BD / 2 + 0.04]);
  kit.box(BW + 0.3, 0.35, 0.22, C.roofTrim, [0, BH + 0.45, -BD / 2 - 0.04]);
  kit.box(0.22, 0.35, BD + 0.3, C.roofTrim, [-BW / 2 - 0.04, BH + 0.45, 0]);
  kit.box(0.22, 0.35, BD + 0.3, C.roofTrim, [BW / 2 + 0.04, BH + 0.45, 0]);
  kit.box(1.8, 0.8, 1.4, C.steel, [2.4, BH + 0.7, -1.4], 0.08);
  kit.cylinder(0.25, 0.25, 0.5, C.steelDark, [-2.6, BH + 0.55, -2], 10);
}

/** The closed building for the other restaurants on the street. */
function buildClosedBuilding(kit: Kit): void {
  buildWalls(kit);
  buildFront(kit);
  buildRoof(kit);
}

const ROAD_Z = 13.5;
const ROAD_TILE = 6;
const HOUSES: readonly { x: number; name: string }[] = [
  { x: -42, name: "house-a" },
  { x: -18, name: "house-g" },
  { x: 6, name: "house-c" },
  { x: 30, name: "house-h" },
  { x: 54, name: "house-a" },
];
const HOUSE_Z = 26;
const HOUSE_SCALE = 6.5;
const CAR_SCALE = 1.65;
const CARS: readonly { name: string; x: number; z: number; turn: number }[] = [
  { name: "sedan", x: -21, z: 7.4, turn: 0 },
  { name: "hatchback", x: 15, z: 7.4, turn: Math.PI },
  { name: "suv", x: 37.5, z: 7.4, turn: 0 },
  { name: "van", x: -6, z: 12, turn: Math.PI / 2 },
  { name: "sedan", x: 27, z: 15, turn: -Math.PI / 2 },
];
const TREES: readonly [number, number, number][] = [
  [-44, -9, 1.1], [-29, -10, 0.9], [-11, -9.5, 1.2], [8, -10.5, 1], [27, -9, 1.15], [45, -10, 0.95], [62, -9.5, 1.1],
  [-49, 21, 1], [-30, 21.5, 0.9], [-6, 21, 1.15], [18, 21.5, 1], [42, 21, 1.05], [-52, 31, 1.2], [68, 30, 1],
];
const TREE_SCALE = 8.5;

/** Ground, road, car parks, houses, cars, lights, trees and the price-tag poles. */
function buildTown(kit: Kit, poleSites: readonly number[]): void {
  // Platform: top at y = 0, wide enough for whole road tiles.
  kit.box(132, 0.8, 54, C.ground, [9, -0.4, 10], 0.35);
  kit.box(132.6, 0.5, 54.6, C.groundEdge, [9, -0.7, 10], 0.2);
  // The road, with a kerb cut wherever a car park meets it.
  for (let k = -9; k <= 12; k += 1) {
    const x = k * ROAD_TILE;
    const drive = (SITES as readonly number[]).includes(x);
    kit.part(drive ? "road-driveway" : "road", [x, 0, ROAD_Z], [ROAD_TILE, 5, ROAD_TILE], drive ? Math.PI : 0);
  }
  // Lawns: the houses' side of the road, and behind the restaurants.
  kit.box(128, 0.012, 16.5, C.lawn, [9, 0.006, 27.75]);
  kit.box(128, 0.012, 9.5, C.lawn, [9, 0.006, -11.25]);
  // Car parks in front of each restaurant.
  for (const x of SITES) kit.box(BW + 1.5, 0.03, 5.2, C.lot, [x, 0.015, BD / 2 + 2.9]);
  // Houses across the road, facing it.
  for (const house of HOUSES) kit.part(house.name, [house.x, 0, HOUSE_Z], HOUSE_SCALE, Math.PI);
  // Street lights along the far kerb, leaning over the road.
  for (let x = -45; x <= 63; x += 18) kit.part("light", [x, 0, ROAD_Z + ROAD_TILE / 2 + 0.6], 9);
  for (const car of CARS) kit.part(car.name, [car.x, 0, car.z], CAR_SCALE, car.turn);
  TREES.forEach(([x, z, s], i) => kit.part(i % 3 === 1 ? "tree-small" : "tree-large", [x, 0, z], TREE_SCALE * s));
  for (const x of poleSites) kit.cylinder(0.12, 0.14, POLE_HEIGHT, C.charcoal, [x + 5.6, POLE_HEIGHT / 2, BD / 2 + 1.4], 8);
}

/** Load a Kenney part, drop its texture, and smooth its normals for the clay look. */
function smoothPart(source: Mesh): BufferGeometry {
  source.updateWorldMatrix(true, false);
  const raw = new BufferGeometry();
  raw.setAttribute("position", source.geometry.getAttribute("position").clone());
  if (source.geometry.index !== null) raw.setIndex(source.geometry.index.clone());
  raw.applyMatrix4(source.matrixWorld);
  const merged = mergeVertices(raw, 1e-3);
  raw.dispose();
  merged.computeVertexNormals();
  return merged;
}

function meshNamed(root: Object3D, name: string): Mesh | null {
  let found: Mesh | null = null;
  root.traverse((object) => {
    const candidate = object as Mesh;
    if (found === null && candidate.isMesh === true && (object.name === name || object.parent?.name === name)) {
      found = candidate;
    }
  });
  return found;
}

interface SandwichLayer {
  mesh: Mesh;
  base: number;
  lift: number;
}

async function buildSandwich(loader: GLTFLoader): Promise<{ group: Group; layers: SandwichLayer[]; soda: Mesh | null }> {
  const [burger, soda] = await Promise.all([
    loader.loadAsync("/landing/burger.glb"),
    loader.loadAsync("/landing/soda.glb").catch(() => null),
  ]);
  const group = new Group();
  const order: { name: string; color: string; scale: V3; lift: number; nest: number }[] = [
    { name: "bun-bottom", color: C.bunBottom, scale: [1, 1, 1], lift: 0, nest: 0 },
    { name: "patty", color: C.patty, scale: [1.14, 0.8, 1.14], lift: 0.08, nest: 0.2 },
    { name: "salad", color: C.lettuce, scale: [1.06, 1.1, 1.06], lift: 0.17, nest: 0.45 },
    { name: "bun-top", color: C.bunTop, scale: [1, 1, 1], lift: 0.3, nest: 0.3 },
  ];
  const bottom = meshNamed(burger.scene, "bun-bottom");
  let unit = 1;
  if (bottom !== null) {
    const probe = smoothPart(bottom);
    probe.computeBoundingBox();
    const width = probe.boundingBox!.max.x - probe.boundingBox!.min.x;
    unit = 0.64 / Math.max(width, 0.01);
    probe.dispose();
  }
  const layers: SandwichLayer[] = [];
  let top = 0;
  let previousHeight = 0;
  for (const entry of order) {
    const source = meshNamed(burger.scene, entry.name);
    if (source === null) continue;
    const geometry = smoothPart(source);
    geometry.scale(unit * entry.scale[0], unit * entry.scale[1], unit * entry.scale[2]);
    geometry.computeBoundingBox();
    const box = geometry.boundingBox!;
    geometry.translate(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
    const height = box.max.y - box.min.y;
    const base = layers.length === 0 ? 0 : top - previousHeight * entry.nest;
    const mesh = new Mesh(geometry, new MeshLambertMaterial({ color: entry.color }));
    mesh.position.y = base;
    mesh.castShadow = true;
    group.add(mesh);
    layers.push({ mesh, base, lift: entry.lift });
    top = base + height;
    previousHeight = height;
    if (entry.name === "salad") {
      // A thin line of mayo on the lettuce.
      const mayo = new Mesh(new CylinderGeometry(0.25, 0.26, 0.018, 24), new MeshLambertMaterial({ color: C.mayo }));
      const mayoBase = top - height * 0.25;
      mayo.position.y = mayoBase;
      mayo.castShadow = true;
      group.add(mayo);
      layers.push({ mesh: mayo, base: mayoBase, lift: entry.lift + 0.05 });
    }
  }
  group.position.copy(SANDWICH_AT);
  disposeTree(burger.scene);

  let cup: Mesh | null = null;
  if (soda !== null) {
    let first: Mesh | null = null;
    soda.scene.traverse((object) => {
      const candidate = object as Mesh;
      if (first === null && candidate.isMesh === true) first = candidate;
    });
    if (first !== null) {
      const geometry = smoothPart(first);
      geometry.computeBoundingBox();
      const box = geometry.boundingBox!;
      const scale = 0.62 / Math.max(box.max.y - box.min.y, 0.01);
      geometry.translate(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
      geometry.scale(scale, scale, scale);
      cup = new Mesh(geometry, new MeshLambertMaterial({ color: C.cup }));
      cup.position.copy(SODA_AT);
      cup.castShadow = true;
    }
    disposeTree(soda.scene);
  }
  return { group, layers, soda: cup };
}

/* -------------------------------------------------------------------------- */
/* Textures drawn once (tags, blob) or on change (board).                       */

function blobTexture(): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 64;
  canvas.height = 64;
  const context = canvas.getContext("2d")!;
  const gradient = context.createRadialGradient(32, 32, 2, 32, 32, 31);
  gradient.addColorStop(0, "rgba(255,255,255,1)");
  gradient.addColorStop(0.55, "rgba(255,255,255,0.55)");
  gradient.addColorStop(1, "rgba(255,255,255,0)");
  context.fillStyle = gradient;
  context.fillRect(0, 0, 64, 64);
  return new CanvasTexture(canvas);
}

/** The board's price as its flaps spell it, right-aligned to the widest price so the tiles never move. */
function boardText(cents: number | null, width: number): string {
  return (cents === null ? "—" : formatCents(cents)).padStart(width, " ");
}

const TILE = "#34322c";
const TILE_H = 216;
const TILE_GAP = 12;

/**
 * Half of one flap tile: the top or bottom half of `character`, folded about
 * the hinge by `scale` (1 flat, 0 edge-on) and darkened by `shade` (0 to 1)
 * as it turns away from the light.
 */
function drawHalf(
  context: CanvasRenderingContext2D,
  x: number,
  top: number,
  w: number,
  character: string,
  side: "top" | "bottom",
  scale: number,
  shade: number,
): void {
  if (scale < 0.02) return;
  const hinge = top + TILE_H / 2;
  context.save();
  context.translate(0, hinge);
  context.scale(1, scale);
  context.translate(0, -hinge);
  context.beginPath();
  context.rect(x, side === "top" ? top : hinge, w, TILE_H / 2);
  context.clip();
  context.fillStyle = TILE;
  context.beginPath();
  context.roundRect(x, top, w, TILE_H, 10);
  context.fill();
  context.fillStyle = C.paper;
  context.fillText(character, x + w / 2, hinge + 8);
  if (shade > 0) {
    context.fillStyle = `rgba(0, 0, 0, ${(0.5 * shade).toFixed(3)})`;
    context.fillRect(x, top, w, TILE_H);
  }
  context.restore();
}

/**
 * The menu board: its heading, and the price on a row of split-flap tiles.
 * A turning column shows the next character on its upper half and the
 * current one on its lower half, with the flap between them falling over the
 * hinge: the current character's top folding down and away, then the next
 * character's bottom folding down into place.
 */
function drawBoard(canvas: HTMLCanvasElement, columns: readonly FlapFrame[], font: string): void {
  const context = canvas.getContext("2d")!;
  const { width: W, height: H } = canvas;
  context.fillStyle = C.board;
  context.fillRect(0, 0, W, H);
  context.fillStyle = "#c9c4b6";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = `500 44px ${font}`;
  context.fillText("CHICKEN SANDWICH", W / 2, H * 0.24);

  const n = Math.max(1, columns.length);
  const tileW = Math.min(128, (W - 80 - TILE_GAP * (n - 1)) / n);
  const left = (W - (tileW * n + TILE_GAP * (n - 1))) / 2;
  const top = H * 0.64 - TILE_H / 2;
  context.font = `500 168px ${font}`;
  columns.forEach((frame, i) => {
    const x = left + i * (tileW + TILE_GAP);
    const turning = frame.progress > 0;
    drawHalf(context, x, top, tileW, turning ? frame.next : frame.current, "top", 1, 0);
    drawHalf(context, x, top, tileW, frame.current, "bottom", 1, 0);
    if (turning) {
      // A flap falls under its own weight: slow off the top, fast onto the stack.
      const fold = Math.cos(Math.PI * frame.progress * frame.progress);
      if (fold > 0) drawHalf(context, x, top, tileW, frame.current, "top", fold, 1 - fold);
      else drawHalf(context, x, top, tileW, frame.next, "bottom", -fold, 1 + fold);
    }
    // The hinge: the gap between the two halves.
    context.fillStyle = C.board;
    context.fillRect(x, top + TILE_H / 2 - 2, tileW, 4);
  });
}

function drawTag(context: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, cents: number, tier: keyof typeof TIER_COLOR, font: string): void {
  context.fillStyle = C.paper;
  context.fillRect(x, y, w, h);
  context.fillStyle = TIER_COLOR[tier];
  context.fillRect(x, y, w, 34);
  context.strokeStyle = C.ink;
  context.lineWidth = 6;
  context.strokeRect(x + 3, y + 3, w - 6, h - 6);
  context.fillStyle = C.ink;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = `500 84px ${font}`;
  context.fillText(formatCents(cents), x + w / 2, y + 34 + (h - 34) / 2 + 3);
}

/* -------------------------------------------------------------------------- */
/* The camera path.                                                             */

export interface Region {
  cx: number;
  cy: number;
  w: number;
  h: number;
}

interface Key {
  target: Vector3;
  /** Half-extents the region must hold, in world units. */
  rx: number;
  ry: number;
  az: number;
  el: number;
  region: Region;
}

const FOV = 32;

function keyframes(wide: boolean, mapCenter: Vector3, mapHalf: { x: number; z: number }, hero?: Region): Key[] {
  // Wide: the canvas is a panel to the right of the text column, so the
  // scene is centred in it. Narrow: the canvas fills the screen, text blocks
  // rise from the bottom and the scene lives in the top half, except on the
  // first screen where the headline is on top.
  const right: Region = { cx: 0.5, cy: 0.52, w: 0.86, h: 0.8 };
  const heroNarrow: Region = { cx: 0.5, cy: 0.77, w: 0.92, h: 0.36 };
  const topNarrow: Region = { cx: 0.5, cy: 0.33, w: 0.94, h: 0.5 };
  const sandwich = SANDWICH_AT.clone().add(new Vector3(0.12, 0.2, 0));
  const elMap = 56;
  const elSettle = 78;
  return [
    {
      target: sandwich,
      rx: 0.95,
      ry: 0.62,
      az: 22,
      // High enough that the board above the counter stays out of the first
      // shot instead of showing half a price; the pull-back reveals it.
      el: 44,
      region: hero ?? (wide ? right : heroNarrow),
    },
    {
      target: new Vector3(0, 1.95, -2.2),
      rx: 2.6,
      ry: 1.6,
      az: 9,
      el: 9,
      region: wide ? right : topNarrow,
    },
    {
      target: new Vector3(0.5, 2.2, 2),
      rx: 9.5,
      ry: 6.5,
      az: 30,
      el: 28,
      region: wide ? right : topNarrow,
    },
    {
      target: new Vector3(9, 1, 4),
      rx: 50,
      ry: 26,
      az: 33,
      el: 38,
      region: wide ? right : topNarrow,
    },
    {
      target: mapCenter,
      rx: mapHalf.x,
      ry: mapHalf.z * Math.sin(elMap * DEG),
      az: 0,
      el: elMap,
      region: wide ? { cx: 0.5, cy: 0.5, w: 0.96, h: 0.86 } : { cx: 0.5, cy: 0.32, w: 0.98, h: 0.5 },
    },
    {
      target: mapCenter,
      rx: mapHalf.x,
      ry: mapHalf.z * Math.sin(elSettle * DEG),
      az: 0,
      el: elSettle,
      region: wide ? { cx: 0.5, cy: 0.5, w: 0.9, h: 0.8 } : { cx: 0.5, cy: 0.2, w: 0.96, h: 0.3 },
    },
  ];
}

/* -------------------------------------------------------------------------- */
/* The world.                                                                   */

export interface WorldLayout {
  width: number;
  height: number;
  wide: boolean;
  /** Where the first shot frames the sandwich, as fractions of the viewport. */
  hero?: Region;
}

export interface WorldOptions {
  /** Real prices on file, ascending. The board steps through them; tags show them. */
  prices: readonly number[];
  monoFont: string;
  shadows: boolean;
  /** Called when the board changes price, with the index into `prices`. */
  onBoardIndex?: (index: number) => void;
}

export interface World {
  /**
   * Position everything for a beat (0..5). Does not render. With `now` (a
   * frame's timestamp), a change of price turns the board's flaps; without
   * it, the board jumps straight to the price (the first frame, a resize,
   * reduced motion).
   */
  update(beat: number, now?: number): void;
  /** True while the board's flaps are still turning: keep drawing frames until it is false. */
  busy(): boolean;
  render(): void;
  resize(layout: WorldLayout, pixelRatio: number): void;
  setShadows(on: boolean): void;
  readonly drawCalls: () => number;
  dispose(): void;
}

function findOrigin(map: PriceMap): { x: number; y: number } {
  // Dallas–Fort Worth: the densest cell near (490, 445) in the projected box.
  let best: { x: number; y: number; count: number } | null = null;
  for (const [x, y, , count] of map.points) {
    if (Math.hypot(x - 490, y - 445) > 30) continue;
    if (best === null || count > best.count) best = { x, y, count };
  }
  return best ?? { x: 498, y: 438 };
}

function buildMap(map: PriceMap, origin: { x: number; y: number }, reveal: { value: number }, feather: { value: number }): InstancedMesh {
  const geometry = new CylinderGeometry(1, 1, 1, 9, 1);
  geometry.translate(0, 0.5, 0);
  const material = new MeshLambertMaterial({ color: 0xffffff });
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uReveal = reveal;
    shader.uniforms.uFeather = feather;
    shader.vertexShader = `uniform float uReveal;\nuniform float uFeather;\n${shader.vertexShader.replace(
      "#include <begin_vertex>",
      `#include <begin_vertex>
      #ifdef USE_INSTANCING
        float revealDistance = length(instanceMatrix[3].xz);
        float grow = clamp((uReveal - revealDistance) / uFeather, 0.0, 1.0);
        transformed *= grow * grow * (3.0 - 2.0 * grow);
      #endif`,
    )}`;
  };
  material.customProgramCacheKey = () => "landing-map-reveal";
  const scale: PriceMapScale = map.priceCents;
  const mesh = new InstancedMesh(geometry, material, map.points.length);
  const matrix = new Matrix4();
  const position = new Vector3();
  const size = new Vector3();
  const rotation = new Quaternion();
  const color = new Color();
  map.points.forEach(([x, y, cents], index) => {
    const priced = cents > 0;
    const height = priced ? 0.5 + 5.5 * clamp01((cents - scale.min) / (scale.max - scale.min)) : 0.35;
    position.set((x - origin.x) * M, 0, (y - origin.y) * M);
    size.set(1.85 * M, height * M, 1.85 * M);
    matrix.compose(position, rotation, size);
    mesh.setMatrixAt(index, matrix);
    mesh.setColorAt(index, color.set(TIER_COLOR[priceTier(cents, scale)]));
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor !== null) mesh.instanceColor.needsUpdate = true;
  mesh.frustumCulled = false;
  return mesh;
}

export async function createWorld(canvas: HTMLCanvasElement, options: WorldOptions): Promise<World> {
  const loader = new GLTFLoader();
  const [map, sandwich, parts] = await Promise.all([loadPriceMap(), buildSandwich(loader), loadParts()]);

  const renderer = new WebGLRenderer({
    canvas,
    antialias: window.devicePixelRatio < 2,
    alpha: false,
    powerPreference: "default",
  });
  renderer.setClearColor(new Color(C.paper), 1);
  renderer.shadowMap.enabled = options.shadows;
  renderer.shadowMap.type = PCFShadowMap;
  renderer.shadowMap.autoUpdate = false;
  renderer.shadowMap.needsUpdate = true;

  const scene = new Scene();
  const camera = new PerspectiveCamera(FOV, 1, 0.05, 1000);

  scene.add(new HemisphereLight(0xfff8ee, 0xb9b2a2, 1.55));
  scene.add(new AmbientLight(0xffffff, 0.3));
  const key = new DirectionalLight(0xffffff, 1.9);
  const lightDirection = new Vector3(-4, 11, 7).normalize();
  key.position.copy(SANDWICH_AT).addScaledVector(lightDirection, 6);
  key.target.position.copy(SANDWICH_AT);
  key.castShadow = options.shadows;
  key.shadow.mapSize.set(512, 512);
  key.shadow.camera.left = -0.9;
  key.shadow.camera.right = 0.9;
  key.shadow.camera.top = 0.9;
  key.shadow.camera.bottom = -0.9;
  key.shadow.camera.near = 3;
  key.shadow.camera.far = 9;
  key.shadow.bias = -0.0006;
  key.shadow.normalBias = 0.01;
  key.shadow.radius = 3;
  scene.add(key, key.target);

  const vertexColored = new MeshLambertMaterial({ vertexColors: true });

  /* The town: everything that shrinks into the Dallas dot. */
  const town = new Group();
  scene.add(town);
  const hero = new Group();
  hero.position.x = SITES[HERO];
  town.add(hero);

  const prices = [...options.prices];
  const heroPrice = prices[prices.length - 1] ?? null;
  const others = prices.slice(0, -1);
  // Neighbours alternate cheap and dear so the street reads as uneven.
  const otherSites = [0, 4, 1, 3, 5].map((i) => SITES[i]);
  const otherOrder = [0, 3, 1, 4, 2];
  const tagged: { x: number; cents: number }[] = [];
  otherOrder.forEach((priceIndex, siteIndex) => {
    const cents = others[priceIndex];
    const x = otherSites[siteIndex];
    if (cents !== undefined && x !== undefined) tagged.push({ x, cents });
  });

  {
    const kit = new Kit(parts);
    buildTown(kit, [...tagged.map((t) => t.x), ...(heroPrice === null ? [] : [SITES[HERO]])]);
    const ground = new Mesh(kit.bake(), vertexColored);
    town.add(ground);
  }

  const interiorKit = new Kit(parts);
  buildInterior(interiorKit);
  const interior = new Mesh(interiorKit.bake(), vertexColored);
  interior.receiveShadow = true;
  hero.add(interior);

  const wallsKit = new Kit(parts);
  buildWalls(wallsKit);
  const walls = new Mesh(wallsKit.bake(), vertexColored);
  walls.receiveShadow = true;
  hero.add(walls);

  const frontKit = new Kit(parts);
  buildFront(frontKit);
  const front = new Mesh(frontKit.bake(), vertexColored);
  hero.add(front);

  const roofKit = new Kit(parts);
  buildRoof(roofKit);
  const roof = new Mesh(roofKit.bake(), vertexColored);
  hero.add(roof);

  hero.add(sandwich.group);
  if (sandwich.soda !== null) hero.add(sandwich.soda);

  // The other restaurants: one instanced draw call.
  const closedKit = new Kit(parts);
  buildClosedBuilding(closedKit);
  const buildingSites = SITES.filter((_, i) => i !== HERO);
  const buildings = new InstancedMesh(closedKit.bake(), vertexColored, buildingSites.length);
  {
    const matrix = new Matrix4();
    buildingSites.forEach((x, i) => buildings.setMatrixAt(i, matrix.makeTranslation(x, 0, 0)));
    buildings.instanceMatrix.needsUpdate = true;
    buildings.computeBoundingSphere();
  }
  town.add(buildings);

  // Blob shadows, one draw call.
  const blobMap = blobTexture();
  const blobs: { x: number; y: number; z: number; w: number; d: number }[] = [
    { x: SANDWICH_AT.x, y: TRAY_TOP + 0.004, z: SANDWICH_AT.z, w: 0.82, d: 0.78 },
    { x: SODA_AT.x, y: TRAY_TOP + 0.004, z: SODA_AT.z, w: 0.42, d: 0.42 },
    { x: -0.05, y: COUNTER_TOP + 0.003, z: -0.78, w: 1.5, d: 1.05 },
    { x: 1.45, y: 0.03, z: -1.75, w: 1.3, d: 1.0 },
    ...SITES.map((x) => ({ x, y: 0.03, z: 0.6, w: BW + 4, d: BD + 3.5 })),
    ...TREES.map(([x, z, s]) => ({ x: x + 0.4, y: 0.035, z: z + 0.4, w: 3 * s, d: 3 * s })),
    ...HOUSES.map((h) => ({ x: h.x, y: 0.03, z: HOUSE_Z, w: 11, d: 9 })),
    ...CARS.map((c) => {
      const along = Math.abs(Math.sin(c.turn)) > 0.5;
      return { x: c.x, y: 0.04, z: c.z, w: along ? 5 : 3, d: along ? 3 : 5 };
    }),
  ];
  const blobMaterial = new MeshBasicMaterial({
    map: blobMap,
    color: C.blob,
    transparent: true,
    opacity: 0.26,
    depthWrite: false,
    polygonOffset: true,
    polygonOffsetFactor: -2,
  });
  const blobGeometry = new PlaneGeometry(1, 1);
  blobGeometry.rotateX(-Math.PI / 2);
  const blobMesh = new InstancedMesh(blobGeometry, blobMaterial, blobs.length);
  {
    const matrix = new Matrix4();
    const q = new Quaternion();
    blobs.forEach((b, i) => {
      matrix.compose(new Vector3(b.x, b.y, b.z), q, new Vector3(b.w, 1, b.d));
      blobMesh.setMatrixAt(i, matrix);
    });
    blobMesh.instanceMatrix.needsUpdate = true;
    blobMesh.computeBoundingSphere();
    blobMesh.renderOrder = 1;
  }
  town.add(blobMesh);

  // The board face.
  const boardCanvas = document.createElement("canvas");
  boardCanvas.width = 1024;
  boardCanvas.height = 400;
  const boardWidth = Math.max(1, ...prices.map((cents) => formatCents(cents).length));
  let boardShows = boardText(prices[0] ?? null, boardWidth);
  let flip: Flip | null = null;
  drawBoard(boardCanvas, stillColumns(boardShows), options.monoFont);
  const boardTexture = new CanvasTexture(boardCanvas);
  boardTexture.colorSpace = SRGBColorSpace;
  boardTexture.anisotropy = 8;
  const board = new Mesh(new PlaneGeometry(3.45, 1.35), new MeshBasicMaterial({ map: boardTexture, toneMapped: false }));
  board.position.set(0, BOARD_Y, BOARD_Z);
  hero.add(board);
  let boardIndex = 0;

  // Price tags: one atlas, one merged mesh for the neighbours, one for the hero.
  const tagCells = [...tagged, ...(heroPrice === null ? [] : [{ x: SITES[HERO], cents: heroPrice }])];
  const atlas = document.createElement("canvas");
  const cellW = 256;
  const cellH = 168;
  atlas.width = cellW * 2;
  atlas.height = cellH * 3;
  {
    const context = atlas.getContext("2d")!;
    context.fillStyle = C.paper;
    context.fillRect(0, 0, atlas.width, atlas.height);
    tagCells.forEach((tag, i) => {
      const tier = priceTier(tag.cents, map.priceCents);
      drawTag(context, (i % 2) * cellW, Math.floor(i / 2) * cellH, cellW, cellH, tag.cents, tier === "none" ? "mid" : tier, options.monoFont);
    });
  }
  const atlasTexture = new CanvasTexture(atlas);
  atlasTexture.colorSpace = SRGBColorSpace;
  atlasTexture.anisotropy = 8;
  const tagMaterial = new MeshBasicMaterial({ map: atlasTexture, toneMapped: false });
  const facing = new Matrix4().makeRotationY(31 * DEG).multiply(new Matrix4().makeRotationX(-0.12));
  function tagGeometry(index: number, x: number, local: boolean): BufferGeometry {
    const plane = new PlaneGeometry(TAG_W, TAG_H);
    const uv = plane.getAttribute("uv") as BufferAttribute;
    const u0 = ((index % 2) * cellW) / atlas.width;
    const u1 = u0 + cellW / atlas.width;
    const vTop = 1 - (Math.floor(index / 2) * cellH) / atlas.height;
    const vBottom = vTop - cellH / atlas.height;
    for (let i = 0; i < uv.count; i += 1) {
      uv.setXY(i, lerp(u0, u1, uv.getX(i)), lerp(vBottom, vTop, uv.getY(i)));
    }
    plane.applyMatrix4(facing);
    if (!local) plane.translate(x + 5.6, POLE_HEIGHT + TAG_H / 2 - 0.2, BD / 2 + 1.4);
    return plane;
  }
  let tags: Mesh | null = null;
  if (tagged.length > 0) {
    const parts = tagged.map((tag, i) => tagGeometry(i, tag.x, false));
    const merged = mergeGeometries(parts, false);
    parts.forEach((p) => p.dispose());
    if (merged !== null) {
      tags = new Mesh(merged, tagMaterial);
      town.add(tags);
    }
  }
  let heroTag: Mesh | null = null;
  if (heroPrice !== null) {
    heroTag = new Mesh(tagGeometry(tagged.length, 0, true), tagMaterial);
    heroTag.position.set(5.6, POLE_HEIGHT - 0.2, BD / 2 + 1.4);
    heroTag.geometry.translate(0, TAG_H / 2, 0);
    hero.add(heroTag);
  }

  /* The map. */
  const origin = findOrigin(map);
  const reveal = { value: 0 };
  const feather = { value: 1 };
  const mapMesh = buildMap(map, origin, reveal, feather);
  scene.add(mapMesh);
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const [x, y] of map.points) {
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }
  const mapCenter = new Vector3(((minX + maxX) / 2 - origin.x) * M, 0, ((minY + maxY) / 2 - origin.y) * M);
  const mapHalf = { x: ((maxX - minX) / 2 + 4) * M, z: ((maxY - minY) / 2 + 4) * M };

  /* State. */
  let layout: WorldLayout = { width: 1, height: 1, wide: true };
  let keys = keyframes(true, mapCenter, mapHalf);
  const target = new Vector3();
  const tmp = new Vector3();
  let lastSandwichBeat = -1;
  let shadowsOn = options.shadows;

  function placeCamera(beat: number): number {
    const i = Math.min(keys.length - 2, Math.max(0, Math.floor(beat)));
    const f = clamp01(beat - i);
    const a = keys[i]!;
    const b = keys[i + 1]!;
    const rx = Math.exp(lerp(Math.log(a.rx), Math.log(b.rx), f));
    const ry = Math.exp(lerp(Math.log(a.ry), Math.log(b.ry), f));
    // Move the look-at point in proportion to distance, not to time, so the
    // thing being left stays on screen while the camera pulls away from it.
    const weight = Math.abs(b.rx - a.rx) < 1e-6 ? f : (rx - a.rx) / (b.rx - a.rx);
    target.lerpVectors(a.target, b.target, weight);
    const az = lerp(a.az, b.az, f) * DEG;
    const el = lerp(a.el, b.el, f) * DEG;
    const region: Region = {
      cx: lerp(a.region.cx, b.region.cx, f),
      cy: lerp(a.region.cy, b.region.cy, f),
      w: lerp(a.region.w, b.region.w, f),
      h: lerp(a.region.h, b.region.h, f),
    };
    const t = Math.tan((FOV / 2) * DEG);
    const aspect = layout.width / layout.height;
    const distance = Math.max(rx / (t * region.w * aspect), ry / (t * region.h));
    tmp.set(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
    camera.position.copy(target).addScaledVector(tmp, distance);
    camera.lookAt(target);
    camera.near = Math.min(400, Math.max(0.04, distance * 0.025));
    camera.far = distance * 6 + 400;
    camera.aspect = aspect;
    camera.setViewOffset(
      layout.width,
      layout.height,
      -(region.cx - 0.5) * layout.width,
      -(region.cy - 0.5) * layout.height,
      layout.width,
      layout.height,
    );
    camera.updateProjectionMatrix();
    return distance;
  }

  /** Paint the board as it stands at `now`, or at rest when `now` is undefined. */
  function paintBoard(now: number | undefined): void {
    if (flip !== null && now !== undefined) {
      const frame = flipAt(flip, now);
      drawBoard(boardCanvas, frame.columns, options.monoFont);
      if (frame.done) flip = null;
    } else {
      flip = null;
      drawBoard(boardCanvas, stillColumns(boardShows), options.monoFont);
    }
    boardTexture.needsUpdate = true;
  }

  function update(beat: number, now?: number): void {
    const distance = placeCamera(beat);

    // 0 → 1: the sandwich comes apart into its layers and closes again.
    const open = Math.sin(Math.PI * clamp01((beat - 0.04) / 0.72));
    for (const layer of sandwich.layers) layer.mesh.position.y = layer.base + layer.lift * open;
    sandwich.group.rotation.y = -0.35 + 0.9 * span(beat, 0, 1.1);
    const sandwichBeat = Math.min(beat, 1.2);
    if (shadowsOn && sandwichBeat !== lastSandwichBeat) renderer.shadowMap.needsUpdate = true;
    lastSandwichBeat = sandwichBeat;

    // 0.45 → 1.8: the board steps from the cheapest real price to the dearest,
    // each change turning the flaps from whatever they show at that moment.
    if (prices.length > 0) {
      const index = Math.min(prices.length - 1, Math.floor(clamp01((beat - 0.45) / 1.35) * prices.length));
      if (index !== boardIndex) {
        boardIndex = index;
        const next = boardText(prices[index] ?? null, boardWidth);
        if (now !== undefined) flip = planFlip(flip === null ? boardShows : textAt(flip, now), next, now);
        boardShows = next;
        options.onBoardIndex?.(index);
        paintBoard(now);
      } else if (flip !== null) {
        paintBoard(now);
      }
    }

    // 1.75 → 2.75: the front wall rises, the tag pops up, the roof closes.
    const rise = span(beat, 1.7, 2.25);
    front.visible = rise > 0.002;
    front.scale.y = Math.max(rise, 0.002);
    const lid = span(beat, 2.15, 2.7);
    roof.visible = lid > 0.002;
    roof.scale.set(Math.max(lid, 0.002), 1, Math.max(lid, 0.002));
    roof.position.y = (1 - lid) * 1.2;
    if (heroTag !== null) {
      const pop = clamp01((beat - 1.95) / 0.4);
      heroTag.visible = pop > 0.001;
      heroTag.scale.setScalar(Math.max(0.001, easeOutBack(pop)));
    }
    const inside = beat < 2.85;
    interior.visible = inside;
    board.visible = inside;
    sandwich.group.visible = inside;
    if (sandwich.soda !== null) sandwich.soda.visible = inside;

    // 3.1 → 3.55: the street shrinks into its own dot on the map.
    const shrink = 1 - span(beat, 3.1, 3.55);
    town.visible = shrink > 0.002;
    town.scale.setScalar(Math.max(shrink, 0.002));

    // 3.05 → 4: the map spreads outward from that dot, always just ahead of
    // the camera, so the frame is never empty while the camera climbs.
    mapMesh.visible = beat > 3.04;
    reveal.value = distance * (0.5 + 0.7 * span(beat, 3.55, 4)) * span(beat, 3.04, 3.3);
    feather.value = reveal.value * 0.3 + 4 * M;
  }

  // Warm up while the canvas is still hidden: compile every program (hidden
  // objects included) and draw one frame at the street, the shrink and the
  // map, so every buffer and texture is on the GPU before the first scroll
  // instead of arriving as a long frame halfway through it.
  renderer.compile(scene, camera);
  for (const beat of [2.4, 3.3, 4.5]) {
    update(beat);
    renderer.render(scene, camera);
  }
  update(0);
  renderer.shadowMap.needsUpdate = shadowsOn;

  return {
    update,
    busy: () => flip !== null,
    render() {
      renderer.render(scene, camera);
    },
    resize(next, pixelRatio) {
      layout = next;
      keys = keyframes(next.wide, mapCenter, mapHalf, next.hero);
      renderer.setPixelRatio(pixelRatio);
      renderer.setSize(next.width, next.height, false);
    },
    setShadows(on) {
      // Switching the shadow map off would recompile every program in the
      // middle of a scroll, on a device that is already short of time. So
      // "off" freezes it instead: the shadow stops following the sandwich
      // and the shadow pass stops running.
      const next = on && options.shadows;
      if (next === shadowsOn) return;
      shadowsOn = next;
      if (next) renderer.shadowMap.needsUpdate = true;
    },
    drawCalls: () => renderer.info.render.calls,
    dispose() {
      const textures = new Set<Texture>([boardTexture, atlasTexture, blobMap]);
      scene.traverse((object) => {
        const candidate = object as Mesh;
        if (candidate.isMesh !== true) return;
        candidate.geometry.dispose();
        const material = candidate.material;
        if (Array.isArray(material)) material.forEach((m) => m.dispose());
        else material.dispose();
      });
      for (const texture of textures) texture.dispose();
      key.shadow.map?.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
