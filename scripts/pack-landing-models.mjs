/**
 * Packs the Kenney models the landing world uses into one small file,
 * public/landing/town.bin, with the colours baked in and moved onto the
 * site's palette.
 *
 * Kenney models are textured from one shared palette image per kit
 * (Textures/colormap.png): every face points its UVs at a flat swatch. This
 * script reads each model, looks up each vertex's swatch, recolours it (no
 * red or yellow; Kenney's purple greys become the site's warm greys), and
 * writes plain vertex-coloured geometry, so the browser needs no textures and
 * the whole street can be merged into a couple of draw calls.
 *
 *   node scripts/pack-landing-models.mjs [--kenney <dir>] [--report]
 *
 * --kenney  where the unzipped kits live (default ../tools/kenney, one folder
 *           per kit, as downloaded from kenney.nl; see docs/landing-redo/ASSETS.md)
 * --report  print each part's colours by area instead of writing the file
 *
 * File format (little-endian):
 *   "SIK1", uint32 JSON length, JSON (padded to 4 bytes), then per part, each
 *   block padded to 4 bytes: positions Int16×3 (quantised to the part's
 *   bounds), normals Int8×3, colours Uint8×3 (sRGB), indices Uint16 or Uint32.
 *   The JSON maps part name → { vertices, indices, min, max, offset }.
 */

import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";

const args = process.argv.slice(2);
const flag = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
};
const ROOT = path.resolve(import.meta.dirname, "..");
const KENNEY = path.resolve(flag("--kenney") ?? path.join(ROOT, "..", "tools", "kenney"));
const REPORT = args.includes("--report");
const OUT = path.join(ROOT, "public", "landing", "town.bin.gz");

/* -------------------------------------------------------------------------- */
/* The palette Kenney's colours are moved onto: the site's tokens and the      */
/* muted everyday colours the landing world already used. No red, no yellow.   */

const P = {
  paper: "#fbfaf7",
  cream: "#f4f1ea",
  wall: "#ebe5d9",
  stone: "#ddd6c8",
  stoneDark: "#c9c1b0",
  warm1: "#b4ac9c",
  warm2: "#9a9283",
  warm3: "#7f786b",
  warm4: "#5f5a50",
  charcoal: "#3b3a34",
  ink: "#2a2925",
  navy: "#12395e",
  navyMid: "#1d4a74",
  navyLight: "#2c5c88",
  teal: "#0f5c55",
  tealMid: "#1e6f66",
  slate: "#5b6470",
  glass: "#a9bccb",
  glassDark: "#7d96aa",
  sage: "#8ba574",
  sageMid: "#76925f",
  sageDark: "#5f7c4d",
  trunk: "#8a6e52",
  trunkLight: "#a5876a",
  roofBrown: "#8d7f6c",
  roofSlate: "#6d737c",
  roofSlateLight: "#848a92",
  skin: "#d9a479",
  skinShade: "#bf8a5f",
  beige: "#b8a888",
};

// The colour a street brings: painted houses, leaves, cars. Blues, greens,
// teals and violets only, so it still keeps clear of red and yellow.
const Q = {
  leaf: "#7dbb63",
  leafMid: "#5a9e4f",
  leafDark: "#3f7f45",
  hedge: "#4f9150",
  bark: "#8a6248",
  barkLight: "#a8805e",
  wallSky: "#cfe1f0",
  wallMint: "#d3e9d6",
  wallLavender: "#ddd6ee",
  wallStone: "#e3e8ee",
  roofBlue: "#3d6591",
  roofTeal: "#2d7a70",
  roofPlum: "#5f557f",
  roofGreen: "#4b7f55",
  windowSky: "#8ec0e6",
  door: "#2c5c88",
  ocean: "#2f7fb8",
  violet: "#6c58b0",
  forest: "#3e8058",
  powder: "#86b9e0",
  fridge: "#2a9187",
  screen: "#79c7b2",
};

const TREE = {
  "#5bc588": Q.leaf,
  "#2d9772": Q.leafMid,
  "#228c6c": Q.leafDark,
  "#b76646": Q.bark,
  "#e89066": Q.barkLight,
};

