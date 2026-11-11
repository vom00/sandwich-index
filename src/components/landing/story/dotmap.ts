/**
 * The national dot map on a plain 2D canvas: 3,862 cells from
 * `loadPriceMap()`, coloured by price tier. No three.js here.
 *
 * While the dots are flying it redraws them all (one path per tier, so four
 * fills a frame). Once they have landed, each tier is baked to its own
 * offscreen layer and a frame is four `drawImage` calls with an alpha.
 */

import { priceTier, type PriceMap, type PriceTier } from "@/lib/landing-map";

const TIERS: readonly PriceTier[] = ["none", "mid", "low", "high"];

export interface TierColors {
  low: string;
  mid: string;
  high: string;
  none: string;
  ink: string;
}

export interface DotMapFrame {
  flight: number;
  alpha: Record<PriceTier, number>;
  /** 0..1: the single dot the sandwich shrinks into. */
  origin: number;
}

export interface DotMap {
  resize(w: number, h: number, dpr: number): void;
  draw(frame: DotMapFrame): void;
}

export function tierColors(): TierColors {
  const style = getComputedStyle(document.documentElement);
  const read = (name: string, fallback: string) => style.getPropertyValue(name).trim() || fallback;
  return {
    low: read("--color-tier-low", "teal"),
    mid: read("--color-tier-mid", "peru"),
    high: read("--color-tier-high", "brown"),
    none: read("--color-rule", "silver"),
    ink: read("--color-ink", "black"),
  };
}

export function createDotMap(canvas: HTMLCanvasElement, data: PriceMap, colors: TierColors): DotMap {
  const ctx = canvas.getContext("2d")!;
  const n = data.points.length;
  const tx = new Float32Array(n);
  const ty = new Float32Array(n);
  const delay = new Float32Array(n);
  const tier = new Uint8Array(n);

  // Flight order: outward from the middle of the map, with a little jitter so
  // the wave is not a perfect ring.
  const cx = data.width / 2;
  const cy = data.height / 2;
  const maxDist = Math.hypot(cx, cy);
  data.points.forEach((point, i) => {
    tx[i] = point[0];
    ty[i] = point[1];
    tier[i] = TIERS.indexOf(priceTier(point[2], data.priceCents));
    const jitter = ((i * 2654435761) % 1000) / 1000;
    delay[i] = 0.55 * (Math.hypot(point[0] - cx, point[1] - cy) / maxDist) + 0.12 * jitter;
  });

  let dpr = 1;
  let unit = 1;
  let radius = 1;
  let baked: HTMLCanvasElement[] | null = null;

  const fill: Record<PriceTier, string> = { none: colors.none, mid: colors.mid, low: colors.low, high: colors.high };

  function trace(target: CanvasRenderingContext2D, only: number, f: number): void {
    target.beginPath();
    const ox = cx * unit;
    const oy = cy * unit;
    for (let i = 0; i < n; i += 1) {
      if (tier[i] !== only) continue;
      const q = f >= 1 ? 1 : Math.min(1, Math.max(0, (f - delay[i]!) / 0.33));
      if (q <= 0) continue;
      const e = 1 - (1 - q) ** 3;
      const x = ox + (tx[i]! * unit - ox) * e;
      const y = oy + (ty[i]! * unit - oy) * e;
      target.moveTo(x + radius, y);
      target.arc(x, y, radius, 0, Math.PI * 2);
    }
    target.fill();
  }

  function bake(): HTMLCanvasElement[] {
    return TIERS.map((name, index) => {
      const layer = document.createElement("canvas");
      layer.width = canvas.width;
      layer.height = canvas.height;
      const layerCtx = layer.getContext("2d")!;
      layerCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
      layerCtx.fillStyle = fill[name];
      trace(layerCtx, index, 1);
      return layer;
    });
  }

  return {
    resize(w, h, nextDpr) {
      dpr = nextDpr;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      unit = w / data.width;
      radius = Math.max(0.75, unit * 5 * 0.42);
      baked = null;
    },
    draw(frame) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      if (frame.flight >= 1) {
        baked ??= bake();
        TIERS.forEach((name, index) => {
          const a = frame.alpha[name];
          if (a <= 0.001) return;
          ctx.globalAlpha = a;
          ctx.drawImage(baked![index]!, 0, 0);
        });
        ctx.globalAlpha = 1;
      } else if (frame.flight > 0) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        TIERS.forEach((name, index) => {
          ctx.globalAlpha = frame.alpha[name];
          ctx.fillStyle = fill[name];
          trace(ctx, index, frame.flight);
        });
        ctx.globalAlpha = 1;
      }
      if (frame.origin > 0.001) {
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.globalAlpha = frame.origin;
        ctx.fillStyle = colors.ink;
        ctx.beginPath();
        ctx.arc(cx * unit, cy * unit, 5, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      }
    },
  };
}
