/**
 * The landing world: one world, one camera.
 *
 * A single three.js scene holds everything the story visits: a sandwich on a
 * tray, the counter and price board behind it, the restaurant around them, a
 * street of restaurants, and the national dot map. One camera moves through it
 * as a pure function of a "beat" number (0 = macro sandwich, 5 = map settled
 * to one side), so any scroll position can be drawn on its own and nothing
 * depends on how fast the reader scrolled.
 *
 * Budget decisions, all for phones:
 * - Static geometry is baked into a few vertex-coloured meshes (one draw call
 *   for the whole interior, one for the street, one for the other buildings,
 *   one for 3,862 map columns). About 17 draw calls in total.
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
  ConeGeometry,
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
  SphereGeometry,
  SRGBColorSpace,
  Texture,
  Vector3,
  WebGLRenderer,
} from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { mergeGeometries, mergeVertices } from "three/addons/utils/BufferGeometryUtils.js";

import { buildPerson, COLORS } from "./people";
import { loadPriceMap, priceTier, type PriceMap, type PriceMapScale } from "@/lib/landing-map";
import { formatCents } from "@/lib/money";

/* -------------------------------------------------------------------------- */
/* Palette: the site's tokens where they exist, muted everyday colours where not. */

const C = {
  paper: "#fbfaf7",
  ground: "#ece7dc",
  groundEdge: "#ddd6c8",
  wall: "#ebe5d9",
  wallOuter: "#e3dccd",
  plinth: "#c9c1b0",
  floor: "#d8d0bf",
  wainscot: "#b9c4be",
  roof: "#d2cab9",
  roofTrim: "#bdb3a0",
  fascia: COLORS.accent,
  glass: "#3f5d79",
  door: "#2f3a45",
  canopy: COLORS.slate,
  counter: COLORS.accent,
  counterTop: "#f4f1ea",
  steel: COLORS.steel,
  steelDark: "#77736a",
  charcoal: COLORS.charcoal,
  road: "#a39e92",
  lane: "#f4f1ea",
  lot: "#e2dbcc",
  tree: "#86a070",
  treeDark: "#71905e",
  trunk: "#8a6e52",
  house: "#e8e1d3",
  houseRoof: "#9a8f7c",
  tray: COLORS.slate,
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
const BOARD_Z = -BD / 2 + 0.25 + 0.13;
const POLE_HEIGHT = 6.2;
const TAG_W = 4.6;
const TAG_H = 3.0;

/* -------------------------------------------------------------------------- */
/* Building helpers: build with ordinary meshes, then bake to one geometry.     */

type V3 = readonly [number, number, number];

class Kit {
  readonly root = new Group();
  private readonly materials = new Map<string, MeshLambertMaterial>();

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

  sphere(r: number, color: string, at: V3, scale: V3 = [1, 1, 1]): Mesh {
    const result = this.add(new SphereGeometry(r, 14, 10), color, at);
    result.scale.set(scale[0], scale[1], scale[2]);
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
    if (candidate.isMesh !== true) return;
    candidate.geometry.dispose();
    const material = candidate.material;
    if (Array.isArray(material)) material.forEach((m) => m.dispose());
    else material.dispose();
  });
}

/** Every mesh under `root`, transformed and vertex-coloured, as one geometry. */
function bake(root: Object3D): BufferGeometry {
  root.updateMatrixWorld(true);
  const parts: BufferGeometry[] = [];
  root.traverse((object) => {
    const candidate = object as Mesh;
    if (candidate.isMesh !== true || !candidate.visible) return;
    const source = candidate.geometry.index !== null ? candidate.geometry.toNonIndexed() : candidate.geometry.clone();
    if (source.getAttribute("normal") === undefined) source.computeVertexNormals();
    source.applyMatrix4(candidate.matrixWorld);
    const part = new BufferGeometry();
    part.setAttribute("position", source.getAttribute("position"));
    part.setAttribute("normal", source.getAttribute("normal"));
    const material = (Array.isArray(candidate.material) ? candidate.material[0] : candidate.material) as Material & {
      color?: Color;
    };
    const color = material.color ?? new Color(C.ink);
    const count = part.getAttribute("position").count;
    const colors = new Float32Array(count * 3);
    for (let i = 0; i < count; i += 1) {
      colors[i * 3] = color.r;
      colors[i * 3 + 1] = color.g;
      colors[i * 3 + 2] = color.b;
    }
    part.setAttribute("color", new BufferAttribute(colors, 3));
    parts.push(part);
  });
  const merged = mergeGeometries(parts, false);
  for (const part of parts) part.dispose();
  if (merged === null) throw new Error("bake: nothing to merge");
  merged.computeBoundingSphere();
  return merged;
}