// A house's white walls (and their shaded faces) painted, and its roof. The
// hedge is green too, so it is pinned before the roof's family takes it.
const house = (walls, roof) => ({
  swatches: { "#228c6c": Q.hedge },
  tints: [[0.7, 1, walls, "#fafafc"]],
  families: [[75, 170, roof, "#42ac7c"]],
});

/* -------------------------------------------------------------------------- */
/* What to pack.                                                               */
/*   pose      an animation whose first frame poses a rigged model             */
/*   keep      (centroid) => boolean, to keep only some of a model's faces      */
/*   swatches  exact colour → palette colour, on top of the kit's              */
/*   families  [fromHue, toHue, palette colour, reference colour]: every       */
/*             colourful swatch in that hue range becomes the palette colour,  */
/*             lighter or darker as the swatch is against the reference        */
/*   tints     [minL, maxL, palette colour, reference colour]: the same for    */
/*             Kenney's near-grey swatches in that lightness range              */

const PARTS = [
  { name: "wall", kit: "mini-shop", model: "wall" },
  { name: "wall-window", kit: "mini-shop", model: "wall-window" },
  { name: "wall-door", kit: "mini-shop", model: "wall-door-rotate" },
  {
    name: "till",
    kit: "mini-shop",
    model: "cash-register",
    keep: (c) => c[1] > 0.265 && c[0] > -0.1,
    families: [[20, 50, Q.screen, "#ffba4f"]],
  },
  { name: "fridge", kit: "mini-shop", model: "freezers-standing", tints: [[0.38, 0.62, Q.fridge, "#6a6b80"]] },
  {
    name: "employee",
    kit: "mini-shop",
    model: "character-employee",
    pose: "idle",
    families: [[0, 40, P.skin, "#e28b62"]],
  },
  { name: "house-a", kit: "city-kit-suburban", model: "building-type-a", ...house(Q.wallSky, Q.roofBlue) },
  { name: "house-c", kit: "city-kit-suburban", model: "building-type-c", ...house(Q.wallMint, Q.roofTeal) },
  { name: "house-g", kit: "city-kit-suburban", model: "building-type-g", ...house(Q.wallLavender, Q.roofPlum) },
  { name: "house-h", kit: "city-kit-suburban", model: "building-type-h", ...house(Q.wallStone, Q.roofGreen) },
  { name: "tree-large", kit: "city-kit-suburban", model: "tree-large", swatches: TREE },
  { name: "tree-small", kit: "city-kit-suburban", model: "tree-small", swatches: TREE },
  { name: "sedan", kit: "car-kit", model: "sedan", families: [[0, 40, Q.ocean, "#e96247"]] },
  { name: "hatchback", kit: "car-kit", model: "hatchback-sports", families: [[75, 170, Q.violet, "#5ac487"]] },
  { name: "suv", kit: "car-kit", model: "suv", families: [[75, 170, Q.forest, "#43ac7c"]] },
  { name: "van", kit: "car-kit", model: "van", families: [[200, 250, Q.powder, "#658ed6"]] },
  { name: "road", kit: "city-kit-roads", model: "road-straight" },
  { name: "road-driveway", kit: "city-kit-roads", model: "road-driveway-single" },
  { name: "light", kit: "city-kit-roads", model: "light-curved" },
];

/* -------------------------------------------------------------------------- */
/* Recolouring.                                                                 */

