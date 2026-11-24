import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

/**
 * The landing scene's two models are exported by scripts/blender/burger-clip.py
 * from the spec in scripts/blender/clips.json. These hold the files in
 * public/landing to that spec: under the byte budget, carrying the named clip,
 * with a channel for every keyed part, and with nothing the scene would have to
 * download besides the file itself (no textures or materials).
 */

interface Spec {
  fps: number;
  frames: number;
  models: { source: string; clip: string; maxBytes: number; remove: string[]; parts: Record<string, unknown> }[];
}

interface Gltf {
  nodes: { name?: string }[];
  animations?: { name?: string; channels: { target: { node: number; path: string } }[] }[];
  images?: unknown[];
  materials?: unknown[];
}

const spec = JSON.parse(readFileSync(new URL("../../scripts/blender/clips.json", import.meta.url), "utf8")) as Spec;

/** The JSON chunk of a binary glTF: 12-byte header, then chunk length, chunk type "JSON", chunk. */
function readGlb(file: string): { bytes: number; json: Gltf } {
  const buffer = readFileSync(new URL(`../../public/landing/${file}`, import.meta.url));
  expect(buffer.toString("ascii", 0, 4)).toBe("glTF");
  expect(buffer.readUInt32LE(4)).toBe(2);
  const length = buffer.readUInt32LE(12);
  expect(buffer.toString("ascii", 16, 20)).toBe("JSON");
  return { bytes: buffer.length, json: JSON.parse(buffer.toString("utf8", 20, 20 + length)) as Gltf };
}

describe.each(spec.models)("public/landing/$source", (model) => {
  const { bytes, json } = readGlb(model.source);

  it(`stays under ${model.maxBytes} bytes`, () => {
    expect(bytes).toBeLessThanOrEqual(model.maxBytes);
  });

  it("carries no textures or materials", () => {
    expect(json.images ?? []).toHaveLength(0);
    expect(json.materials ?? []).toHaveLength(0);
  });

  it(`has the ${model.clip} clip with rotation and translation for every keyed part`, () => {
    const clip = json.animations?.find((animation) => animation.name === model.clip);
    expect(clip).toBeDefined();
    const animated = new Map<string, Set<string>>();
    for (const channel of clip!.channels) {
      const name = json.nodes[channel.target.node]?.name ?? "";
      animated.set(name, (animated.get(name) ?? new Set()).add(channel.target.path));
    }
    for (const part of Object.keys(model.parts)) {
      expect(animated.get(part), part).toEqual(new Set(["rotation", "translation"]));
    }
  });

  it("drops the parts the spec removes", () => {
    const names = json.nodes.map((node) => node.name);
    for (const part of model.remove) expect(names).not.toContain(part);
  });
});
