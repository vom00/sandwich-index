/**
 * The kitchen line on the landing page, as a three.js scene.
 *
 * Three cooks work a conveyor belt. The first lays down a bottom bun, the
 * second a chicken patty, the third the lettuce, mayo and top bun. A press at
 * the end pins a price flag into each finished sandwich, and it drops into a
 * paper bag. Every sandwich is built the same way, and every flag shows a
 * different price. That is the site's whole premise, so the animation carries
 * it rather than decorating around it.
 *
 * Everything is procedural: no model files, no textures except the price flags,
 * which are drawn on a canvas in the site's mono face. The style is soft clay in
 * an isometric view, in the site's own palette. There is no red or yellow
 * anywhere, for the same trade-dress reason as globals.css.
 *
 * All motion derives from one clock. The belt moves at a constant speed and
 * sandwiches are evenly spaced, so each station sees a sandwich arrive every
 * `PERIOD` seconds and each cook's movement is a pure function of where the
 * next sandwich is. Nothing drifts out of step, and any moment can be rendered
 * on its own, which is how the reduced-motion still is drawn.
 */

import {
  CanvasTexture,
  CapsuleGeometry,
  CatmullRomCurve3,
  Color,
  CylinderGeometry,
  Group,
  LatheGeometry,
  Mesh,
  MeshStandardMaterial,
  type Object3D,
  PlaneGeometry,
  SphereGeometry,
  SRGBColorSpace,
  TubeGeometry,
  Vector2,
  Vector3,
} from "three";

import {
  clamp01,
  clay,
  type ClaySceneController,
  createStage,
  easeOutBack,
  easeOutCubic,
  mesh,
  mod,
  roundedBox,
  runScene,
  type SceneOptions,
  span,
} from "./stage";

/* -------------------------------------------------------------------------- */
/* Palette. The site's tokens where they exist; food colours where they don't. */

const COLORS = {
  platform: "#ece7dc",
  platformEdge: "#ddd8cc",
  beltFrame: "#3b3a34",
  beltSurface: "#24231f",
  beltSlat: "#4a4842",
  roller: "#6b675b",
  steel: "#8e8a7e",
  kraft: "#c9a87b",
  kraftDark: "#a9875b",
  accent: "#12395e",
  teal: "#0f5c55",
  maroon: "#7b2d3b",
  apron: "#fbfaf7",
  ink: "#15140f",
  bun: "#d79a5b",
  bunTop: "#c8843f",
  patty: "#b8762c",
  pattyCrust: "#9c5f1e",
  lettuce: "#86b85a",
  mayo: "#f4efe2",
  toothpick: "#d8c39a",
  skins: ["#f0c9a2", "#9a6141", "#d39a6c"],
} as const;

/* -------------------------------------------------------------------------- */
/* Timing and layout. World units; the belt runs along +x.                     */

const BELT_SPEED = 0.78;
const SPACING = 2.3;
export const PERIOD = SPACING / BELT_SPEED;

const BELT_START = -5.6;
const BELT_END = 5.05;
const BELT_TOP = 0.78;
const WORKER_Z = -1.12;

/** Where each layer joins the stack, and which cook adds it. */
const STATIONS = [
  { x: -3.6, worker: 0 },
  { x: -1.25, worker: 1 },
  { x: 1.1, worker: 2 },
] as const;
const PRESS_X = 2.95;
const BAG_X = 5.95;

/** Same sandwich, different counter. Cycled in order, one per sandwich. */
const PRICES = ["$2.49", "$3.19", "$1.99", "$4.29", "$2.89", "$3.69", "$2.19", "$3.99"];

/* -------------------------------------------------------------------------- */
/* Ingredients.                                                                */

/** A bun-like solid of revolution: flat underneath, rounded at the rim. */
function bunBottom(material: MeshStandardMaterial): Mesh {
  const points = [
    new Vector2(0, 0),
    new Vector2(0.36, 0),
    new Vector2(0.42, 0.03),
    new Vector2(0.44, 0.08),
    new Vector2(0.42, 0.13),
    new Vector2(0, 0.14),
  ];
  return mesh(new LatheGeometry(points, 28), material);
}

function bunTop(material: MeshStandardMaterial): Mesh {
  const points: Vector2[] = [new Vector2(0, 0), new Vector2(0.44, 0)];
  for (let i = 1; i <= 8; i += 1) {
    const angle = (i / 8) * (Math.PI / 2);
    points.push(new Vector2(0.45 * Math.cos(angle), 0.03 + 0.26 * Math.sin(angle)));
  }
  return mesh(new LatheGeometry(points, 28), material);
}

