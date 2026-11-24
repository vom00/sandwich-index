/// <reference lib="webworker" />
import { GIFEncoder, applyPalette, quantize } from "gifenc";

/**
 * Turns the receipt's frames into a GIF off the main thread: one palette
 * taken from the finished card (it holds every colour the slip ever shows),
 * applied to every frame, and no loop extension, so the GIF plays once and
 * stays on the printed price.
 */
export interface EncodeRequest {
  width: number;
  height: number;
  /** RGBA, one buffer per frame, transferred rather than copied. */
  frames: ArrayBuffer[];
  /** Milliseconds per frame. */
  delays: number[];
}

/** Paper, slip, ink and the tiers, exactly: quantizing alone turns the white slip grey. */
const TOKENS = [
  [255, 255, 255],
  [242, 239, 232],
  [21, 20, 15],
  [82, 79, 69],
  [107, 103, 91],
  [15, 92, 85],
  [138, 90, 18],
  [123, 45, 59],
];

const distance2 = (a: number[], b: number[]) => (a[0]! - b[0]!) ** 2 + (a[1]! - b[1]!) ** 2 + (a[2]! - b[2]!) ** 2;

/**
 * The tokens themselves, then only the quantized colours that are not near
 * one. Quantizing alone merged the white slip and the paper ground into one
 * in-between colour; with nothing in between left in the palette, a pixel
 * near a token lands on the token.
 */
function withTokens(palette: number[][]): number[][] {
  const rest = palette.filter((colour) => TOKENS.every((token) => distance2(colour, token) >= 22 ** 2));
  return [...TOKENS.map((token) => [...token]), ...rest];
}

self.onmessage = (event: MessageEvent<EncodeRequest>) => {
  const { width, height, frames, delays } = event.data;
  const finished = new Uint8Array(frames[frames.length - 1]!);
  const palette = withTokens(quantize(finished, 64));
  const gif = GIFEncoder();
  frames.forEach((buffer, i) => {
    const index = applyPalette(new Uint8Array(buffer), palette);
    gif.writeFrame(index, width, height, i === 0 ? { palette, delay: delays[i], repeat: -1 } : { delay: delays[i] });
  });
  gif.finish();
  const bytes = gif.bytes();
  (self as unknown as DedicatedWorkerGlobalScope).postMessage(bytes, [bytes.buffer]);
};
