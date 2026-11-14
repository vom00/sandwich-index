/**
 * The Kenney models the landing world is built from, as packed by
 * scripts/pack-landing-models.mjs into public/landing/town.bin.gz: plain
 * vertex-coloured geometry, already on the site's palette, one entry per part.
 */

import { BufferAttribute, BufferGeometry } from "three";

export type Parts = ReadonlyMap<string, BufferGeometry>;

interface Entry {
  vertices: number;
  indices: number;
  min: [number, number, number];
  max: [number, number, number];
  offset: number;
}

const pad4 = (n: number) => (n + 3) & ~3;

/** sRGB byte to linear, which is what three expects of vertex colours. */
const LINEAR = Float32Array.from({ length: 256 }, (_, i) => {
  const c = i / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
});

async function gunzip(bytes: Uint8Array<ArrayBuffer>): Promise<ArrayBuffer> {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Response(stream).arrayBuffer();
}

export function decodeParts(buffer: ArrayBuffer): Parts {
  const head = new Uint8Array(buffer, 0, 4);
  if (String.fromCharCode(...head) !== "SIK1") throw new Error("parts: not a SIK1 file");
  const jsonLength = new DataView(buffer).getUint32(4, true);
  const { parts } = JSON.parse(new TextDecoder().decode(new Uint8Array(buffer, 8, jsonLength))) as {
    parts: Record<string, Entry>;
  };
  const base = 8 + jsonLength;
  const out = new Map<string, BufferGeometry>();
  for (const [name, entry] of Object.entries(parts)) {
    const { vertices: v, indices: i, min, max } = entry;
    let at = base + entry.offset;
    const quantised = new Int16Array(buffer, at, v * 3);
    at += pad4(v * 6);
    const packedNormals = new Int8Array(buffer, at, v * 3);
    at += pad4(v * 3);
    const packedColors = new Uint8Array(buffer, at, v * 3);
    at += pad4(v * 3);
    const index = v > 65535 ? new Uint32Array(buffer.slice(at, at + i * 4)) : new Uint16Array(buffer.slice(at, at + i * 2));

    const position = new Float32Array(v * 3);
    const normal = new Float32Array(v * 3);
    const color = new Float32Array(v * 3);
    for (let k = 0; k < v * 3; k += 1) {
      const axis = k % 3;
      const low = min[axis]!;
      position[k] = low + ((quantised[k]! + 32768) / 65535) * (max[axis]! - low);
      normal[k] = packedNormals[k]! / 127;
      color[k] = LINEAR[packedColors[k]!]!;
    }
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(position, 3));
    geometry.setAttribute("normal", new BufferAttribute(normal, 3));
    geometry.setAttribute("color", new BufferAttribute(color, 3));
    geometry.setIndex(new BufferAttribute(index, 1));
    geometry.computeBoundingBox();
    out.set(name, geometry);
  }
  return out;
}

export async function loadParts(url = "/landing/town.bin.gz"): Promise<Parts> {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`parts: ${response.status}`);
  const bytes = new Uint8Array(await response.arrayBuffer());
  // Served as stored (gzip) or already decoded by the server: either works.
  const buffer = bytes[0] === 0x1f && bytes[1] === 0x8b ? await gunzip(bytes) : bytes.buffer;
  return decodeParts(buffer);
}
