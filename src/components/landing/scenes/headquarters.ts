/**
 * Corporate headquarters, for the "Why it moves" section.
 *
 * A tall office tower on a plaza, with people in suits walking in and out
 * through a revolving door. Two small franchise restaurants sit at the edges of
 * the plaza, each with a different price on its sign. The section says that
 * corporate can suggest a price but the operator decides, and the scene shows
 * the same thing: one big building, and the prices set out at the small ones.
 *
 * The tower is a generic office building. No logo, no arches, no red or yellow.
 */

import {
  CylinderGeometry,
  Group,
  MeshStandardMaterial,
  PlaneGeometry,
  SphereGeometry,
  Vector3,
} from "three";

import {
  buildPerson,
  type ClaySceneController,
  clamp01,
  clay,
  COLORS,
  createStage,
  easeOutCubic,
  mesh,
  mod,
  type Person,
  roundedBox,
  runScene,
  type SceneOptions,
  signMaterial,
  textTexture,
  walk,
} from "./stage";

const TOWER = { x: 0, z: -0.9, width: 3.0, height: 6.6 };
const DOOR = new Vector3(0, 0, TOWER.z + TOWER.width / 2 + 0.55);
const WALK_SPEED = 0.7;

/** People walk in from the left of the plaza and out to the right. */
const ARRIVE = [new Vector3(-5.1, 0, 3.0), new Vector3(-1.8, 0, 2.7), new Vector3(0, 0, 2.2), DOOR];
const LEAVE = [DOOR, new Vector3(0, 0, 2.2), new Vector3(1.8, 0, 2.75), new Vector3(5.1, 0, 3.1)];

function pathLength(points: readonly Vector3[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i += 1) total += points[i]!.distanceTo(points[i - 1]!);
  return total;
}

/** Position and heading at distance `s` along a polyline. */
function along(points: readonly Vector3[], s: number): { position: Vector3; heading: number } {
  let remaining = s;
  for (let i = 1; i < points.length; i += 1) {
    const from = points[i - 1]!;
    const to = points[i]!;
    const length = from.distanceTo(to);
    if (remaining <= length || i === points.length - 1) {
      const t = clamp01(remaining / length);
      return {
        position: from.clone().lerp(to, t),
        heading: Math.atan2(to.x - from.x, to.z - from.z),
      };
    }
    remaining -= length;
  }
  const last = points[points.length - 1]!;
  return { position: last.clone(), heading: 0 };
}

function tree(x: number, z: number, scale: number): Group {
  const group = new Group();
  const trunk = mesh(new CylinderGeometry(0.09, 0.12, 0.7, 10), clay(COLORS.kraftDark));
  trunk.position.y = 0.35;
  group.add(trunk);
  const leaves = clay("#6f9a5c");
  for (const [dx, dy, r] of [
    [0, 1.0, 0.48],
    [0.22, 1.25, 0.34],
    [-0.2, 1.2, 0.32],
  ] as const) {
    const blob = mesh(new SphereGeometry(r, 18, 14), leaves);
    blob.position.set(dx, dy, 0);
    group.add(blob);
  }
  group.position.set(x, 0, z);
  group.scale.setScalar(scale);
  return group;
}

