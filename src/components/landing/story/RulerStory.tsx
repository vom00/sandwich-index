"use client";

import { useEffect, useRef, type ReactNode } from "react";

import { loadPriceMap, type PriceMapScale } from "@/lib/landing-map";
import { formatCents, formatCount } from "@/lib/money";

import type { DotMap } from "./dotmap";
import { measureLayout } from "./layout";
import type { SandwichScene } from "./sandwich";
import { drawTape, SPINE_X } from "./tape";
import {
  layerAnchors,
  stageState,
  storyClock,
  type Layout,
  type RulerScale,
  type StageState,
} from "./timeline";

export interface StoryFacts {
  lowCents: number | null;
  highCents: number | null;
  spreadCents: number | null;
  lowLabel: string | null;
  highLabel: string | null;
  scale: PriceMapScale;
  mapStores: number;
  mapPriced: number;
  tierCounts: { low: number; mid: number; high: number; none: number };
  dotCount: number;
}

/** Bottom to top, the order of the layers in the scene. */
const PARTS = ["Bottom bun", "Breaded chicken patty", "Shredded lettuce", "Top bun"] as const;

/* -------------------------------------------------------------------------- */

function hasWebGL(): boolean {
  try {
    const probe = document.createElement("canvas");
    const context = probe.getContext("webgl2") ?? probe.getContext("webgl");
    if (context === null) return false;
    context.getExtension("WEBGL_lose_context")?.loseContext();
    return true;
  } catch {
    return false;
  }
}

function whenIdle(callback: () => void, timeout = 1200): () => void {
  if (typeof window.requestIdleCallback === "function") {
    const handle = window.requestIdleCallback(callback, { timeout });
    return () => window.cancelIdleCallback(handle);
  }
  const handle = window.setTimeout(callback, 250);
  return () => window.clearTimeout(handle);
}

/** Writes a style only when it changed, so idle frames touch nothing. */
class Writer {
  private cache = new WeakMap<HTMLElement | SVGElement, Record<string, string>>();
  style(el: HTMLElement | SVGElement | null, prop: string, value: string): void {
    if (el === null) return;
    let entry = this.cache.get(el);
    if (entry === undefined) {
      entry = {};
      this.cache.set(el, entry);
    }
    if (entry[prop] === value) return;
    entry[prop] = value;
    el.style.setProperty(prop, value);
  }
  attr(el: Element | null, name: string, value: string): void {
    if (el === null) return;
    if (el.getAttribute(name) !== value) el.setAttribute(name, value);
  }
  reset(): void {
    this.cache = new WeakMap();
  }
}

const tierOf = (cents: number, scale: PriceMapScale) =>
  cents <= scale.p10 ? "low" : cents >= scale.p90 ? "high" : "mid";

/* -------------------------------------------------------------------------- */

