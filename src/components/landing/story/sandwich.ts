/**
 * The one 3D object: the Kenney Food Kit burger, restacked and recoloured as
 * a McChicken in the site's clay look (bun, breaded patty, shredded lettuce,
 * bun; the cheese and tomato are dropped).
 *
 * Loaded only through a dynamic import, so three.js never reaches the
 * server-rendered page. Draws only when `draw` is called, and `draw` is only
 * called when the pose changed; there is no loop in here.
 */

import {
  CanvasTexture,
  Color,
  DirectionalLight,
  Group,
  HemisphereLight,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  type Object3D,
  OrthographicCamera,
  PlaneGeometry,
  Scene,
  SRGBColorSpace,
  WebGLRenderer,
} from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";

import { GAP, LAYERS, STACK_HEIGHT, type StageState } from "./timeline";

/** Clay colours for food, which the site's tokens do not cover. Muted, no red or yellow. */
const CLAY = {
  bun: "#d2ab78",
  bunTop: "#c99a62",
  patty: "#b98443",
  lettuce: "#9aae74",
} as const;

export interface SandwichScene {
  draw(s: StageState["sandwich"]): void;
  resize(box: number, dpr: number): void;
  dispose(): void;
}

export async function createSandwichScene(canvas: HTMLCanvasElement, box: number, dpr: number): Promise<SandwichScene> {
  const renderer = new WebGLRenderer({ canvas, antialias: true, alpha: true, powerPreference: "low-power" });
  renderer.setPixelRatio(dpr);
  renderer.setSize(box, box, false);
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = SRGBColorSpace;

  const scene = new Scene();
  scene.add(new HemisphereLight(0xfff8ee, 0xb9b2a2, 1.55));
  const key = new DirectionalLight(0xffffff, 1.9);
  key.position.set(-3, 6, 4);
  scene.add(key);
  const rim = new DirectionalLight(0xfff4e6, 0.6);
  rim.position.set(4, 2, -3);
  scene.add(rim);

  const camera = new OrthographicCamera(-1, 1, 1, -1, 0.1, 40);

  const gltf = await new GLTFLoader().loadAsync("/landing/burger.glb");
  const source = gltf.scene;

  const materials = {
    bun: new MeshStandardMaterial({ color: new Color(CLAY.bun), roughness: 0.9, metalness: 0 }),
    bunTop: new MeshStandardMaterial({ color: new Color(CLAY.bunTop), roughness: 0.88, metalness: 0 }),
    patty: new MeshStandardMaterial({ color: new Color(CLAY.patty), roughness: 0.95, metalness: 0 }),
    lettuce: new MeshStandardMaterial({ color: new Color(CLAY.lettuce), roughness: 0.92, metalness: 0 }),
  };

  // Dispose what the file brought (its material and colormap) once replaced.
  const originals = new Set<{ dispose(): void }>();
  function take(name: string, material: MeshStandardMaterial, scaleY: number): Mesh {
    const node = source.getObjectByName(name);
    let found: Mesh | null = null;
    node?.traverse((child: Object3D) => {
      if (found === null && child instanceof Mesh) found = child;
    });
    if (found === null) throw new Error(`burger.glb: no mesh "${name}"`);
    const mesh: Mesh = found;
    const old = mesh.material;
    if (Array.isArray(old)) old.forEach((m) => originals.add(m));
    else {
      originals.add(old);
      const map = (old as MeshStandardMaterial).map;
      if (map) originals.add(map);
    }
    const copy = new Mesh(mesh.geometry, material);
    copy.scale.set(node!.scale.x, scaleY, node!.scale.z);
    return copy;
  }

  // Bottom to top, matching LAYERS in timeline.ts.
  const parts = [
    take("bun-bottom", materials.bun, 1),
    take("patty", materials.patty, 1.4),
    take("salad", materials.lettuce, 0.75),
    take("bun-top", materials.bunTop, 1),
  ];
  for (const name of ["cheese", "tomato"]) {
    source.getObjectByName(name)?.traverse((child: Object3D) => {
      if (child instanceof Mesh) child.geometry.dispose();
    });
  }
  originals.forEach((thing) => thing.dispose());

  const sandwich = new Group();
  const layers = parts.map((part) => {
    const layer = new Group();
    layer.add(part);
    sandwich.add(layer);
    return layer;
  });
  scene.add(sandwich);

  // A soft contact shadow: one textured quad, no shadow maps.
  const blob = document.createElement("canvas");
  blob.width = blob.height = 64;
  const ctx = blob.getContext("2d")!;
  const radial = ctx.createRadialGradient(32, 32, 4, 32, 32, 32);
  radial.addColorStop(0, "rgba(40,32,20,0.55)");
  radial.addColorStop(1, "rgba(40,32,20,0)");
  ctx.fillStyle = radial;
  ctx.fillRect(0, 0, 64, 64);
  const shadowTexture = new CanvasTexture(blob);
  const shadowMaterial = new MeshBasicMaterial({ map: shadowTexture, transparent: true, depthWrite: false });
  const shadow = new Mesh(new PlaneGeometry(0.62, 0.62), shadowMaterial);
  shadow.rotation.x = -Math.PI / 2;
  shadow.renderOrder = -1;
  sandwich.add(shadow);

  let size = box;

  function frame(k: number): void {
    const half = size / 2 / k;
    camera.left = -half;
    camera.right = half;
    camera.top = half;
    camera.bottom = -half;
    camera.updateProjectionMatrix();
  }

  return {
    draw(s) {
      const k = Math.max(1, s.k * s.scale);
      frame(k);
      camera.position.set(0, Math.sin(s.pitch) * 10, Math.cos(s.pitch) * 10);
      camera.lookAt(0, 0, 0);

      const stackH = STACK_HEIGHT + 3 * GAP * s.explode;
      sandwich.position.y = -stackH / 2;
      sandwich.rotation.y = s.yaw;
      layers.forEach((layer, i) => {
        layer.position.y = LAYERS[i]!.base + GAP * s.explode * i;
      });
      shadow.position.y = -0.004;
      shadowMaterial.opacity = s.shadow;
      shadow.visible = s.shadow > 0.01;
      renderer.render(scene, camera);
    },
    resize(nextBox, nextDpr) {
      size = nextBox;
      renderer.setPixelRatio(nextDpr);
      renderer.setSize(nextBox, nextBox, false);
    },
    dispose() {
      parts.forEach((part) => part.geometry.dispose());
      Object.values(materials).forEach((m) => m.dispose());
      shadow.geometry.dispose();
      shadowMaterial.dispose();
      shadowTexture.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
    },
  };
}