// Exact swatches, per kit, from --report. Anything not listed (and not in a
// part's families) goes through `generic` below.
const SWATCHES = {
  "mini-shop": {
    // Walls: cream above a navy band (Kenney's green) and a stone plinth.
    "#65657a": P.wall,
    "#82879d": P.stoneDark,
    "#77798f": P.stone,
    "#696a7f": P.warm2,
    "#6b6c81": P.warm2,
    "#43ac7c": P.navyMid,
    "#5ac487": P.navyLight,
    "#e2e2ed": P.paper,
    // Glass.
    "#f4f7ff": P.glass,
    "#a0a8c9": P.glassDark,
    "#bcc4ec": P.glass,
    "#b9c2ea": P.glass,
    "#b8c0e8": P.glass,
    "#b5bee5": P.glass,
    "#afb7dd": P.glassDark,
    // The employee's uniform greens.
    "#4bb580": P.navyLight,
    "#45ae7d": P.navyMid,
    "#20896b": P.navy,
    "#2e9872": P.navyMid,
    "#28916f": P.navy,
    "#319a74": P.navyMid,
    "#48b27f": P.navyLight,
    "#b66545": "#4a3527",
    "#bd6c4a": "#553c2b",
  },
  "city-kit-suburban": {
    // Roofs: muted slate instead of Kenney green.
    "#42ac7c": P.roofSlate,
    "#5bc588": P.roofSlateLight,
    "#57c286": P.roofSlateLight,
    "#47b17e": P.roofSlate,
    "#3da77a": P.roofSlate,
    "#53be84": P.roofSlateLight,
    // Hedges and lawns.
    "#228c6c": Q.hedge,
    // Doors and planters.
    "#d57f59": Q.door,
    // Windows.
    "#a5c6f0": Q.windowSky,
    "#8fb4e8": Q.windowSky,
    "#719cdd": Q.windowSky,
    // Trees.
    "#2d9772": P.sageMid,
    "#b76646": P.trunk,
    "#e89066": P.trunkLight,
  },
  "car-kit": {
    "#d4ecff": P.glass,
    "#ddf0ff": P.glass,
    "#fafdff": P.glass,
    "#f9fcff": P.glass,
    "#f8fcff": P.glass,
    "#f5fbff": P.glass,
    "#f3faff": P.glass,
  },
  "city-kit-roads": {
    "#7d829c": "#a8a296",
    "#666b80": "#8f897d",
    "#515566": "#6f6a5f",
    "#bdc6ee": P.cream,
    "#8e95b3": P.stoneDark,
    "#ffffff": P.paper,
  },
};

function hsl([r, g, b]) {
  const R = r / 255;
  const G = g / 255;
  const B = b / 255;
  const max = Math.max(R, G, B);
  const min = Math.min(R, G, B);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h;
  if (max === R) h = (G - B) / d + (G < B ? 6 : 0);
  else if (max === G) h = (B - R) / d + 2;
  else h = (R - G) / d + 4;
  return [h * 60, s, l];
}

function rgbFromHsl(h, s, l) {
  const k = (n) => (n + h / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0), f(8), f(4)].map((v) => Math.round(Math.max(0, Math.min(1, v)) * 255));
}

const hex = (c) => `#${c.map((v) => v.toString(16).padStart(2, "0")).join("")}`;
const fromHex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));

/** Calm a Kenney colour onto the site palette. */
function generic(rgb) {
  const [h, s, l] = hsl(rgb);
  const chroma = (Math.max(...rgb) - Math.min(...rgb)) / 255;
  // Greys and Kenney's lavender greys: warm, low-chroma greys of the same lightness.
  if (chroma < 0.24 && (s < 0.22 || (h >= 190 && h <= 290))) return rgbFromHsl(40, 0.1, Math.min(0.97, l * 1.02 + 0.03));
  // Greens: muted sage.
  if (h >= 75 && h < 170) return rgbFromHsl(100 + (h - 120) * 0.2, Math.min(0.24, s * 0.45), l * 0.95);
  // Teals and blues: the site's slate blue.
  if (h >= 170 && h < 290) return rgbFromHsl(210, Math.min(0.32, s * 0.5), Math.min(0.62, l));
  // Reds, oranges, yellows, pinks: no. Warm clay browns instead.
  return rgbFromHsl(28, Math.min(0.3, s * 0.4), Math.min(0.62, Math.max(0.36, l * 0.85)));
}

