/**
 * What every clay scene on the landing page shares.
 *
 * The scenes are soft clay in an isometric view, after the Sendoso animation on
 * Dribbble, in the site's own palette. There is no red or yellow anywhere, for
 * the same trade-dress reason as globals.css. This module holds the parts that
 * would otherwise be copied three times: the renderer and lights, the camera
 * framing, the clay material, a few primitive builders, a person, the easing
 * curves, and the controller that starts, stops and stills a scene.
 *
 * Each scene file builds its objects, then hands an `update(t)` function to
 * `runScene`. `update` must be a pure function of time, so any moment can be
 * drawn on its own. That is how the reduced-motion still frame works.
 */

import {
  AmbientLight,
  CanvasTexture,
  CapsuleGeometry,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  OrthographicCamera,
  PCFShadowMap,
  Scene,
  SphereGeometry,
  SRGBColorSpace,
  WebGLRenderer,
} from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

/* -------------------------------------------------------------------------- */
/* Palette. The site's tokens where they exist; everyday colours where not.    */

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

/* -------------------------------------------------------------------------- */
/* Easing. The same curves as globals.css, so the scenes move like the page.   */

export const clamp01 = (value: number) => Math.min(1, Math.max(0, value));
export const easeOutCubic = (t: number) => 1 - (1 - t) ** 3;
export const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t ** 3 : 1 - (-2 * t + 2) ** 3 / 2);
/** A little overshoot for things that pop into place. Used sparingly. */
export const easeOutBack = (t: number) => {
  const c1 = 1.5;
  const c3 = c1 + 1;
  return 1 + c3 * (t - 1) ** 3 + c1 * (t - 1) ** 2;
};
export const mod = (value: number, divisor: number) => ((value % divisor) + divisor) % divisor;
/** 0→1 across [from, to], eased in and out, flat outside it. */
export const span = (t: number, from: number, to: number) => easeInOutCubic(clamp01((t - from) / (to - from)));

/* -------------------------------------------------------------------------- */
/* Primitives.                                                                 */

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

/**
 * A canvas texture with lines of text, for signs, menu boards and screens.
 * Drawn once per state; the scenes swap materials rather than redraw.
 */
export function textTexture(
  lines: readonly { text: string; size: number; align?: CanvasTextAlign; x?: number; color?: string }[],
  options: { width: number; height: number; background: string; border?: string; font: string },
): CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = options.width;
  canvas.height = options.height;
  const context = canvas.getContext("2d")!;
  context.fillStyle = options.background;
  context.fillRect(0, 0, canvas.width, canvas.height);
  if (options.border !== undefined) {
    context.strokeStyle = options.border;
    context.lineWidth = 6;
    context.strokeRect(3, 3, canvas.width - 6, canvas.height - 6);
  }
  const step = canvas.height / (lines.length + 1);
  lines.forEach((line, index) => {
    context.fillStyle = line.color ?? COLORS.ink;
    context.font = `500 ${line.size}px ${options.font}`;
    context.textAlign = line.align ?? "center";
    context.textBaseline = "middle";
    const x = line.x ?? (line.align === "left" ? 24 : line.align === "right" ? canvas.width - 24 : canvas.width / 2);
    context.fillText(line.text, x, step * (index + 1) + 2);
  });
  const texture = new CanvasTexture(canvas);
  texture.colorSpace = SRGBColorSpace;
  // Signs face the camera at a slant, and slanted text blurs fastest. three.js
  // clamps this to what the GPU supports (16 on nearly everything).
  texture.anisotropy = 16;
  return texture;
}

/** A lit-from-within material for signs and screens, so text reads in shade. */
export function signMaterial(texture: CanvasTexture, glow = 0.35): MeshStandardMaterial {
  return new MeshStandardMaterial({
    map: texture,
    emissiveMap: texture,
    emissive: new Color(0xffffff),
    emissiveIntensity: glow,
    roughness: 0.95,
    metalness: 0,
  });
}

/* -------------------------------------------------------------------------- */
/* People.                                                                     */

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

/** A walk cycle, as a function of distance walked. */
export function walk(person: Person, distance: number, stride = 0.55): void {
  const swing = Math.sin((distance / stride) * Math.PI);
  person.leftLeg.rotation.x = 0.55 * swing;
  person.rightLeg.rotation.x = -0.55 * swing;
  person.leftArm.rotation.x = -0.45 * swing;
  person.rightArm.rotation.x = 0.45 * swing;
  person.body.position.y = 0.04 * Math.abs(Math.cos((distance / stride) * Math.PI));
}

/* -------------------------------------------------------------------------- */
/* The stage: renderer, camera, light.                                         */

