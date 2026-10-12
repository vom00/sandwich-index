/**
 * Somebody logging a price, for the "How a price gets here" section.
 *
 * A person stands at a menu board, looks up at the McChicken line, types the
 * price into their phone digit by digit, and sends it. A price card pops out of
 * the phone and flies onto a pin on a small floating map, which bounces once
 * and shows the new price. It is the section's three steps in one loop: see the
 * price, log it, the store's price updates.
 *
 * Motion follows the site's rules: ease-out for things appearing, ease-in-out
 * for things moving across the screen, and one small bounce, on the pin, where
 * the playfulness means something.
 */

import {
  ConeGeometry,
  CylinderGeometry,
  Group,
  MeshStandardMaterial,
  PlaneGeometry,
  SphereGeometry,
  TorusGeometry,
  Vector3,
} from "three";

import {
  buildPerson,
  type ClaySceneController,
  clamp01,
  clay,
  COLORS,
  createStage,
  easeInOutCubic,
  easeOutBack,
  easeOutCubic,
  mesh,
  mod,
  roundedBox,
  runScene,
  type SceneOptions,
  signMaterial,
  span,
  textTexture,
} from "./stage";

/** One loop, in seconds. */
const LOOP = 7.2;

/**
 * What the phone shows, in order, and when each state starts. Every line has
 * to fit a 192px-wide screen in a monospace face, about 0.6em a character.
 */
const SCREEN_STATES = [
  { at: 0, lines: ["McChicken", ""] },
  { at: 1.45, lines: ["McChicken", "$"] },
  { at: 1.8, lines: ["McChicken", "$2"] },
  { at: 2.15, lines: ["McChicken", "$2.4"] },
  { at: 2.5, lines: ["McChicken", "$2.49"] },
  { at: 2.95, lines: ["$2.49", "Send"] },
  { at: 3.35, lines: ["$2.49", "Logged"] },
] as const;

const SEND_AT = 3.3;
const LAND_AT = 4.75;