function recolor(part, rgb) {
  const key = hex(rgb);
  const own = part.swatches?.[key];
  if (own !== undefined) return fromHex(own);
  const [h, s, l] = hsl(rgb);
  // Saturation alone calls near-white glass "colourful"; chroma does not.
  const chroma = (Math.max(...rgb) - Math.min(...rgb)) / 255;
  const shade = (target, reference) => {
    const [th, ts, tl] = hsl(fromHex(target));
    const ratio = l / hsl(fromHex(reference))[2];
    return rgbFromHsl(th, ts, Math.min(0.95, tl * ratio));
  };
  for (const [from, to, target, reference] of part.families ?? []) {
    if (s < 0.25 || chroma < 0.15 || h < from || h >= to) continue;
    return shade(target, reference);
  }
  // tints [minL, maxL, colour, reference]: Kenney's near-greys in that
  // lightness range take the colour, lighter or darker as against the reference.
  for (const [low, high, target, reference] of part.tints ?? []) {
    if (chroma > 0.16 || l < low || l > high) continue;
    return shade(target, reference);
  }
  const kit = SWATCHES[part.kit]?.[key];
  return kit === undefined ? generic(rgb) : fromHex(kit);
}

/* -------------------------------------------------------------------------- */
/* PNG (8-bit RGB, RGBA or palette, non-interlaced: what Kenney ships).          */

function readPng(file) {
  const buf = fs.readFileSync(file);
  let offset = 8;
  let width = 0;
  let height = 0;
  let type = 0;
  let palette = null;
  let alpha = null;
  const data = [];
  while (offset < buf.length) {
    const length = buf.readUInt32BE(offset);
    const kind = buf.toString("ascii", offset + 4, offset + 8);
    const body = buf.subarray(offset + 8, offset + 8 + length);
    if (kind === "IHDR") {
      width = body.readUInt32BE(0);
      height = body.readUInt32BE(4);
      if (body[8] !== 8 || body[12] !== 0) throw new Error(`${file}: only 8-bit non-interlaced PNGs`);
      type = body[9];
    } else if (kind === "PLTE") palette = body;
    else if (kind === "tRNS") alpha = body;
    else if (kind === "IDAT") data.push(body);
    offset += 12 + length;
  }
  const channels = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[type];
  const raw = zlib.inflateSync(Buffer.concat(data));
  const stride = width * channels;
  const pixels = Buffer.alloc(height * stride);
  for (let y = 0; y < height; y += 1) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    for (let x = 0; x < stride; x += 1) {
      const a = x >= channels ? pixels[y * stride + x - channels] : 0;
      const b = y > 0 ? pixels[(y - 1) * stride + x] : 0;
      const c = x >= channels && y > 0 ? pixels[(y - 1) * stride + x - channels] : 0;
      let v = line[x];
      if (filter === 1) v += a;
      else if (filter === 2) v += b;
      else if (filter === 3) v += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a);
        const pb = Math.abs(p - b);
        const pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      pixels[y * stride + x] = v & 255;
    }
  }
  return {
    width,
    height,
    /** sRGB colour at (u, v) in glTF texture space (origin top left). */
    at(u, v) {
      const x = Math.min(width - 1, Math.floor((((u % 1) + 1) % 1) * width));
      const y = Math.min(height - 1, Math.floor((((v % 1) + 1) % 1) * height));
      const i = (y * width + x) * channels;
      if (type === 3) return [palette[pixels[i] * 3], palette[pixels[i] * 3 + 1], palette[pixels[i] * 3 + 2]];
      if (type === 0 || type === 4) return [pixels[i], pixels[i], pixels[i]];
      return [pixels[i], pixels[i + 1], pixels[i + 2]];
    },
    alpha,
  };
}

/* -------------------------------------------------------------------------- */
/* Small 4×4 maths (column-major, like glTF).                                   */

function compose(t = [0, 0, 0], r = [0, 0, 0, 1], s = [1, 1, 1]) {
  const [x, y, z, w] = r;
  const m = new Float64Array(16);
  m[0] = (1 - 2 * (y * y + z * z)) * s[0];
  m[1] = 2 * (x * y + z * w) * s[0];
  m[2] = 2 * (x * z - y * w) * s[0];
  m[4] = 2 * (x * y - z * w) * s[1];
  m[5] = (1 - 2 * (x * x + z * z)) * s[1];
  m[6] = 2 * (y * z + x * w) * s[1];
  m[8] = 2 * (x * z + y * w) * s[2];
  m[9] = 2 * (y * z - x * w) * s[2];
  m[10] = (1 - 2 * (x * x + y * y)) * s[2];
  m[12] = t[0];
  m[13] = t[1];
  m[14] = t[2];
  m[15] = 1;
  return m;
}