export function createHeadquartersScene(canvas: HTMLCanvasElement, options: SceneOptions): ClaySceneController {
  const stage = createStage(canvas, {
    camera: { position: [7.5, 8.2, 11], target: [0, 2.6, 0] },
    shadowExtent: 9,
  });
  const { scene } = stage;
  const textures: { dispose(): void }[] = [];

  /* The plaza and its paths. */
  const plaza = roundedBox(11.4, 0.5, 8.6, 0.24, clay(COLORS.platform));
  plaza.position.set(0, -0.25, 0.2);
  scene.add(plaza);

  const paving = clay(COLORS.stone);
  const sidewalk = roundedBox(10.8, 0.04, 1.3, 0.02, paving);
  sidewalk.position.set(0, 0.02, 2.85);
  scene.add(sidewalk);
  const approach = roundedBox(1.6, 0.04, 1.9, 0.02, paving);
  approach.position.set(0, 0.02, 1.6);
  scene.add(approach);

  /* The tower: stone, a setback crown, windows on the two faces we can see. */
  const stone = clay(COLORS.stone);
  const tower = roundedBox(TOWER.width, TOWER.height, TOWER.width, 0.12, stone);
  tower.position.set(TOWER.x, TOWER.height / 2, TOWER.z);
  scene.add(tower);
  const crown = roundedBox(2.3, 0.8, 2.3, 0.1, clay(COLORS.stoneDark));
  crown.position.set(TOWER.x, TOWER.height + 0.4, TOWER.z);
  scene.add(crown);
  const plant = roundedBox(0.9, 0.4, 0.7, 0.06, clay(COLORS.steel));
  plant.position.set(TOWER.x - 0.4, TOWER.height + 1.0, TOWER.z - 0.3);
  scene.add(plant);

  const glass = clay(COLORS.glass);
  const lit = clay(COLORS.glassLit);
  const half = TOWER.width / 2;
  let index = 0;
  for (let row = 0; row < 9; row += 1) {
    const y = 2.0 + row * 0.5;
    for (const offset of [-0.95, -0.32, 0.32, 0.95]) {
      // A few lights on, picked by a fixed pattern so every load looks the same.
      const on = (index * 7 + row * 3) % 11 === 0;
      index += 1;
      const front = mesh(new PlaneGeometry(0.42, 0.34), on ? lit : glass);
      front.position.set(TOWER.x + offset, y, TOWER.z + half + 0.005);
      front.castShadow = false;
      scene.add(front);
      const side = mesh(new PlaneGeometry(0.42, 0.34), (index + row) % 9 === 0 ? lit : glass);
      side.rotation.y = Math.PI / 2;
      side.position.set(TOWER.x + half + 0.005, y, TOWER.z + offset);
      side.castShadow = false;
      scene.add(side);
    }
  }

  /* Flag on the roof. */
  const pole = mesh(new CylinderGeometry(0.03, 0.03, 1.4, 8), clay(COLORS.steel));
  pole.position.set(TOWER.x + 0.7, TOWER.height + 1.5, TOWER.z + 0.6);
  scene.add(pole);
  const flag = new Group();
  flag.position.set(TOWER.x + 0.7, TOWER.height + 2.0, TOWER.z + 0.6);
  const cloth = mesh(new PlaneGeometry(0.7, 0.42), clay(COLORS.teal));
  cloth.position.x = 0.35;
  flag.add(cloth);
  scene.add(flag);

  /* The entrance: a dark doorway, a canopy, a sign, a revolving door. */
  const doorway = roundedBox(1.5, 1.3, 0.08, 0.03, clay(COLORS.ink));
  doorway.position.set(DOOR.x, 0.66, TOWER.z + half + 0.02);
  scene.add(doorway);
  const canopy = roundedBox(2.2, 0.12, 1.1, 0.04, clay(COLORS.accent));
  canopy.position.set(DOOR.x, 1.55, TOWER.z + half + 0.5);
  scene.add(canopy);
  for (const side of [-1, 1]) {
    const post = mesh(new CylinderGeometry(0.04, 0.04, 1.5, 8), clay(COLORS.steel));
    post.position.set(DOOR.x + side * 1.0, 0.75, TOWER.z + half + 0.98);
    scene.add(post);
  }
  const signTexture = textTexture([{ text: "HEADQUARTERS", size: 44 }], {
    width: 512,
    height: 96,
    background: COLORS.apron,
    font: options.monoFont,
  });
  textures.push(signTexture);
  const sign = mesh(new PlaneGeometry(1.9, 0.36), signMaterial(signTexture));
  sign.position.set(DOOR.x, 1.95, TOWER.z + half + 0.01);
  sign.castShadow = false;
  scene.add(sign);

  const revolving = new Group();
  revolving.position.set(DOOR.x, 0, TOWER.z + half + 0.45);
  const glassPanel = new MeshStandardMaterial({
    color: COLORS.glass,
    roughness: 0.3,
    metalness: 0,
    transparent: true,
    opacity: 0.45,
  });
  for (let i = 0; i < 2; i += 1) {
    const panel = mesh(new PlaneGeometry(0.85, 1.15), glassPanel);
    panel.position.y = 0.62;
    panel.rotation.y = (i * Math.PI) / 2;
    panel.castShadow = false;
    revolving.add(panel);
  }
  const drum = mesh(new CylinderGeometry(0.46, 0.46, 0.08, 24), clay(COLORS.steel));
  drum.position.y = 1.24;
  revolving.add(drum);
  scene.add(revolving);

  /* Two franchise restaurants, each pricing the same sandwich its own way. */
  const restaurants = [
    { x: -3.7, z: -0.6, awning: COLORS.teal, price: "$2.49" },
    { x: 3.75, z: -0.4, awning: COLORS.maroon, price: "$3.29" },
  ];
  for (const shop of restaurants) {
    const body = roundedBox(1.7, 1.1, 1.4, 0.08, clay(COLORS.apron));
    body.position.set(shop.x, 0.55, shop.z);
    scene.add(body);
    const roof = roundedBox(1.85, 0.14, 1.55, 0.05, clay(COLORS.stoneDark));
    roof.position.set(shop.x, 1.17, shop.z);
    scene.add(roof);
    const awning = roundedBox(1.5, 0.1, 0.5, 0.04, clay(shop.awning));
    awning.position.set(shop.x, 0.9, shop.z + 0.85);
    awning.rotation.x = 0.25;
    scene.add(awning);
    const door = roundedBox(0.4, 0.62, 0.04, 0.02, clay(COLORS.glass));
    door.position.set(shop.x, 0.32, shop.z + 0.71);
    scene.add(door);

    const signPole = mesh(new CylinderGeometry(0.035, 0.035, 1.2, 8), clay(COLORS.steel));
    signPole.position.set(shop.x + 0.6, 1.8, shop.z);
    scene.add(signPole);
    const priceTexture = textTexture([{ text: shop.price, size: 64 }], {
      width: 256,
      height: 128,
      background: COLORS.apron,
      border: COLORS.ink,
      font: options.monoFont,
    });
    textures.push(priceTexture);
    const priceSign = mesh(new PlaneGeometry(0.8, 0.4), signMaterial(priceTexture));
    priceSign.position.set(shop.x + 0.6, 2.5, shop.z);
    priceSign.rotation.y = Math.atan2(7.5, 11);
    priceSign.castShadow = false;
    scene.add(priceSign);
  }

  scene.add(tree(-2.3, 0.9, 0.9), tree(2.4, 1.0, 0.8), tree(-4.6, 1.4, 0.7), tree(4.5, 1.6, 0.75));

  /* People in suits, coming and going. */
  const suits = [COLORS.charcoal, COLORS.accent, COLORS.slate, COLORS.ink, COLORS.slate, COLORS.accent];
  const ties = [COLORS.teal, COLORS.maroon, COLORS.accent, COLORS.teal, COLORS.maroon, COLORS.charcoal];
  const arriveLength = pathLength(ARRIVE);
  const leaveLength = pathLength(LEAVE);
  // A gap after each walk, so the plaza never looks like a conveyor belt.
  const cycle = Math.max(arriveLength, leaveLength) / WALK_SPEED + 1.6;

  interface Walker {
    person: Person;
    route: readonly Vector3[];
    length: number;
    offset: number;
    arriving: boolean;
  }
  const walkers: Walker[] = [];
  for (let i = 0; i < 6; i += 1) {
    const arriving = i % 2 === 0;
    const person = buildPerson({
      outfit: suits[i]!,
      skin: COLORS.skins[i % COLORS.skins.length]!,
      hair: COLORS.hair[i % COLORS.hair.length]!,
      legs: suits[i]!,
      tie: ties[i]!,
    });
    if (i !== 3) {
      const briefcase = roundedBox(0.36, 0.26, 0.1, 0.03, clay(i % 2 === 0 ? COLORS.kraftDark : COLORS.ink));
      briefcase.position.y = -0.12;
      person.rightHand.add(briefcase);
    }
    person.root.scale.setScalar(0.74);
    scene.add(person.root);
    walkers.push({
      person,
      route: arriving ? ARRIVE : LEAVE,
      length: arriving ? arriveLength : leaveLength,
      // Three on each route, a third of a cycle apart, with the routes offset.
      offset: Math.floor(i / 2) * (cycle / 3) + (arriving ? 0 : cycle / 6),
      arriving,
    });
  }

  function update(t: number): void {
    revolving.rotation.y = t * 0.9;
    flag.rotation.y = 0.25 * Math.sin(t * 1.7);
    cloth.rotation.y = 0.15 * Math.sin(t * 3.1);

    for (const walker of walkers) {
      const elapsed = mod(t + walker.offset, cycle);
      const s = elapsed * WALK_SPEED;
      if (s > walker.length) {
        walker.person.root.visible = false;
        continue;
      }
      const { position, heading } = along(walker.route, s);
      walker.person.root.visible = true;
      walker.person.root.position.copy(position);
      walker.person.root.rotation.y = heading;
      walk(walker.person, s);

      // Step through the door, or onto the plaza from the edge: grow in, or
      // shrink away, over the first and last half unit of the walk.
      const toEnd = walker.length - s;
      const appear = easeOutCubic(clamp01(s / 0.5));
      const vanish = easeOutCubic(clamp01(toEnd / 0.5));
      walker.person.root.scale.setScalar(0.74 * Math.max(0.001, Math.min(appear, vanish)));
    }
  }

  return runScene(stage, {
    update,
    fit: { halfWidth: 6.2, minHalfHeight: 5.0 },
    startAt: 12.5,
    stillAt: 7.2,
    dispose() {
      textures.forEach((texture) => texture.dispose());
      glassPanel.dispose();
    },
  });
}