function patty(material: MeshStandardMaterial): Mesh {
  // Slightly uneven rim, like a breaded fillet rather than a machined disc.
  const geometry = new CylinderGeometry(0.47, 0.45, 0.13, 28, 1);
  const position = geometry.attributes.position!;
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const z = position.getZ(i);
    const radius = Math.hypot(x, z);
    if (radius < 0.3) continue;
    const angle = Math.atan2(z, x);
    const wobble = 1 + 0.04 * Math.sin(angle * 5) + 0.025 * Math.sin(angle * 9 + 1.3);
    position.setX(i, x * wobble);
    position.setZ(i, z * wobble);
  }
  geometry.computeVertexNormals();
  geometry.translate(0, 0.065, 0);
  return mesh(geometry, material);
}

function lettuce(material: MeshStandardMaterial): Mesh {
  const geometry = new CylinderGeometry(0.48, 0.48, 0.05, 40, 1);
  const position = geometry.attributes.position!;
  for (let i = 0; i < position.count; i += 1) {
    const x = position.getX(i);
    const z = position.getZ(i);
    if (Math.hypot(x, z) < 0.4) continue;
    const angle = Math.atan2(z, x);
    position.setY(i, position.getY(i) + 0.025 * Math.sin(angle * 11));
  }
  geometry.computeVertexNormals();
  geometry.translate(0, 0.025, 0);
  return mesh(geometry, material);
}

function mayo(material: MeshStandardMaterial): Mesh {
  const points: Vector3[] = [];
  for (let i = 0; i <= 24; i += 1) {
    const t = i / 24;
    points.push(new Vector3(-0.3 + 0.6 * t, 0, 0.12 * Math.sin(t * Math.PI * 4)));
  }
  const geometry = new TubeGeometry(new CatmullRomCurve3(points), 48, 0.028, 8, false);
  geometry.translate(0, 0.06, 0);
  return mesh(geometry, material);
}

/* -------------------------------------------------------------------------- */
/* Price flags. One canvas texture per price, drawn once.                      */

function flagTexture(price: string, fontFamily: string): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 144;
  const context = canvas.getContext("2d")!;
  context.fillStyle = COLORS.apron;
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.strokeStyle = COLORS.ink;
  context.lineWidth = 6;
  context.strokeRect(3, 3, canvas.width - 6, canvas.height - 6);
  context.fillStyle = COLORS.ink;
  context.font = `500 72px ${fontFamily}`;
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(price, canvas.width / 2, canvas.height / 2 + 4);
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  texture.anisotropy = 4;
  return texture;
}

/* -------------------------------------------------------------------------- */
/* Cooks.                                                                      */

interface Cook {
  root: Group;
  torso: Group;
  head: Group;
  arms: Group;
  held: Group;
}

function buildCook(shirt: string, skin: string, materials: Materials): Cook {
  const root = new Group();
  const torso = new Group();
  root.add(torso);

  const shirtMaterial = clay(shirt);
  const skinMaterial = clay(skin);

  const body = mesh(new CapsuleGeometry(0.36, 0.5, 8, 20), shirtMaterial);
  body.position.y = 0.64;
  torso.add(body);

  const apron = roundedBox(0.56, 0.62, 0.08, 0.04, materials.apron);
  apron.position.set(0, 0.56, 0.33);
  torso.add(apron);

  const head = new Group();
  head.position.y = 1.36;
  torso.add(head);

  const face = mesh(new SphereGeometry(0.33, 28, 20), skinMaterial);
  head.add(face);

  const cap = mesh(new SphereGeometry(0.34, 28, 12, 0, Math.PI * 2, 0, Math.PI / 2), shirtMaterial);
  cap.position.y = 0.06;
  head.add(cap);

  const brim = roundedBox(0.42, 0.04, 0.22, 0.02, shirtMaterial);
  brim.position.set(0, 0.08, 0.3);
  head.add(brim);

  for (const side of [-1, 1]) {
    const eye = mesh(new SphereGeometry(0.035, 12, 8), materials.ink);
    eye.position.set(side * 0.11, -0.02, 0.3);
    head.add(eye);
  }

  // Both arms move as one, holding the next ingredient between the hands.
  const arms = new Group();
  arms.position.set(0, 1.0, 0.05);
  torso.add(arms);

  for (const side of [-1, 1]) {
    const arm = mesh(new CapsuleGeometry(0.085, 0.5, 6, 12), shirtMaterial);
    arm.position.set(side * 0.33, -0.3, 0);
    arms.add(arm);
    const hand = mesh(new SphereGeometry(0.1, 14, 10), skinMaterial);
    hand.position.set(side * 0.3, -0.62, 0);
    arms.add(hand);
  }

  const held = new Group();
  held.position.set(0, -0.7, 0);
  arms.add(held);

  return { root, torso, head, arms, held };
}

