/**
 * The measuring tape: drawn once per resize as four SVG paths (spine, cent
 * ticks, ten-cent ticks, the national marks) and one text group. Scrolling
 * then only translates it, so the tape costs nothing per frame.
 */

import { formatCents } from "@/lib/money";

/** The spine's x inside the tape; tick labels sit to its left. */
export const SPINE_X = 64;

export interface TapeGeometry {
  /** The cent value at the tape's top edge. */
  origin: number;
  /** Tape y of the cheapest and dearest prices. */
  yLo: number;
  yHi: number;
}

export function drawTape(
  svg: SVGSVGElement,
  lo: number,
  hi: number,
  marks: readonly number[],
  pxPerCent: number,
): TapeGeometry {
  // A ten-cent margin past each end so the end caps never sit on the edge.
  const origin = Math.floor(lo / 10) * 10 - 10;
  const last = Math.ceil(hi / 10) * 10 + 10;
  const height = Math.ceil((last - origin) * pxPerCent + 1);
  const y = (cents: number) => Math.round((cents - origin) * pxPerCent) + 0.5;

  let minor = "";
  let major = "";
  let text = "";
  for (let c = origin; c <= last; c += 1) {
    if (c % 10 === 0) {
      major += `M${SPINE_X} ${y(c)}h18`;
      text += `<text x="${SPINE_X - 8}" y="${y(c) + 3.5}">${formatCents(c)}</text>`;
    } else {
      minor += `M${SPINE_X} ${y(c)}h${c % 5 === 0 ? 11 : 6}`;
    }
  }
  const markPath = marks.map((m) => `M${SPINE_X} ${y(m)}h26`).join("");
  const yLo = y(lo);
  const yHi = y(hi);

  svg.setAttribute("width", "128");
  svg.setAttribute("height", String(height));
  svg.setAttribute("viewBox", `0 0 128 ${height}`);
  svg.innerHTML =
    `<path class="lc-t-spine" d="M${SPINE_X + 0.5} 0V${height}"/>` +
    `<path class="lc-t-minor" d="${minor}"/>` +
    `<path class="lc-t-major" d="${major}"/>` +
    `<path class="lc-t-mark" d="${markPath}"/>` +
    `<path class="lc-t-end" d="M${SPINE_X} ${yLo}h40M${SPINE_X} ${yHi}h40"/>` +
    `<g class="lc-t-text">${text}</g>`;

  return { origin, yLo, yHi };
}