export function createLoggingScene(canvas: HTMLCanvasElement, options: SceneOptions): ClaySceneController {
  const stage = createStage(canvas, {
    camera: { position: [7.5, 8.2, 11], target: [0.7, 1.5, -0.3] },
    shadowExtent: 7,
  });
  const { scene } = stage;
  const textures: { dispose(): void }[] = [];

  /* The floor. */
  const floor = roundedBox(8.4, 0.5, 5.2, 0.24, clay(COLORS.platform));
  floor.position.set(0.6, -0.25, -0.2);
  scene.add(floor);

  /* The menu board, on two posts. */
  const menuStand = new Group();
  menuStand.position.set(-1.75, 0, -1.45);
  menuStand.rotation.y = 0.32;
  scene.add(menuStand);
  for (const side of [-1, 1]) {
    const post = mesh(new CylinderGeometry(0.07, 0.07, 2.4, 10), clay(COLORS.steel));
    post.position.set(side * 1.35, 1.2, 0);
    menuStand.add(post);
  }
  const board = roundedBox(3.2, 1.9, 0.14, 0.06, clay(COLORS.ink));
  board.position.set(0, 2.35, 0);
  menuStand.add(board);
  const menuTexture = textTexture(
    [
      { text: "McChicken      $2.49", size: 44, color: COLORS.apron },
      { text: "Fries (M)      $2.89", size: 44, color: "#c9c4b6" },
      { text: "Hash brown     $1.79", size: 44, color: "#c9c4b6" },
      { text: "Apple pie      $1.69", size: 44, color: "#c9c4b6" },
    ],
    { width: 640, height: 380, background: COLORS.ink, font: options.monoFont },
  );
  textures.push(menuTexture);
  const menu = mesh(new PlaneGeometry(2.95, 1.75), signMaterial(menuTexture, 0.5));
  menu.position.set(0, 2.35, 0.08);
  menu.castShadow = false;
  menuStand.add(menu);
  // The line being read, underlined in the site's teal.
  const highlight = roundedBox(2.2, 0.05, 0.02, 0.01, clay(COLORS.teal));
  highlight.position.set(0, 2.78, 0.1);
  menuStand.add(highlight);

  /* The person, three-quarters away from us, facing the board. */
  const person = buildPerson({
    outfit: COLORS.teal,
    skin: COLORS.skins[2]!,
    hair: COLORS.hair[1]!,
    legs: COLORS.accent,
  });
  person.root.position.set(0.55, 0, 0.55);
  person.root.rotation.y = Math.PI + 0.9;
  person.root.scale.setScalar(1.3);
  scene.add(person.root);

  // The phone is held up in the hand on our side, and turned to face us, so
  // the screen can be read as the price is typed in. Toy logic: in the hand,
  // and always legible.
  person.rightArm.rotation.set(-1.3, 0, 0);
  person.leftArm.rotation.set(-0.35, 0, 0.12);
  const phone = new Group();
  phone.scale.setScalar(1.45);
  scene.add(phone);
  const handset = roundedBox(0.46, 0.8, 0.07, 0.06, clay(COLORS.ink));
  phone.add(handset);

  const screenMaterials = SCREEN_STATES.map((state) => {
    const texture = textTexture(
      [
        { text: state.lines[0], size: 30, color: COLORS.ink },
        {
          text: state.lines[1],
          size: state.lines[1] === "Logged" ? 44 : 56,
          color: state.lines[1] === "Send" || state.lines[1] === "Logged" ? COLORS.teal : COLORS.ink,
        },
      ],
      { width: 192, height: 320, background: COLORS.apron, font: options.monoFont },
    );
    textures.push(texture);
    return signMaterial(texture, 0.55);
  });
  const screen = mesh(new PlaneGeometry(0.39, 0.68), screenMaterials[0]!);
  screen.position.z = 0.038;
  screen.castShadow = false;
  phone.add(screen);

  /* The floating map, with roads and three pins. */
  const map = new Group();
  map.position.set(3.0, 2.5, -0.7);
  map.rotation.y = -0.2;
  map.scale.setScalar(1.3);
  scene.add(map);
  const tile = roundedBox(2.5, 0.14, 1.9, 0.07, clay(COLORS.apron));
  map.add(tile);
  const road = clay(COLORS.stone);
  for (const [w, d, x, z, r] of [
    [2.3, 0.12, 0, 0.1, 0],
    [0.12, 1.7, -0.4, 0, 0],
    [1.6, 0.1, 0.35, -0.5, 0.5],
  ] as const) {
    const strip = roundedBox(w, 0.03, d, 0.02, road);
    strip.position.set(x, 0.085, z);
    strip.rotation.y = r;
    map.add(strip);
  }

  function pin(color: string): Group {
    const group = new Group();
    const point = mesh(new ConeGeometry(0.11, 0.32, 14), clay(color));
    point.rotation.x = Math.PI;
    point.position.y = 0.16;
    group.add(point);
    const head = mesh(new SphereGeometry(0.15, 16, 12), clay(color));
    head.position.y = 0.38;
    group.add(head);
    return group;
  }
  const otherPins = [pin(COLORS.steel), pin(COLORS.steel)];
  otherPins[0]!.position.set(-0.8, 0.08, 0.55);
  otherPins[1]!.position.set(0.75, 0.08, 0.5);
  map.add(...otherPins);
  const target = pin(COLORS.teal);
  target.position.set(0.05, 0.08, -0.25);
  map.add(target);

  const ringMaterial = new MeshStandardMaterial({ color: COLORS.teal, transparent: true, opacity: 0, roughness: 0.9 });
  const ring = mesh(new TorusGeometry(0.3, 0.025, 8, 32), ringMaterial);
  ring.rotation.x = Math.PI / 2;
  ring.position.set(0.05, 0.1, -0.25);
  ring.castShadow = false;
  map.add(ring);

  const tagTexture = textTexture([{ text: "$2.49", size: 64 }], {
    width: 224,
    height: 112,
    background: COLORS.apron,
    border: COLORS.ink,
    font: options.monoFont,
  });
  textures.push(tagTexture);
  const tag = mesh(new PlaneGeometry(0.62, 0.31), signMaterial(tagTexture));
  tag.position.set(0.05, 0.95, -0.25);
  tag.rotation.y = Math.atan2(7.5, 11);
  tag.castShadow = false;
  map.add(tag);

  /* The card that travels from the phone to the pin. */
  const cardTexture = textTexture(
    [
      { text: "McChicken", size: 30 },
      { text: "$2.49", size: 56 },
    ],
    { width: 224, height: 160, background: COLORS.apron, border: COLORS.ink, font: options.monoFont },
  );
  textures.push(cardTexture);
  const card = mesh(new PlaneGeometry(0.86, 0.61), signMaterial(cardTexture));
  card.castShadow = false;
  scene.add(card);

  const phoneWorld = new Vector3();
  const pinWorld = new Vector3();
  const handWorld = new Vector3();
  const cameraPosition = stage.camera.position.clone();

  function update(t: number): void {
    const time = mod(t, LOOP);

    // Look up at the board, then down at the phone, typing, then up again.
    const lookDown = span(time, 1.05, 1.35) * (1 - span(time, 5.6, 6.1));
    person.head.rotation.x = -0.3 + 0.55 * lookDown;
    person.head.rotation.y = 0.75 * lookDown;
    const typing = time > 1.4 && time < 3.0 ? Math.max(0, Math.sin(time * 26)) : 0;
    person.rightArm.rotation.x = -1.3 - 0.05 * typing;
    person.rightHand.getWorldPosition(handWorld);
    phone.position.set(handWorld.x, handWorld.y + 0.4, handWorld.z);
    phone.lookAt(cameraPosition);

    // The screen fills in, one state after another.
    let state = 0;
    for (let i = 0; i < SCREEN_STATES.length; i += 1) if (time >= SCREEN_STATES[i]!.at) state = i;
    if (time > 6.3) state = 0;
    screen.material = screenMaterials[state]!;

    // A small hop once the price lands.
    const hop = span(time, LAND_AT + 0.1, LAND_AT + 0.35) * (1 - span(time, LAND_AT + 0.35, LAND_AT + 0.65));
    person.body.position.y = 0.14 * hop;

    // The map bobs gently the whole time.
    map.position.y = 2.5 + 0.06 * Math.sin(t * 1.3);

    // The card: pops out of the phone, flies on an arc, drops into the pin.
    phone.getWorldPosition(phoneWorld);
    target.getWorldPosition(pinWorld);
    pinWorld.y += 0.55;
    const pop = clamp01((time - SEND_AT) / 0.3);
    const flight = easeInOutCubic(clamp01((time - SEND_AT - 0.3) / (LAND_AT - SEND_AT - 0.3)));
    if (time < SEND_AT || time > LAND_AT + 0.2) {
      card.visible = false;
    } else {
      card.visible = true;
      card.position.lerpVectors(phoneWorld, pinWorld, flight);
      card.position.y += Math.sin(flight * Math.PI) * 0.7 + 0.3 * (1 - flight);
      card.rotation.y = Math.atan2(7.5, 11);
      const arrive = 1 - easeOutCubic(clamp01((time - LAND_AT) / 0.2));
      card.scale.setScalar(Math.max(0.001, easeOutBack(pop) * (time > LAND_AT ? arrive : 1)));
    }

    // The pin takes the price: one bounce, a ring, and its new tag.
    const bounce = time > LAND_AT && time < LAND_AT + 0.6 ? Math.sin(((time - LAND_AT) / 0.6) * Math.PI) : 0;
    target.position.y = 0.08 + 0.22 * bounce;
    const pulse = clamp01((time - LAND_AT) / 0.9);
    ring.visible = time > LAND_AT && time < LAND_AT + 0.9;
    ring.scale.setScalar(0.4 + 1.6 * easeOutCubic(pulse));
    ringMaterial.opacity = 0.7 * (1 - pulse);
    const shown = time > LAND_AT + 0.15 && time < 6.6;
    tag.visible = shown;
    tag.scale.setScalar(Math.max(0.001, shown ? easeOutBack(clamp01((time - LAND_AT - 0.15) / 0.35)) : 0));
  }

  return runScene(stage, {
    update,
    fit: { halfWidth: 4.3, minHalfHeight: 2.9 },
    startAt: 0.4,
    // The card mid-flight, so the still frame tells the whole story.
    stillAt: 4.3,
    dispose() {
      textures.forEach((texture) => texture.dispose());
      screenMaterials.forEach((material) => material.dispose());
      ringMaterial.dispose();
    },
  });
}