/* -------------------------------------------------------------------------- */

interface Materials {
  apron: MeshStandardMaterial;
  ink: MeshStandardMaterial;
  bun: MeshStandardMaterial;
  bunTop: MeshStandardMaterial;
  patty: MeshStandardMaterial;
  lettuce: MeshStandardMaterial;
  mayo: MeshStandardMaterial;
}

interface Sandwich {
  root: Group;
  bottom: Mesh;
  patty: Mesh;
  topper: Group;
  flag: Group;
  flagFace: Mesh;
}

export function createKitchenScene(canvas: HTMLCanvasElement, options: SceneOptions): ClaySceneController {
  const stage = createStage(canvas, {
    camera: { position: [7.5, 8.2, 11], target: [-0.1, 0.8, -0.3] },
  });
  const { scene, camera } = stage;

  const materials: Materials = {
    apron: clay(COLORS.apron),
    ink: clay(COLORS.ink),
    bun: clay(COLORS.bun),
    bunTop: clay(COLORS.bunTop),
    patty: clay(COLORS.patty),
    lettuce: clay(COLORS.lettuce),
    mayo: clay(COLORS.mayo),
  };

  /* The diorama base. */
  const platform = roundedBox(13.6, 0.6, 6.4, 0.22, clay(COLORS.platform));
  platform.position.set(0.25, -0.3, -0.35);
  scene.add(platform);

  /* The belt: a frame on legs, a dark running surface, slats that move. */
  const beltLength = BELT_END - BELT_START;
  const beltMid = (BELT_END + BELT_START) / 2;
  const frameMaterial = clay(COLORS.beltFrame);
  const frame = roundedBox(beltLength + 0.4, 0.28, 1.34, 0.08, frameMaterial);
  frame.position.set(beltMid, BELT_TOP - 0.2, 0);
  scene.add(frame);

  const surface = roundedBox(beltLength + 0.3, 0.06, 1.16, 0.03, clay(COLORS.beltSurface));
  surface.position.set(beltMid, BELT_TOP - 0.03, 0);
  scene.add(surface);

  for (const x of [BELT_START + 0.2, beltMid, BELT_END - 0.2]) {
    for (const z of [-0.52, 0.52]) {
      const leg = mesh(new CylinderGeometry(0.07, 0.07, 0.5, 10), clay(COLORS.steel));
      leg.position.set(x, 0.25, z);
      scene.add(leg);
    }
  }

  const rollers: Mesh[] = [];
  for (const x of [BELT_START - 0.05, BELT_END + 0.05]) {
    const roller = mesh(new CylinderGeometry(0.17, 0.17, 1.3, 16), clay(COLORS.roller));
    roller.rotation.x = Math.PI / 2;
    roller.position.set(x, BELT_TOP - 0.16, 0);
    scene.add(roller);
    rollers.push(roller);
  }

  const SLAT_GAP = 0.55;
  const slatMaterial = clay(COLORS.beltSlat);
  const slats: Mesh[] = [];
  for (let x = 0; x < beltLength; x += SLAT_GAP) {
    const slat = mesh(new PlaneGeometry(0.07, 1.12), slatMaterial);
    slat.rotation.x = -Math.PI / 2;
    slat.position.set(BELT_START + x, BELT_TOP + 0.002, 0);
    slat.castShadow = false;
    scene.add(slat);
    slats.push(slat);
  }

  /* Cooks and their supply crates. */
  const shirts = [COLORS.accent, COLORS.teal, COLORS.maroon];
  const cooks = STATIONS.map((station, index) => {
    const cook = buildCook(shirts[index]!, COLORS.skins[index]!, materials);
    cook.root.position.set(station.x, 0, WORKER_Z);
    // Chunky, toy-like proportions: the cooks are the subject, not the belt.
    cook.root.scale.setScalar(1.22);
    scene.add(cook.root);
    return cook;
  });

  const supplies = [
    () => bunBottom(materials.bun),
    () => patty(materials.patty),
    () => {
      const group = new Group();
      group.add(lettuce(materials.lettuce));
      const top = bunTop(materials.bunTop);
      top.position.y = 0.07;
      group.add(top);
      return group;
    },
  ];

  STATIONS.forEach((station, index) => {
    const crate = roundedBox(0.95, 0.5, 0.8, 0.08, clay(COLORS.kraft));
    crate.position.set(station.x - 1.05, 0.25, WORKER_Z - 0.15);
    scene.add(crate);
    for (let i = 0; i < 2; i += 1) {
      const item = supplies[index]!();
      item.position.set(station.x - 1.05 + (i === 0 ? -0.18 : 0.2), 0.52 + i * 0.05, WORKER_Z - 0.15);
      item.scale.setScalar(0.7);
      scene.add(item);
    }
    // What the cook is carrying toward the belt right now.
    const carried = supplies[index]!();
    carried.scale.setScalar(0.85);
    cooks[index]!.held.add(carried);
  });

  /* The pricing press: two posts, a bar, a head that stamps. */
  const pressMaterial = clay(COLORS.accent);
  for (const z of [-0.85, 0.85]) {
    const post = roundedBox(0.18, 2.5, 0.18, 0.05, clay(COLORS.steel));
    post.position.set(PRESS_X, 1.25, z);
    scene.add(post);
  }
  const bar = roundedBox(0.3, 0.22, 1.95, 0.06, pressMaterial);
  bar.position.set(PRESS_X, 2.55, 0);
  scene.add(bar);
  const pressHead = new Group();
  const ram = mesh(new CylinderGeometry(0.06, 0.06, 0.9, 10), clay(COLORS.steel));
  ram.position.y = 0.45;
  pressHead.add(ram);
  const stamp = roundedBox(0.5, 0.16, 0.5, 0.05, clay(COLORS.teal));
  pressHead.add(stamp);
  scene.add(pressHead);

  /* The bag at the end of the line. */
  const bag = roundedBox(1.15, 0.62, 1.0, 0.06, clay(COLORS.kraft));
  bag.position.set(BAG_X, 0.31, 0);
  scene.add(bag);
  const mouth = mesh(new PlaneGeometry(1.0, 0.85), clay(COLORS.kraftDark));
  mouth.rotation.x = -Math.PI / 2;
  mouth.position.set(BAG_X, 0.625, 0);
  mouth.castShadow = false;
  scene.add(mouth);

  /* Sandwiches. A fixed pool, reused as each one leaves the line. */
  const flagTextures = PRICES.map((price) => flagTexture(price, options.monoFont));
  const flagMaterials = flagTextures.map(
    // A little self-light so the price stays legible on the shaded side.
    (texture) =>
      new MeshStandardMaterial({
        map: texture,
        emissiveMap: texture,
        emissive: new Color(0xffffff),
        emissiveIntensity: 0.35,
        roughness: 0.95,
        metalness: 0,
      }),
  );
  const toothpickMaterial = clay(COLORS.toothpick);

  const POOL = 6;
  const sandwiches: Sandwich[] = [];
  for (let i = 0; i < POOL; i += 1) {
    const root = new Group();
    const bottom = bunBottom(materials.bun);
    root.add(bottom);
    const fillet = patty(materials.patty);
    fillet.position.y = 0.14;
    root.add(fillet);
    const topper = new Group();
    topper.add(lettuce(materials.lettuce));
    topper.add(mayo(materials.mayo));
    const top = bunTop(materials.bunTop);
    top.position.y = 0.07;
    topper.add(top);
    topper.position.y = 0.27;
    root.add(topper);

    const flag = new Group();
    const pick = mesh(new CylinderGeometry(0.022, 0.022, 0.95, 6), toothpickMaterial);
    pick.position.y = 0.475;
    flag.add(pick);
    const flagFace = mesh(new PlaneGeometry(1.05, 0.59), flagMaterials[0]!);
    flagFace.position.set(0.54, 0.64, 0);
    flagFace.castShadow = false;
    flag.add(flagFace);
    flag.position.y = 0.5;
    // Turn the flag toward the camera so the price reads.
    flag.rotation.y = Math.atan2(camera.position.x, camera.position.z);
    root.add(flag);

    scene.add(root);
    sandwiches.push({ root, bottom, patty: fillet, topper, flag, flagFace });
  }

  const handHeight = 0.72;

  /** Where a sandwich slot sits at time t: slot n is the n-th one ever sent. */
  function slotX(n: number, t: number): number {
    return BELT_START + BELT_SPEED * t - n * SPACING;
  }

  /** Progress of a layer arriving at station x for a sandwich now at sx. */
  function arrival(sx: number, stationX: number): number {
    return clamp01((sx - stationX) / 0.38);
  }

  function update(t: number): void {
    /* Belt surface. */
    const shift = mod(BELT_SPEED * t, SLAT_GAP);
    for (let i = 0; i < slats.length; i += 1) {
      const slat = slats[i]!;
      slat.position.x = BELT_START + mod(i * SLAT_GAP + shift, beltLength);
    }
    for (const roller of rollers) roller.rotation.y = -(BELT_SPEED * t) / 0.17;

    /* Cooks. Phase 0 is the moment a sandwich reaches the cook's station. */
    STATIONS.forEach((station, index) => {
      const cook = cooks[index]!;
      const phase = mod(BELT_SPEED * t - (station.x - BELT_START), SPACING) / SPACING;
      // 0.00-0.18 let go and straighten up, 0.18-0.48 turn to the crate and
      // pick up, 0.48-0.78 swing back with it, 0.78-1.00 lower it to the belt.
      const turn = span(phase, 0.18, 0.34) * (1 - span(phase, 0.48, 0.64));
      const reach = span(phase, 0.78, 0.98);
      const lift = span(phase, 0.3, 0.42) * (1 - span(phase, 0.42, 0.5));
      cook.torso.rotation.y = -1.2 * turn;
      cook.torso.rotation.x = 0.16 * reach;
      cook.arms.rotation.x = -(0.55 + 0.75 * reach - 0.35 * lift);
      cook.head.rotation.x = 0.18 * reach;
      cook.held.visible = phase > 0.38;
      // A little bob, offset per cook so they don't breathe in unison.
      cook.root.position.y = 0.02 * Math.sin(t * 2.4 + index * 1.7);
    });

    /* Press. Stamps as each sandwich passes underneath. */
    const pressPhase = mod(BELT_SPEED * t - (PRESS_X - BELT_START), SPACING) / SPACING;
    const down = span(pressPhase, 0.88, 0.98) * (1 - span(pressPhase, 0.02, 0.16));
    pressHead.position.set(PRESS_X, 2.25 - 0.82 * down, 0);

    /* Sandwiches. */
    const newest = Math.floor((BELT_SPEED * t) / SPACING);
    for (let i = 0; i < POOL; i += 1) {
      const n = newest - i;
      const sandwich = sandwiches[mod(n, POOL)]!;
      const sx = slotX(n, t);

      if (n < 0 || sx < STATIONS[0].x - 0.01 || sx > BAG_X + 0.6) {
        sandwich.root.visible = false;
        continue;
      }
      sandwich.root.visible = true;

      let y = BELT_TOP;
      let x = sx;
      if (sx > BELT_END) {
        // Off the end of the belt and into the bag.
        const fall = (sx - BELT_END) / BELT_SPEED;
        y = BELT_TOP + 0.25 * fall - 4.9 * fall * fall;
        x = BELT_END + (sx - BELT_END) * 0.9;
        if (y < 0.15) {
          sandwich.root.visible = false;
          continue;
        }
      }
      sandwich.root.position.set(x, y, 0);
      sandwich.root.rotation.z = sx > BELT_END ? -Math.min(0.9, (sx - BELT_END) * 0.9) : 0;

      // Each layer drops from the cook's hands onto the stack.
      const layers: [Object3D, number, number][] = [
        [sandwich.bottom, STATIONS[0].x, 0],
        [sandwich.patty, STATIONS[1].x, 0.14],
        [sandwich.topper, STATIONS[2].x, 0.27],
      ];
      for (const [layer, stationX, restY] of layers) {
        const p = arrival(sx, stationX);
        layer.visible = sx >= stationX - 0.001;
        const eased = easeOutCubic(p);
        layer.position.y = restY + (1 - eased) * handHeight;
        layer.position.z = (1 - eased) * (WORKER_Z + 0.55);
      }

      const flagged = sx >= PRESS_X;
      sandwich.flag.visible = flagged;
      if (flagged) {
        const pop = easeOutBack(clamp01((sx - PRESS_X - 0.12) / 0.4));
        sandwich.flag.scale.setScalar(Math.max(0.001, pop));
        sandwich.flagFace.material = flagMaterials[mod(n, PRICES.length)]!;
      }
    }

  }

  return runScene(stage, {
    update,
    // Wide enough for the belt, tall enough for the press.
    fit: { halfWidth: 5.9, minHalfHeight: 2.7 },
    // Start mid-shift, so the line is already full when the scene fades in.
    startAt: PERIOD * 6 + PERIOD * 0.55,
    // A moment with every station mid-task and two flags showing.
    stillAt: PERIOD * 4 + PERIOD * 0.9,
    dispose() {
      flagMaterials.forEach((material) => material.dispose());
      flagTextures.forEach((texture) => texture.dispose());
    },
  });
}