export interface StageOptions {
  camera: { position: [number, number, number]; target: [number, number, number] };
  /** Half the shadow camera's width; big enough to cover the diorama. */
  shadowExtent?: number;
}

export interface Stage {
  renderer: WebGLRenderer;
  scene: Scene;
  camera: OrthographicCamera;
}

export function createStage(canvas: HTMLCanvasElement, options: StageOptions): Stage {
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "low-power" });
  // Always 2, even on a 1x screen: the menu board and the phone are text
  // drawn into textures and shrunk several times over, and rendering at
  // double size then letting the browser scale the canvas down keeps that
  // text from smearing. The canvases are small (about 400×300 CSS pixels),
  // so four times the pixels is still cheap. Never above 2 on 3x phones.
  renderer.setPixelRatio(2);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = PCFShadowMap;
  renderer.setClearColor(0x000000, 0);

  const scene = new Scene();
  const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 100);
  camera.position.set(...options.camera.position);
  camera.lookAt(...options.camera.target);

  // Soft and warm, with one shadow-casting key from the upper left.
  scene.add(new HemisphereLight(0xfff8ee, 0xb9b2a2, 1.5));
  scene.add(new AmbientLight(0xffffff, 0.25));
  const key = new DirectionalLight(0xffffff, 2.1);
  key.position.set(-4, 11, 7);
  key.castShadow = true;
  const extent = options.shadowExtent ?? 9;
  key.shadow.mapSize.set(1024, 1024);
  key.shadow.camera.left = -extent;
  key.shadow.camera.right = extent;
  key.shadow.camera.top = extent * 0.8;
  key.shadow.camera.bottom = -extent * 0.8;
  key.shadow.bias = -0.0008;
  key.shadow.normalBias = 0.02;
  scene.add(key);

  return { renderer, scene, camera };
}

/* -------------------------------------------------------------------------- */
/* The controller.                                                             */

export interface ClaySceneController {
  /** Start animating from wherever the clock stands. */
  start(): void;
  /** Stop animating. The last frame stays on the canvas. */
  stop(): void;
  /** Draw one moment and stop there. Used for reduced motion. */
  still(): void;
  resize(width: number, height: number): void;
  dispose(): void;
}

export interface RunOptions {
  /** Pure function of time. Positions everything; does not render. */
  update: (t: number) => void;
  /**
   * Framing: the camera shows at least `halfWidth` either side of centre and
   * at least `minHalfHeight` above and below, whatever the canvas's shape.
   */
  fit: { halfWidth: number; minHalfHeight: number };
  /** Where the clock starts, so the scene is mid-action when it fades in. */
  startAt: number;
  /** The moment drawn for reduced motion. */
  stillAt: number;
  /** Anything the scene made that the scene graph doesn't own. */
  dispose?: () => void;
}

export interface SceneOptions {
  /** The resolved mono font family, for anything with text on it. */
  monoFont: string;
}

export type SceneFactory = (canvas: HTMLCanvasElement, options: SceneOptions) => ClaySceneController;

export function runScene(stage: Stage, options: RunOptions): ClaySceneController {
  const { renderer, scene, camera } = stage;
  let rafHandle = 0;
  let clock = options.startAt;
  let last = 0;

  function draw(): void {
    options.update(clock);
    renderer.render(scene, camera);
  }

  function tick(now: number): void {
    // Clamp the step so a long pause doesn't fast-forward the scene.
    const delta = last === 0 ? 0 : Math.min(0.05, (now - last) / 1000);
    last = now;
    clock += delta;
    draw();
    rafHandle = requestAnimationFrame(tick);
  }

  return {
    start() {
      if (rafHandle !== 0) return;
      last = 0;
      rafHandle = requestAnimationFrame(tick);
    },
    stop() {
      cancelAnimationFrame(rafHandle);
      rafHandle = 0;
    },
    still() {
      cancelAnimationFrame(rafHandle);
      rafHandle = 0;
      clock = options.stillAt;
      draw();
    },
    resize(width, height) {
      if (width === 0 || height === 0) return;
      renderer.setSize(width, height, false);
      const aspect = width / height;
      const halfHeight = Math.max(options.fit.minHalfHeight, options.fit.halfWidth / aspect);
      camera.left = -halfHeight * aspect;
      camera.right = halfHeight * aspect;
      camera.top = halfHeight;
      camera.bottom = -halfHeight;
      camera.updateProjectionMatrix();
      draw();
    },
    dispose() {
      cancelAnimationFrame(rafHandle);
      rafHandle = 0;
      scene.traverse((object) => {
        if (object instanceof Mesh) {
          object.geometry.dispose();
          const material = object.material;
          if (Array.isArray(material)) material.forEach((m) => m.dispose());
          else material.dispose();
        }
      });
      options.dispose?.();
      renderer.dispose();
    },
  };
}
