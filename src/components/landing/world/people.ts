/**
 * The clay palette and the clay person the landing world borrows: the cashier
 * behind the counter. Matte, soft, no red or yellow anywhere.
 */

import { CapsuleGeometry, Color, Group, Mesh, MeshStandardMaterial, SphereGeometry } from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

export const COLORS = {
  platform: "#ece7dc",
  stone: "#ddd6c8",
  stoneDark: "#c9c1b0",
  glass: "#3c5a78",
  glassLit: "#efe2bf",
  steel: "#8e8a7e",
  kraft: "#c9a87b",
  kraftDark: "#a9875b",
  accent: "#12395e",
  teal: "#0f5c55",
  maroon: "#7b2d3b",
  charcoal: "#3b3a34",
  slate: "#5b6470",
  apron: "#fbfaf7",
  shirt: "#f4f1ea",
  ink: "#15140f",
  hair: ["#2b2118", "#4a3424", "#1d1b19", "#6b4b33"],
  skins: ["#f0c9a2", "#9a6141", "#d39a6c", "#6e432b", "#e8b48c"],
} as const;

export function clay(color: string): MeshStandardMaterial {
  return new MeshStandardMaterial({ color: new Color(color), roughness: 0.88, metalness: 0 });
}

export function mesh(geometry: Mesh["geometry"], material: MeshStandardMaterial): Mesh {
  const result = new Mesh(geometry, material);
  result.castShadow = true;
  result.receiveShadow = true;
  return result;
}

export function roundedBox(w: number, h: number, d: number, radius: number, material: MeshStandardMaterial): Mesh {
  return mesh(new RoundedBoxGeometry(w, h, d, 4, radius), material);
}

export interface Person {
  root: Group;
  body: Group;
  head: Group;
  leftArm: Group;
  rightArm: Group;
  leftLeg: Group;
  rightLeg: Group;
  /** Hangs from the right hand: a briefcase, a phone. */
  rightHand: Group;
}

export interface PersonStyle {
  outfit: string;
  skin: string;
  hair: string;
  /** Trousers, if different from the outfit. */
  legs?: string;
  /** A collar and tie: business attire. */
  tie?: string;
}

/**
 * A chunky clay figure, about 1.6 units tall, facing +z. Arms and legs hang
 * from pivots at the shoulders and hips, so a walk is two rotations.
 */
export function buildPerson(style: PersonStyle): Person {
  const root = new Group();
  const body = new Group();
  root.add(body);

  const outfit = clay(style.outfit);
  const skin = clay(style.skin);
  const legMaterial = clay(style.legs ?? COLORS.charcoal);

  const torso = mesh(new CapsuleGeometry(0.3, 0.42, 8, 18), outfit);
  torso.position.y = 0.86;
  body.add(torso);

  if (style.tie !== undefined) {
    const collar = roundedBox(0.2, 0.16, 0.06, 0.03, clay(COLORS.shirt));
    collar.position.set(0, 1.08, 0.27);
    body.add(collar);
    const tie = roundedBox(0.07, 0.3, 0.04, 0.02, clay(style.tie));
    tie.position.set(0, 0.92, 0.3);
    body.add(tie);
  }

  const head = new Group();
  head.position.y = 1.5;
  body.add(head);
  head.add(mesh(new SphereGeometry(0.27, 24, 18), skin));
  const hair = mesh(new SphereGeometry(0.28, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2.2), clay(style.hair));
  hair.position.y = 0.03;
  hair.rotation.x = -0.25;
  head.add(hair);
  for (const side of [-1, 1]) {
    const eye = mesh(new SphereGeometry(0.03, 10, 8), clay(COLORS.ink));
    eye.position.set(side * 0.09, -0.01, 0.25);
    head.add(eye);
  }

  function limb(x: number, y: number, length: number, material: MeshStandardMaterial, radius: number): Group {
    const pivot = new Group();
    pivot.position.set(x, y, 0);
    const part = mesh(new CapsuleGeometry(radius, length, 6, 12), material);
    part.position.y = -length / 2 - radius * 0.4;
    pivot.add(part);
    return pivot;
  }

  const leftArm = limb(-0.36, 1.1, 0.36, outfit, 0.08);
  const rightArm = limb(0.36, 1.1, 0.36, outfit, 0.08);
  for (const arm of [leftArm, rightArm]) {
    const hand = mesh(new SphereGeometry(0.085, 12, 10), skin);
    hand.position.y = -0.52;
    arm.add(hand);
    body.add(arm);
  }
  const rightHand = new Group();
  rightHand.position.y = -0.56;
  rightArm.add(rightHand);

  const leftLeg = limb(-0.13, 0.5, 0.28, legMaterial, 0.1);
  const rightLeg = limb(0.13, 0.5, 0.28, legMaterial, 0.1);
  body.add(leftLeg, rightLeg);

  return { root, body, head, leftArm, rightArm, leftLeg, rightLeg, rightHand };
}