function multiply(a, b) {
  const m = new Float64Array(16);
  for (let c = 0; c < 4; c += 1) {
    for (let r = 0; r < 4; r += 1) {
      let v = 0;
      for (let k = 0; k < 4; k += 1) v += a[k * 4 + r] * b[c * 4 + k];
      m[c * 4 + r] = v;
    }
  }
  return m;
}

const point = (m, p) => [0, 1, 2].map((r) => m[r] * p[0] + m[4 + r] * p[1] + m[8 + r] * p[2] + m[12 + r]);
const vector = (m, p) => [0, 1, 2].map((r) => m[r] * p[0] + m[4 + r] * p[1] + m[8 + r] * p[2]);
const normalize = (v) => {
  const l = Math.hypot(v[0], v[1], v[2]) || 1;
  return [v[0] / l, v[1] / l, v[2] / l];
};

/* -------------------------------------------------------------------------- */
/* glTF binary.                                                                 */

function readGlb(file) {
  const buf = fs.readFileSync(file);
  const jsonLength = buf.readUInt32LE(12);
  const gltf = JSON.parse(buf.subarray(20, 20 + jsonLength).toString("utf8"));
  const binStart = 20 + jsonLength + 8;
  const bin = buf.subarray(binStart, binStart + buf.readUInt32LE(20 + jsonLength));
  const SIZES = { SCALAR: 1, VEC2: 2, VEC3: 3, VEC4: 4, MAT4: 16 };
  const READ = {
    5120: [1, (o) => bin.readInt8(o), 127],
    5121: [1, (o) => bin.readUInt8(o), 255],
    5122: [2, (o) => bin.readInt16LE(o), 32767],
    5123: [2, (o) => bin.readUInt16LE(o), 65535],
    5125: [4, (o) => bin.readUInt32LE(o), 1],
    5126: [4, (o) => bin.readFloatLE(o), 1],
  };
  function accessor(index) {
    const a = gltf.accessors[index];
    const view = gltf.bufferViews[a.bufferView];
    const size = SIZES[a.type];
    const [bytes, read, max] = READ[a.componentType];
    const stride = view.byteStride ?? bytes * size;
    const start = (view.byteOffset ?? 0) + (a.byteOffset ?? 0);
    const out = [];
    for (let i = 0; i < a.count; i += 1) {
      const item = [];
      for (let k = 0; k < size; k += 1) {
        const v = read(start + i * stride + k * bytes);
        item.push(a.normalized ? v / max : v);
      }
      out.push(item);
    }
    return out;
  }
  return { gltf, accessor };
}