/* -------------------------------------------------------------------------- */
/* Pieces of the world.                                                         */

/** Back and side walls, floor, counter, kitchen, board frame, cashier, tray. */
function buildInterior(kit: Kit): void {
  const t = 0.25;
  kit.box(BW, 0.24, BD, C.floor, [0, -0.1, 0]);
  kit.box(BW, BH, t, C.wall, [0, BH / 2, -BD / 2 + t / 2]);
  kit.box(t, BH, BD, C.wall, [-BW / 2 + t / 2, BH / 2, 0]);
  kit.box(t, BH, BD, C.wall, [BW / 2 - t / 2, BH / 2, 0]);
  // Outer skin a shade darker, so the shell reads from outside.
  kit.box(BW + 0.04, 0.5, BD + 0.04, C.plinth, [0, 0.25, 0]);
  kit.box(BW - 2 * t, 0.9, 0.04, C.wainscot, [0, 0.45, -BD / 2 + t + 0.02]);
  // Board frame on the back wall; the face is a separate textured plane.
  kit.box(3.7, 1.5, 0.12, C.charcoal, [0, BOARD_Y, -BD / 2 + t + 0.06], 0.04);
  // Two plain side panels either side of the board.
  kit.box(1.4, 1.1, 0.08, C.board, [-2.75, BOARD_Y, -BD / 2 + t + 0.04], 0.03);
  kit.box(1.4, 1.1, 0.08, C.board, [2.75, BOARD_Y, -BD / 2 + t + 0.04], 0.03);
  // Front counter.
  kit.box(6, 1.0, 0.8, C.counter, [0, 0.5, COUNTER_Z], 0.05);
  kit.box(6.2, 0.07, 0.98, C.counterTop, [0, COUNTER_TOP - 0.035, COUNTER_Z], 0.03);
  // Register.
  kit.box(0.55, 0.22, 0.42, C.charcoal, [1.9, COUNTER_TOP + 0.11, COUNTER_Z - 0.1], 0.04);
  kit.box(0.46, 0.32, 0.04, C.door, [1.9, COUNTER_TOP + 0.4, COUNTER_Z - 0.2], 0.02, [-0.35, 0, 0]);
  // Kitchen behind.
  kit.box(8.6, 0.95, 0.7, C.steel, [0, 0.475, -BD / 2 + t + 0.4], 0.04);
  kit.box(1.0, 1.15, 0.75, C.steelDark, [-3.3, 0.575, -BD / 2 + t + 0.42], 0.05);
  kit.box(1.0, 1.15, 0.75, C.steelDark, [-2.2, 0.575, -BD / 2 + t + 0.42], 0.05);
  for (let i = 0; i < 5; i += 1) {
    kit.cylinder(0.11, 0.08, 0.3, C.cup, [1.2 + i * 0.3, 0.95 + 0.15, -BD / 2 + t + 0.35], 10);
  }
  // Tray, liner.
  kit.box(1.15, 0.05, 0.78, C.tray, [-0.05, COUNTER_TOP + 0.025, -0.78], 0.02);
  kit.box(0.98, 0.008, 0.62, C.liner, [-0.05, TRAY_TOP - 0.002, -0.78]);
  // The cashier.
  const person = buildPerson({ outfit: COLORS.slate, skin: COLORS.skins[2], hair: COLORS.hair[1] });
  person.root.position.set(1.7, 0, -1.75);
  person.leftArm.rotation.x = -0.35;
  person.rightArm.rotation.x = -0.5;
  kit.root.add(person.root);
  kit.box(0.58, 0.14, 0.5, C.charcoal, [1.7, 1.86, -1.7], 0.06);
}

