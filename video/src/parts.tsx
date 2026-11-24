import { useMemo, type CSSProperties, type ReactNode } from "react";
import { Easing, interpolate, useCurrentFrame, useVideoConfig } from "remotion";

import { flipAt, planFlip, type FlapFrame } from "@/components/landing/world/splitflap";

/** The site's tokens (src/app/globals.css). No red or yellow. */
export const C = {
  paper: "#fbfaf7",
  paperSunken: "#f2efe8",
  ink: "#15140f",
  inkMuted: "#524f45",
  inkSubtle: "#6b675b",
  rule: "#ddd8cc",
  accent: "#12395e",
  low: "#0f5c55",
  mid: "#8a5a12",
  high: "#7b2d3b",
} as const;

export const DISPLAY = "Fraunces, Georgia, serif";
export const MONO = "'IBM Plex Mono', monospace";

/** --ease-out-quart and --ease-out-expo. */
export const QUART = Easing.bezier(0.165, 0.84, 0.44, 1);
export const EXPO = Easing.bezier(0.19, 1, 0.22, 1);

const clamp = { extrapolateLeft: "clamp", extrapolateRight: "clamp" } as const;

/** Frames for a duration in milliseconds. */
export function ms(value: number, fps: number): number {
  return (value / 1000) * fps;
}

/** The `.reveal` rise: 12px and a fade over 600ms, from `start` (frames). */
export function Rise({ start, children, style }: { start: number; children: ReactNode; style?: CSSProperties }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = interpolate(frame - start, [0, ms(600, fps)], [0, 1], { ...clamp, easing: QUART });
  return <div style={{ ...style, opacity: t, transform: `translateY(${(1 - t) * 12}px)` }}>{children}</div>;
}

/**
 * The odometer (components/ui/Odometer.tsx), driven by the frame: each digit
 * rolls up from 0 on its own wheel, 1100ms a wheel, 70ms between wheels, on
 * --ease-out-expo. Plex Mono's digits are all one width, so nothing shifts.
 */
export function Rolling({ text, start, style }: { text: string; start: number; style?: CSSProperties }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  let wheel = 0;
  return (
    <span style={{ display: "inline-flex", fontFamily: MONO, fontVariantNumeric: "tabular-nums", lineHeight: 1.1, ...style }}>
      {Array.from(text).map((character, index) => {
        if (!/\d/.test(character)) return <span key={index}>{character}</span>;
        const t = interpolate(frame - start - wheel++ * ms(70, fps), [0, ms(1100, fps)], [0, 1], { ...clamp, easing: EXPO });
        return (
          <span key={index} style={{ display: "inline-block", height: "1.1em", overflow: "hidden" }}>
            <span style={{ display: "block", transform: `translateY(${-t * Number(character) * 1.1}em)` }}>
              {"0123456789".split("").map((digit) => (
                <span key={digit} style={{ display: "block", height: "1.1em" }}>
                  {digit}
                </span>
              ))}
            </span>
          </span>
        );
      })}
    </span>
  );
}

const TILE_W = 92;
const TILE_H = 128;

function Half({ character, part, scale }: { character: string; part: "top" | "bottom"; scale: number }) {
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        height: TILE_H / 2,
        [part]: 0,
        overflow: "hidden",
        background: C.ink,
        borderRadius: part === "top" ? "8px 8px 0 0" : "0 0 8px 8px",
        transform: `scaleY(${scale})`,
        transformOrigin: part === "top" ? "bottom" : "top",
      }}
    >
      <div
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          height: TILE_H,
          top: part === "top" ? 0 : -TILE_H / 2,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: C.paper,
          fontFamily: MONO,
          fontWeight: 500,
          fontSize: 92,
        }}
      >
        {character}
      </div>
    </div>
  );
}

/** One tile: the top flap folds down over the next character, then the bottom unfolds. */
function Flap({ frame }: { frame: FlapFrame }) {
  const { current, next, progress } = frame;
  return (
    <div style={{ position: "relative", width: TILE_W, height: TILE_H }}>
      <Half character={next} part="top" scale={1} />
      <Half character={current} part="bottom" scale={1} />
      {progress < 0.5 ? (
        <Half character={current} part="top" scale={1 - progress * 2} />
      ) : (
        <Half character={next} part="bottom" scale={progress * 2 - 1} />
      )}
      <div style={{ position: "absolute", left: 0, right: 0, top: TILE_H / 2 - 1, height: 2, background: C.paper }} />
    </div>
  );
}

/**
 * The landing scene's split-flap board (components/landing/world/splitflap.ts),
 * turning from blank to `text` once, starting at `start` frames: 75ms a flap,
 * 30ms between columns, forward only.
 */
export function FlapBoard({ text, start }: { text: string; start: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const flip = useMemo(() => planFlip(" ".repeat(text.length), text, (start / fps) * 1000), [text, start, fps]);
  const { columns } = flipAt(flip, (frame / fps) * 1000);
  return (
    <div style={{ display: "flex", gap: 10 }} aria-label={text}>
      {columns.map((column, index) => (
        <Flap key={index} frame={column} />
      ))}
    </div>
  );
}

/** The thin masthead every scene but the end card carries. */
export function Masthead({ month }: { month: string }) {
  return (
    <div
      style={{
        position: "absolute",
        top: 64,
        left: 72,
        right: 72,
        display: "flex",
        justifyContent: "space-between",
        paddingBottom: 18,
        borderBottom: `2px solid ${C.ink}`,
        fontFamily: MONO,
        fontSize: 26,
        letterSpacing: "0.12em",
        textTransform: "uppercase",
        color: C.ink,
      }}
    >
      <span>Sandwich Index</span>
      <span>{month}</span>
    </div>
  );
}