/** Every triangle of a model, posed and in model space, with sRGB colours. */
function loadModel(part) {
  const dir = path.join(KENNEY, part.kit, "Models", "GLB format");
  const { gltf, accessor } = readGlb(path.join(dir, `${part.model}.glb`));
  const colormap = readPng(path.join(dir, "Textures", "colormap.png"));

  // Local transforms, optionally replaced by the first frame of an animation.
  const local = gltf.nodes.map((n) => ({ t: n.translation, r: n.rotation, s: n.scale, m: n.matrix }));
  if (part.pose !== undefined) {
    const animation = (gltf.animations ?? []).find((a) => a.name === part.pose);
    if (animation === undefined) throw new Error(`${part.model}: no animation ${part.pose}`);
    for (const channel of animation.channels) {
      const sampler = animation.samplers[channel.sampler];
      const value = accessor(sampler.output)[0];
      const key = { translation: "t", rotation: "r", scale: "s" }[channel.target.path];
      if (key !== undefined) local[channel.target.node][key] = value;
    }
  }
  const world = new Array(gltf.nodes.length);
  const walk = (index, parent) => {
    const l = local[index];
    const m = l.m !== undefined ? Float64Array.from(l.m) : compose(l.t, l.r, l.s);
    world[index] = multiply(parent, m);
    for (const child of gltf.nodes[index].children ?? []) walk(child, world[index]);
  };
  for (const root of gltf.scenes[gltf.scene ?? 0].nodes) walk(root, compose());

  const positions = [];
  const normals = [];
  const colors = [];
  gltf.nodes.forEach((node, nodeIndex) => {
    if (node.mesh === undefined) return;
    const skin = node.skin === undefined ? null : gltf.skins[node.skin];
    const jointMatrices = skin === null ? null : (() => {
      const inverse = accessor(skin.inverseBindMatrices);
      return skin.joints.map((joint, i) => multiply(world[joint], Float64Array.from(inverse[i])));
    })();
    for (const primitive of gltf.meshes[node.mesh].primitives) {
      if ((primitive.mode ?? 4) !== 4) continue;
      const material = gltf.materials[primitive.material ?? 0];
      const textured = material?.pbrMetallicRoughness?.baseColorTexture !== undefined;
      const factor = material?.pbrMetallicRoughness?.baseColorFactor ?? [1, 1, 1, 1];
      const flat = factor.slice(0, 3).map((v) => Math.round(255 * (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055)));
      const pos = accessor(primitive.attributes.POSITION);
      const nrm = primitive.attributes.NORMAL === undefined ? null : accessor(primitive.attributes.NORMAL);
      const uv = textured && primitive.attributes.TEXCOORD_0 !== undefined ? accessor(primitive.attributes.TEXCOORD_0) : null;
      const joints = jointMatrices === null ? null : accessor(primitive.attributes.JOINTS_0);
      const weights = jointMatrices === null ? null : accessor(primitive.attributes.WEIGHTS_0);
      const index = primitive.indices === undefined ? pos.map((_, i) => [i]) : accessor(primitive.indices);
      const place = (i) => {
        if (jointMatrices === null) {
          return { p: point(world[nodeIndex], pos[i]), n: nrm === null ? null : normalize(vector(world[nodeIndex], nrm[i])) };
        }
        const p = [0, 0, 0];
        const n = [0, 0, 0];
        for (let k = 0; k < 4; k += 1) {
          const w = weights[i][k];
          if (w === 0) continue;
          const m = jointMatrices[joints[i][k]];
          const pp = point(m, pos[i]);
          const nn = nrm === null ? [0, 0, 0] : vector(m, nrm[i]);
          for (let c = 0; c < 3; c += 1) {
            p[c] += w * pp[c];
            n[c] += w * nn[c];
          }
        }
        return { p, n: nrm === null ? null : normalize(n) };
      };
      for (let t = 0; t + 2 < index.length; t += 3) {
        for (let k = 0; k < 3; k += 1) {
          const i = index[t + k][0];
          const { p, n } = place(i);
          positions.push(p);
          normals.push(n);
          colors.push(uv === null ? flat : colormap.at(uv[i][0], uv[i][1]));
        }
      }
    }
  });
  // Faces without normals get flat ones.
  for (let t = 0; t < positions.length; t += 3) {
    if (normals[t] !== null) continue;
    const [a, b, c] = [positions[t], positions[t + 1], positions[t + 2]];
    const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
    const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
    const n = normalize([u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]]);
    normals[t] = normals[t + 1] = normals[t + 2] = n;
  }
  return { positions, normals, colors };
}

/* -------------------------------------------------------------------------- */

function area(a, b, c) {
  const u = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
  const v = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
  return Math.hypot(u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]) / 2;
}

const pad4 = (n) => (n + 3) & ~3;

const blocks = [];
const index = {};
let offset = 0;
let totalVertices = 0;
let totalTriangles = 0;