/** Front wall, windows, door, fascia and canopy, from y = 0 so it can grow. */
function buildFront(kit: Kit): void {
  const z = BD / 2 - 0.12;
  kit.box(BW, 0.6, 0.25, C.plinth, [0, 0.3, z]);
  kit.box(BW - 0.3, 2.0, 0.12, C.glass, [0, 1.6, z]);
  for (const x of [-3.4, -1.2, 3.6]) kit.box(0.14, 2.0, 0.2, C.wallOuter, [x, 1.6, z + 0.02]);
  kit.box(1.5, 2.3, 0.18, C.door, [1.2, 1.15, z + 0.06]);
  kit.box(0.25, BH, 0.27, C.wallOuter, [-BW / 2 + 0.12, BH / 2, z]);
  kit.box(0.25, BH, 0.27, C.wallOuter, [BW / 2 - 0.12, BH / 2, z]);
  kit.box(BW + 0.3, 0.85, 0.45, C.fascia, [0, BH - 0.3, z + 0.1], 0.06);
  kit.box(BW + 0.6, 0.12, 1.4, C.canopy, [0, 2.65, z + 0.75], 0.04);
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
  kit.box(BW, BH, BD, C.wallOuter, [0, BH / 2, 0]);
  kit.box(BW + 0.04, 0.5, BD + 0.04, C.plinth, [0, 0.25, 0]);
  buildFront(kit);
  buildRoof(kit);
}

function buildTree(kit: Kit): void {
  kit.cylinder(0.22, 0.3, 1.8, C.trunk, [0, 0.9, 0], 8);
  kit.sphere(1.45, C.tree, [0, 2.7, 0], [1, 0.95, 1]);
  kit.sphere(0.95, C.treeDark, [0.7, 2.2, 0.5]);
}