export function RulerStory({ facts, children }: { facts: StoryFacts; children: ReactNode }) {
  const storyRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const glRef = useRef<HTMLCanvasElement>(null);
  const leadersRef = useRef<SVGSVGElement>(null);
  const labelsRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLDivElement>(null);
  const rulerRef = useRef<HTMLDivElement>(null);
  const tapeRef = useRef<HTMLDivElement>(null);
  const ticksRef = useRef<SVGSVGElement>(null);
  const readLineRef = useRef<HTMLDivElement>(null);
  const readingRef = useRef<HTMLDivElement>(null);
  const readingFigRef = useRef<HTMLSpanElement>(null);
  const readingCapRef = useRef<HTMLSpanElement>(null);
  const mapRef = useRef<HTMLCanvasElement>(null);

  const hasRuler = facts.lowCents !== null && facts.highCents !== null && facts.highCents > facts.lowCents;
  const lo = facts.lowCents ?? facts.scale.min;
  const hi = facts.highCents ?? facts.scale.max;
  const marks = [
    { cents: facts.scale.p10, name: "Cheapest tenth", note: "or less" },
    { cents: facts.scale.median, name: "National median", note: "" },
    { cents: facts.scale.p90, name: "Dearest tenth", note: "or more" },
  ].filter((mark) => mark.cents > lo && mark.cents < hi);

  useEffect(() => {
    const story = storyRef.current!;
    const stage = stageRef.current!;
    const gl = glRef.current!;
    const leaders = leadersRef.current!;
    const labelBox = labelsRef.current!;
    const title = titleRef.current!;
    const ruler = rulerRef.current;
    const tape = tapeRef.current;
    const ticks = ticksRef.current;
    const readLine = readLineRef.current;
    const reading = readingRef.current;
    const readingFig = readingFigRef.current;
    const readingCap = readingCapRef.current;
    const mapCanvas = mapRef.current!;

    const labels = Array.from(labelBox.children) as HTMLElement[];
    const leaderLines = Array.from(leaders.querySelectorAll("polyline"));
    const leaderDots = Array.from(leaders.querySelectorAll("circle"));
    const markEls = tape ? (Array.from(tape.querySelectorAll("[data-mark]")) as HTMLElement[]) : [];
    const endEls = tape ? (Array.from(tape.querySelectorAll("[data-end]")) as HTMLElement[]) : [];
    const keyItems = Array.from(story.querySelectorAll<HTMLElement>(".lc-key li[data-tier]"));

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const scale: RulerScale = { lo, hi, marks: marks.map((m) => m.cents) };
    const write = new Writer();
    const anchors = new Float32Array(8);

    let layout: Layout | null = null;
    let tapeOrigin = 0;
    let dpr = 1;
    let scene: SandwichScene | null = null;
    let dotMap: DotMap | null = null;
    let disposed = false;
    let active = false;
    let raf = 0;
    let lastY = Number.NaN;
    let lastTime = 0;
    let spin = 0;
    let dirty = true;
    let lastPoseKey = "";
    let lastMapKey = "";
    let lastCents = -1;
    const cancels: (() => void)[] = [];

    /* ---------------------------------------------------------------- measure */

    function measure(): void {
      const next = measureLayout(story, stage, lo, hi);
      layout = next;
      // Exposed for the screenshot and browser test scripts, which scroll to chapter clocks.
      story.dataset.bounds = next.bounds.map(Math.round).join(",");
      dpr = Math.min(window.devicePixelRatio || 1, next.vw < 640 ? 1.5 : 2);

      // Static placements: written once per resize, never per frame.
      gl.style.width = `${next.box}px`;
      gl.style.height = `${next.box}px`;
      scene?.resize(next.box, dpr);

      labels.forEach((label) => {
        label.style.width = `${Math.max(120, next.explode.labelW)}px`;
      });
      title.style.left = `${next.explode.labelX}px`;
      title.style.top = `${next.vh * 0.5 + next.explode.k * 0.44}px`;
      title.style.display = next.side ? "" : "none";

      const r = next.ruler;
      if (ruler && tape && ticks && readLine && reading) {
        const geometry = drawTape(ticks, lo, hi, scale.marks, r.pxPerCent);
        tapeOrigin = geometry.origin;
        markEls.forEach((el) => {
          el.style.top = `${(Number(el.dataset.mark) - geometry.origin) * r.pxPerCent}px`;
          el.style.maxWidth = `${r.labelW}px`;
        });
        endEls.forEach((el) => {
          el.style.top = `${el.dataset.end === "lo" ? geometry.yLo : geometry.yHi}px`;
          el.style.width = `${r.labelW}px`;
        });
        ruler.style.left = `${r.x - SPINE_X}px`;
        readLine.style.left = `${r.x}px`;
        readLine.style.top = `${r.readingY}px`;
        readLine.style.width = `${Math.max(10, r.sandwich.x - 0.21 * r.sandwich.k - r.x)}px`;
        reading.style.top = `${r.readingY2}px`;
        reading.dataset.align = r.readingAlign;
        reading.style.left = r.readingAlign === "left" ? `${r.readingX}px` : "";
        reading.style.right = r.readingAlign === "left" ? "" : `${next.vw - r.readingX}px`;
      }

      const m = next.map;
      mapCanvas.style.left = `${m.x}px`;
      mapCanvas.style.top = `${m.y}px`;
      mapCanvas.style.width = `${m.w}px`;
      mapCanvas.style.height = `${m.h}px`;
      dotMap?.resize(m.w, m.h, dpr);

      write.reset();
      lastPoseKey = "";
      lastMapKey = "";
      lastCents = -1;
      dirty = true;
    }

    /* ------------------------------------------------------------------ apply */

    function apply(st: StageState): void {
      if (layout === null) return;
      const s = st.sandwich;
      const box = layout.box;

      // The canvas box rides on the compositor; the scene only redraws when
      // something it draws changed.
      if (scene !== null) {
        write.style(gl, "transform", `translate3d(${(s.x - box / 2).toFixed(1)}px, ${(s.y - box / 2).toFixed(1)}px, 0)`);
        write.style(gl, "opacity", s.visible ? "1" : "0");
        if (s.visible) {
          const key = `${(s.k * s.scale).toFixed(2)}|${s.pitch.toFixed(4)}|${s.yaw.toFixed(4)}|${s.explode.toFixed(4)}|${s.shadow.toFixed(3)}`;
          if (key !== lastPoseKey) {
            lastPoseKey = key;
            scene.draw(s);
          }
        }
      }

      // Exploded-view labels, pinned to the layers' projected rims.
      const labelAlpha = scene !== null ? st.labels : 0;
      write.style(leaders, "opacity", labelAlpha.toFixed(3));
      write.style(labelBox, "opacity", labelAlpha.toFixed(3));
      if (labelAlpha > 0.001) {
        layerAnchors(s, anchors);
        const x = layout.explode.labelX;
        const gap = layout.side ? 52 : 40;
        // Top bun first: walk upward through the layers, keeping labels apart.
        let floor = -Infinity;
        for (let j = 3; j >= 0; j -= 1) {
          const ax = anchors[j * 2]!;
          const ay = anchors[j * 2 + 1]!;
          const ly = Math.max(ay, floor + gap);
          floor = ly;
          const label = labels[3 - j]!;
          write.style(label, "transform", `translate3d(${x.toFixed(1)}px, ${(ly - 9).toFixed(1)}px, 0)`);
          write.attr(leaderLines[j] ?? null, "points", `${ax.toFixed(1)},${ay.toFixed(1)} ${(x - 28).toFixed(1)},${ly.toFixed(1)} ${(x - 8).toFixed(1)},${ly.toFixed(1)}`);
          write.attr(leaderDots[j] ?? null, "cx", ax.toFixed(1));
          write.attr(leaderDots[j] ?? null, "cy", ay.toFixed(1));
        }
      }
      write.style(title, "opacity", st.title.toFixed(3));

      // The ruler.
      if (ruler && tape && readLine && reading && readingFig && readingCap) {
        write.style(ruler, "opacity", st.ruler.toFixed(3));
        write.style(ruler, "visibility", st.ruler > 0.001 ? "visible" : "hidden");
        write.style(readLine, "opacity", st.ruler.toFixed(3));
        write.style(readLine, "transform", `scaleX(${(1 - st.rulerSlide).toFixed(3)})`);
        write.style(reading, "opacity", st.ruler.toFixed(3));
        if (st.ruler > 0.001) {
          const r = layout.ruler;
          const ty = r.readingY - (st.cents - tapeOrigin) * r.pxPerCent;
          write.style(tape, "transform", `translate3d(${(-24 * st.rulerSlide).toFixed(1)}px, ${ty.toFixed(1)}px, 0)`);
          const cents = Math.round(st.cents);
          if (cents !== lastCents) {
            lastCents = cents;
            readingFig.textContent = formatCents(cents);
            reading.dataset.tier = tierOf(cents, facts.scale);
            readingCap.textContent =
              cents <= lo ? "the cheapest in the index" : `+${formatCents(cents - lo)} over the cheapest`;
            markEls.forEach((el) => {
              const at = Number(el.dataset.mark);
              const state = Math.abs(cents - at) <= 3 ? "on" : cents > at ? "past" : "ahead";
              if (el.dataset.state !== state) el.dataset.state = state;
            });
          }
        }
      }

      // The dot map.
      write.style(mapCanvas, "opacity", st.map.toFixed(3));
      if (dotMap !== null && st.map > 0.001) {
        const dim = 0.85;
        const alpha = {
          low: 1 - dim * st.wHigh * (1 - st.wEnd),
          high: 1 - dim * st.wLow,
          mid: 1 - dim * Math.max(st.wLow, st.wHigh, st.wEnd),
          none: 1 - dim * Math.max(st.wLow, st.wHigh, st.wEnd),
        };
        const key = `${st.flight.toFixed(4)}|${alpha.low.toFixed(3)}|${alpha.high.toFixed(3)}|${alpha.mid.toFixed(3)}|${st.origin.toFixed(3)}`;
        if (key !== lastMapKey) {
          lastMapKey = key;
          dotMap.draw({ flight: st.flight, alpha, origin: st.origin });
        }
      }
      const on = st.S >= 3.6 ? (st.wEnd > 0.5 ? "ends" : st.wHigh > 0.5 ? "high" : st.wLow > 0.5 ? "low" : "") : "";
      keyItems.forEach((item) => {
        const tier = item.dataset.tier;
        const state = on === "" ? "" : on === "ends" ? (tier === "low" || tier === "high" ? "on" : "off") : tier === on ? "on" : "off";
        if ((item.dataset.state ?? "") !== state) item.dataset.state = state;
      });
    }

    /* ------------------------------------------------------------------- loop */

    function frame(now: number): void {
      raf = requestAnimationFrame(frame);
      if (layout === null) return;
      const dt = lastTime === 0 ? 0 : Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;
      const y = window.scrollY;
      const S = storyClock(y, layout);
      const spinning = scene !== null && S < 1;
      if (spinning) spin += dt * 0.38;
      if (y === lastY && !spinning && !dirty) return;
      lastY = y;
      dirty = false;
      apply(stageState(S, y, layout, scale, spin));
    }

    function run(): void {
      const should = !reduced && active && document.visibilityState === "visible";
      if (should && raf === 0) {
        lastTime = 0;
        raf = requestAnimationFrame(frame);
      } else if (!should && raf !== 0) {
        cancelAnimationFrame(raf);
        raf = 0;
      }
    }

    /** Reduced motion: one still frame of the hero, nothing else. */
    function still(): void {
      if (layout === null) return;
      apply(stageState(0, layout.storyTop, layout, scale, 0.6));
    }

    /* -------------------------------------------------------------- loading */

    async function loadScene(): Promise<void> {
      if (!hasWebGL() || layout === null) return;
      try {
        const { createSandwichScene } = await import("./sandwich");
        if (disposed || layout === null) return;
        const created = await createSandwichScene(gl, layout.box, dpr);
        if (disposed) {
          created.dispose();
          return;
        }
        scene = created;
        gl.dataset.ready = "true";
        dirty = true;
        lastPoseKey = "";
        if (reduced) still();
      } catch {
        // No 3D: the type, the ruler and the map carry the page on their own.
      }
    }

    async function loadMap(): Promise<void> {
      if (reduced) return;
      const [{ createDotMap, tierColors }, data] = await Promise.all([import("./dotmap"), loadPriceMap()]);
      if (disposed || layout === null) return;
      dotMap = createDotMap(mapCanvas, data, tierColors());
      dotMap.resize(layout.map.w, layout.map.h, dpr);
      lastMapKey = "";
      dirty = true;
    }

    measure();
    if (reduced) still();

    const seen = new IntersectionObserver(
      ([entry]) => {
        active = entry?.isIntersecting ?? false;
        run();
      },
      { rootMargin: "200px" },
    );
    seen.observe(story);

    cancels.push(
      whenIdle(() => {
        void loadScene().then(() => {
          if (!disposed) cancels.push(whenIdle(() => void loadMap(), 2500));
        });
      }),
    );

    let resizeQueued = 0;
    const sizing = new ResizeObserver(() => {
      cancelAnimationFrame(resizeQueued);
      resizeQueued = requestAnimationFrame(() => {
        measure();
        if (reduced) still();
      });
    });
    sizing.observe(story);
    window.addEventListener("resize", measure);
    document.addEventListener("visibilitychange", run);

    return () => {
      disposed = true;
      cancels.forEach((cancel) => cancel());
      cancelAnimationFrame(raf);
      cancelAnimationFrame(resizeQueued);
      seen.disconnect();
      sizing.disconnect();
      window.removeEventListener("resize", measure);
      document.removeEventListener("visibilitychange", run);
      scene?.dispose();
      scene = null;
      dotMap = null;
    };
    // The facts are server data for this render; the effect runs once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div ref={storyRef} className="lc-story">
      <div ref={stageRef} className="lc-stage" aria-hidden="true">
        <canvas ref={glRef} className="lc-gl" />

        <svg ref={leadersRef} className="lc-leaders">
          {PARTS.map((part) => (
            <g key={part}>
              <polyline points="0,0 0,0" />
              <circle r="2.5" cx="0" cy="0" />
            </g>
          ))}
        </svg>
        <div ref={labelsRef} className="lc-labels">
          {[...PARTS].reverse().map((part, index) => (
            <div key={part} className="lc-label">
              <span className="lc-label-n">{String(index + 1).padStart(2, "0")}</span>
              <span className="lc-label-name">{part}</span>
              <span className="lc-label-note">Same part · {formatCount(facts.mapStores)} counters</span>
            </div>
          ))}
        </div>
        <div ref={titleRef} className="lc-title">
          <span>Drawing</span><b>McChicken, exploded</b>
          <span>Parts</span><b>4</b>
          <span>Stores mapped</span><b>{formatCount(facts.mapStores)}</b>
          <span>Price</span><b>Varies</b>
        </div>

        {hasRuler ? (
          <>
            <div ref={rulerRef} className="lc-ruler">
              <div ref={tapeRef} className="lc-tape">
                <svg ref={ticksRef} className="lc-ticks" />
                {marks.map((mark) => (
                  <div key={mark.name} data-mark={mark.cents} className="lc-mark">
                    <em>{mark.name}</em>
                    <span>
                      {formatCents(mark.cents)} {mark.note}
                    </span>
                  </div>
                ))}
                <div data-end="lo" className="lc-end lc-end--lo">
                  <em>Cheapest in the index</em>
                  <span>{formatCents(lo)}</span>
                  {facts.lowLabel ? <small>{facts.lowLabel}</small> : null}
                </div>
                <div data-end="hi" className="lc-end lc-end--hi">
                  <em>Priciest in the index</em>
                  <span>{formatCents(hi)}</span>
                  {facts.highLabel ? <small>{facts.highLabel}</small> : null}
                </div>
              </div>
            </div>
            <div ref={readLineRef} className="lc-readline" />
            <div ref={readingRef} className="lc-reading" data-tier={tierOf(lo, facts.scale)}>
              <span className="lc-reading-eyebrow">Reading</span>
              <span ref={readingFigRef} className="lc-reading-fig">
                {formatCents(lo)}
              </span>
              <span ref={readingCapRef} className="lc-reading-cap">
                the cheapest in the index
              </span>
            </div>
          </>
        ) : null}

        <canvas ref={mapRef} className="lc-map" />
      </div>

      <div className="lc-chapters">{children}</div>
    </div>
  );
}