for (const part of PARTS) {
  const model = loadModel(part);
  if (part.keep !== undefined) {
    const kept = { positions: [], normals: [], colors: [] };
    for (let t = 0; t < model.positions.length; t += 3) {
      const triangle = model.positions.slice(t, t + 3);
      const centroid = [0, 1, 2].map((k) => (triangle[0][k] + triangle[1][k] + triangle[2][k]) / 3);
      if (!part.keep(centroid)) continue;
      for (const key of ["positions", "normals", "colors"]) kept[key].push(...model[key].slice(t, t + 3));
    }
    Object.assign(model, kept);
  }
  if (REPORT) {
    const byColor = new Map();
    let total = 0;
    for (let t = 0; t < model.positions.length; t += 3) {
      const a = area(model.positions[t], model.positions[t + 1], model.positions[t + 2]);
      const key = hex(model.colors[t]);
      byColor.set(key, (byColor.get(key) ?? 0) + a);
      total += a;
    }
    const top = [...byColor.entries()].sort((a, b) => b[1] - a[1]).filter(([, a]) => a / total > 0.005);
    console.log(`${part.name.padEnd(14)} ${top.map(([c, a]) => `${c}→${hex(recolor(part, fromHex(c)))} ${Math.round((100 * a) / total)}%`).join("  ")}`);
    continue;
  }

  // Recolour, then share identical vertices.
  const min = [Infinity, Infinity, Infinity];
  const max = [-Infinity, -Infinity, -Infinity];
  for (const p of model.positions) {
    for (let k = 0; k < 3; k += 1) {
      min[k] = Math.min(min[k], p[k]);
      max[k] = Math.max(max[k], p[k]);
    }
  }
  const quant = (v, k) => Math.round(((v - min[k]) / Math.max(max[k] - min[k], 1e-6)) * 65535 - 32768);
  const seen = new Map();
  const qPos = [];
  const qNrm = [];
  const qCol = [];
  const indices = [];
  model.positions.forEach((p, i) => {
    const pos = p.map(quant);
    const nrm = model.normals[i].map((v) => Math.round(v * 127));
    const col = recolor(part, model.colors[i]);
    const key = `${pos}|${nrm}|${col}`;
    let id = seen.get(key);
    if (id === undefined) {
      id = qPos.length / 3;
      seen.set(key, id);
      qPos.push(...pos);
      qNrm.push(...nrm);
      qCol.push(...col);
    }
    indices.push(id);
  });
  const vertices = qPos.length / 3;
  const wide = vertices > 65535;
  const posBytes = Buffer.from(Int16Array.from(qPos).buffer);
  const nrmBytes = Buffer.from(Int8Array.from(qNrm).buffer);
  const colBytes = Buffer.from(Uint8Array.from(qCol).buffer);
  const idxBytes = Buffer.from((wide ? Uint32Array : Uint16Array).from(indices).buffer);
  const block = Buffer.alloc(pad4(posBytes.length) + pad4(nrmBytes.length) + pad4(colBytes.length) + pad4(idxBytes.length));
  let at = 0;
  for (const bytes of [posBytes, nrmBytes, colBytes, idxBytes]) {
    bytes.copy(block, at);
    at += pad4(bytes.length);
  }
  index[part.name] = {
    vertices,
    indices: indices.length,
    min: min.map((v) => +v.toFixed(5)),
    max: max.map((v) => +v.toFixed(5)),
    offset,
  };
  blocks.push(block);
  offset += block.length;
  totalVertices += vertices;
  totalTriangles += indices.length / 3;
  const size = max.map((v, k) => (v - min[k]).toFixed(2)).join("×");
  console.log(`${part.name.padEnd(14)} ${String(indices.length / 3).padStart(5)} tri ${String(vertices).padStart(5)} vert  ${size}  y ${min[1].toFixed(2)}..${max[1].toFixed(2)}`);
}

if (!REPORT) {
  const json = Buffer.from(JSON.stringify({ parts: index }), "utf8");
  const jsonPadded = Buffer.alloc(pad4(json.length), 0x20);
  json.copy(jsonPadded);
  const header = Buffer.alloc(8);
  header.write("SIK1", 0, "ascii");
  header.writeUInt32LE(jsonPadded.length, 4);
  const file = Buffer.concat([header, jsonPadded, ...blocks]);
  // Stored gzipped: the browser unpacks it (see src/components/landing/world/parts.ts).
  const gz = zlib.gzipSync(file, { level: 9 });
  fs.writeFileSync(OUT, gz);
  console.log(`\n${path.relative(ROOT, OUT)}: ${totalTriangles} triangles, ${totalVertices} vertices, ${Math.round(file.length / 1024)} KB, ${Math.round(gz.length / 1024)} KB gzipped`);
}