function buildGround(kit: Kit, poleSites: readonly number[]): void {
  // Platform: top at y = 0.
  kit.box(126, 0.8, 54, C.ground, [9, -0.4, 10], 0.35);
  kit.box(126.6, 0.5, 54.6, C.groundEdge, [9, -0.7, 10], 0.2);
  // Road and lane marks.
  kit.box(126, 0.04, 7, C.road, [9, 0.02, 13.5]);
  for (let x = -50; x <= 68; x += 7) kit.box(3, 0.02, 0.28, C.lane, [x, 0.05, 13.5]);
  // Car parks in front of each restaurant.
  for (const x of SITES) kit.box(BW + 1.5, 0.03, 5.2, C.lot, [x, 0.015, BD / 2 + 2.9]);
  // Houses across the road.
  for (const x of [-34, -8, 22, 50]) {
    kit.box(7, 2.6, 6, C.house, [x, 1.3, 26], 0.08);
    kit.add(new ConeGeometry(5.3, 2.2, 4), C.houseRoof, [x, 3.7, 26], [0, Math.PI / 4, 0]).scale.set(1, 1, 0.86);
    kit.box(1.1, 1.7, 0.12, C.door, [x + 1.4, 0.85, 29.02]);
  }
  // A few parked and passing cars.
  const cars: { x: number; z: number; color: string; turn: number }[] = [
    { x: -21, z: 7.4, color: COLORS.teal, turn: 0 },
    { x: 15, z: 7.4, color: COLORS.accent, turn: 0 },
    { x: 37.5, z: 7.4, color: C.steel, turn: 0 },
    { x: -6, z: 12, color: COLORS.slate, turn: Math.PI / 2 },
    { x: 27, z: 15, color: "#a59a86", turn: Math.PI / 2 },
  ];
  for (const car of cars) {
    const group = new Group();
    group.position.set(car.x, 0, car.z);
    group.rotation.y = car.turn;
    kit.root.add(group);
    kit.add(new RoundedBoxGeometry(1.9, 0.8, 3.8, 2, 0.25), car.color, [0, 0.62, 0], [0, 0, 0], group);
    kit.add(new RoundedBoxGeometry(1.6, 0.6, 2.0, 2, 0.22), "#d9dfe2", [0, 1.2, -0.2], [0, 0, 0], group);
    for (const [wx, wz] of [
      [-0.9, 1.2],
      [0.9, 1.2],
      [-0.9, -1.2],
      [0.9, -1.2],
    ] as const) {
      kit.add(new CylinderGeometry(0.34, 0.34, 0.26, 10), C.charcoal, [wx, 0.34, wz], [0, 0, Math.PI / 2], group);
    }
  }
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

function drawBoard(canvas: HTMLCanvasElement, cents: number | null, font: string): void {
  const context = canvas.getContext("2d")!;
  const { width: W, height: H } = canvas;
  context.fillStyle = C.board;
  context.fillRect(0, 0, W, H);
  context.fillStyle = "#c9c4b6";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.font = `500 44px ${font}`;
  context.fillText("CHICKEN SANDWICH", W / 2, H * 0.24);
  context.fillStyle = C.paper;
  context.font = `500 200px ${font}`;
  context.fillText(cents === null ? "—" : formatCents(cents), W / 2, H * 0.64);
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
  /** Position everything for a beat (0..5). Pure: does not render. */
  update(beat: number): void;
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
  const [map, sandwich] = await Promise.all([loadPriceMap(), buildSandwich(loader)]);

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
    const kit = new Kit();
    buildGround(kit, [...tagged.map((t) => t.x), ...(heroPrice === null ? [] : [SITES[HERO]])]);
    const ground = new Mesh(kit.bake(), vertexColored);
    town.add(ground);
  }

  const interiorKit = new Kit();
  buildInterior(interiorKit);
  const interior = new Mesh(interiorKit.bake(), vertexColored);
  interior.receiveShadow = true;
  hero.add(interior);

  const frontKit = new Kit();
  buildFront(frontKit);
  const front = new Mesh(frontKit.bake(), vertexColored);
  hero.add(front);

  const roofKit = new Kit();
  buildRoof(roofKit);
  const roof = new Mesh(roofKit.bake(), vertexColored);
  hero.add(roof);

  hero.add(sandwich.group);
  if (sandwich.soda !== null) hero.add(sandwich.soda);

  // The other restaurants: one instanced draw call.
  const closedKit = new Kit();
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

  // Trees.
  const treeKit = new Kit();
  buildTree(treeKit);
  const treeSpots: [number, number, number][] = [
    [-44, -9, 1.1], [-29, -10, 0.9], [-11, -9.5, 1.2], [8, -10.5, 1], [27, -9, 1.15], [45, -10, 0.95], [62, -9.5, 1.1],
    [-46, 21, 1], [-21, 21.5, 0.9], [5, 21, 1.15], [36, 21.5, 1], [63, 21, 1.05], [-50, 31, 1.2], [70, 30, 1],
  ];
  const trees = new InstancedMesh(treeKit.bake(), vertexColored, treeSpots.length);
  {
    const matrix = new Matrix4();
    const q = new Quaternion();
    treeSpots.forEach(([x, z, s], i) => {
      matrix.compose(new Vector3(x, 0, z), q, new Vector3(s, s, s));
      trees.setMatrixAt(i, matrix);
    });
    trees.instanceMatrix.needsUpdate = true;
    trees.computeBoundingSphere();
  }
  town.add(trees);

  // Blob shadows, one draw call.
  const blobMap = blobTexture();
  const blobs: { x: number; y: number; z: number; w: number; d: number }[] = [
    { x: SANDWICH_AT.x, y: TRAY_TOP + 0.004, z: SANDWICH_AT.z, w: 0.82, d: 0.78 },
    { x: SODA_AT.x, y: TRAY_TOP + 0.004, z: SODA_AT.z, w: 0.42, d: 0.42 },
    { x: -0.05, y: COUNTER_TOP + 0.003, z: -0.78, w: 1.5, d: 1.05 },
    { x: 1.7, y: 0.03, z: -1.75, w: 1.2, d: 1.0 },
    ...SITES.map((x) => ({ x, y: 0.03, z: 0.6, w: BW + 4, d: BD + 3.5 })),
    ...treeSpots.map(([x, z, s]) => ({ x: x + 0.6, y: 0.035, z: z + 0.6, w: 4.2 * s, d: 4.2 * s })),
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
  drawBoard(boardCanvas, prices[0] ?? null, options.monoFont);
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

  function update(beat: number): void {
    const distance = placeCamera(beat);

    // 0 → 1: the sandwich comes apart into its layers and closes again.
    const open = Math.sin(Math.PI * clamp01((beat - 0.04) / 0.72));
    for (const layer of sandwich.layers) layer.mesh.position.y = layer.base + layer.lift * open;
    sandwich.group.rotation.y = -0.35 + 0.9 * span(beat, 0, 1.1);
    const sandwichBeat = Math.min(beat, 1.2);
    if (shadowsOn && sandwichBeat !== lastSandwichBeat) renderer.shadowMap.needsUpdate = true;
    lastSandwichBeat = sandwichBeat;

    // 0.45 → 1.8: the board steps from the cheapest real price to the dearest.
    if (prices.length > 0) {
      const index = Math.min(prices.length - 1, Math.floor(clamp01((beat - 0.45) / 1.35) * prices.length));
      if (index !== boardIndex) {
        boardIndex = index;
        drawBoard(boardCanvas, prices[index] ?? null, options.monoFont);
        boardTexture.needsUpdate = true;
        options.onBoardIndex?.(index);
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
