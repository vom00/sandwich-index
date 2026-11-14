"use client";

import { useEffect, useRef, type ReactNode } from "react";

import type { Region, World } from "./world";

/**
 * One world, one camera.
 *
 * A single full-viewport canvas is pinned behind the opening chapters, and the
 * camera inside it pulls back as the page scrolls: the sandwich on its tray,
 * the counter and its price board, the restaurant, the street, then the whole
 * country as a map. Scroll position maps to a "beat" (0 to 5) through the
 * chapters' own positions, so the text and the scene can never drift apart.
 *
 * Every figure the scene shows is also written in the chapters as text. The
 * text paints first; three.js, the models and the map data load when the
 * browser is idle. With reduced motion nothing is pinned: the canvas becomes
 * a still picture behind the hero and the chapters read as a plain page.
 * Without WebGL the page is the text, with a flat drawing of the map.
 */

const PHONE = 640;
const WIDE = 1024;
/** How far above a chapter's top its beat is reached, as a share of the viewport. */
const LEAD = 0.25;

function hasWebGL(): boolean {
  try {
    const probe = document.createElement("canvas");
    return (probe.getContext("webgl2") ?? probe.getContext("webgl")) !== null;
  } catch {
    return false;
  }
}

function whenIdle(callback: () => void, timeout = 1500): () => void {
  if (typeof window.requestIdleCallback === "function") {
    const handle = window.requestIdleCallback(callback, { timeout });
    return () => window.cancelIdleCallback(handle);
  }
  const handle = window.setTimeout(callback, 200);
  return () => window.clearTimeout(handle);
}

const docTop = (el: Element) => el.getBoundingClientRect().top + window.scrollY;

export function WorldStory({ prices, children }: { prices: readonly number[]; children: ReactNode }) {
  const rootRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const chaptersRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = rootRef.current;
    const canvas = canvasRef.current;
    const chapters = chaptersRef.current;
    if (root === null || canvas === null || chapters === null) return;
    const stage = canvas.parentElement as HTMLElement;

    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    root.dataset.mode = reduced ? "still" : "live";
    if (!hasWebGL()) {
      root.dataset.gl = "off";
      return;
    }
    root.dataset.gl = "on";

    let world: World | null = null;
    let disposed = false;
    let anchors: number[] = [0, 1];
    let target = 0;
    let shown = -1;
    let raf = 0;
    let last = 0;
    let active = true;
    let width = 1;
    let height = 1;
    // 2: shadows and full pixel ratio. 1: no shadows. 0: no shadows, pixel ratio 1.
    let quality = 2;
    let samples: number[] = [];
    const cancels: (() => void)[] = [];

    function heroRegion(storyTop: number): Region | undefined {
      const room = root!.querySelector<HTMLElement>("[data-hero-room]");
      if (room === null) return undefined;
      const top = docTop(room) - storyTop;
      const bottom = Math.min(top + room.offsetHeight, height);
      const h = Math.min(0.45, Math.max(0.22, (bottom - top) / height));
      const cy = Math.min(1 - h / 2, (top + bottom) / 2 / height);
      return { cx: 0.5, cy, w: 0.9, h };
    }

    function measure(): void {
      // On a wide screen the canvas is a panel beside the text, not the whole stage.
      width = Math.max(1, canvas!.clientWidth);
      height = Math.max(1, canvas!.clientHeight);
      // The same test the stylesheet uses, scrollbar included.
      const wide = window.matchMedia(`(min-width: ${WIDE}px)`).matches;
      const storyTop = docTop(root!);
      const beats = Array.from(chapters!.querySelectorAll<HTMLElement>("[data-beat]")).sort(
        (a, b) => Number(a.dataset.beat) - Number(b.dataset.beat),
      );
      anchors = [
        storyTop,
        ...beats.slice(1).map((el) => docTop(el) - height * LEAD),
        storyTop + root!.offsetHeight - height,
      ];
      // Exposed for the browser tests and the screenshot scripts.
      root!.dataset.anchors = anchors.map(Math.round).join(",");
      const cap = width < PHONE ? 1.5 : 2;
      const ratio = quality === 0 ? 1 : Math.min(window.devicePixelRatio || 1, cap);
      world?.resize({ width, height, wide, hero: wide ? undefined : heroRegion(storyTop) }, ratio);
      shown = -1;
      schedule();
    }

    function beatAt(y: number): number {
      for (let i = 0; i < anchors.length - 1; i += 1) {
        const from = anchors[i]!;
        const to = anchors[i + 1]!;
        if (i === 0 && y <= from) return 0;
        if (y < to) return i + (y - from) / Math.max(1, to - from);
      }
      return anchors.length - 1;
    }

    /** Drop a quality step when frames run long while the camera is moving. */
    function watch(dt: number): void {
      if (quality === 0) return;
      samples.push(dt);
      if (samples.length < 40) return;
      const sorted = [...samples].sort((a, b) => a - b);
      samples = [];
      if ((sorted[20] ?? 0) <= 30) return;
      quality -= 1;
      root!.dataset.quality = String(quality);
      if (quality === 1) world?.setShadows(false);
      else measure();
    }

    function frame(now: number): void {
      raf = 0;
      if (world === null) return;
      const dt = last === 0 ? 16 : Math.min(100, now - last);
      target = reduced ? 0 : beatAt(window.scrollY);
      if (shown < 0) shown = target;
      else shown += (target - shown) * (1 - Math.exp(-dt / 70));
      if (Math.abs(target - shown) < 0.0005) shown = target;
      world.update(shown);
      world.render();
      root!.dataset.beat = shown.toFixed(3);
      const calls = String(world.drawCalls());
      if (root!.dataset.calls !== calls) root!.dataset.calls = calls;
      if (shown !== target) {
        if (last !== 0) watch(dt);
        last = now;
        raf = requestAnimationFrame(frame);
      } else {
        last = 0;
      }
    }

    function schedule(): void {
      if (raf !== 0 || world === null || !active || document.visibilityState !== "visible") return;
      raf = requestAnimationFrame(frame);
    }

    async function load(): Promise<void> {
      try {
        const mono = getComputedStyle(document.documentElement).getPropertyValue("--font-plex-mono").trim() || "monospace";
        await document.fonts.load(`500 44px ${mono}`).catch(() => undefined);
        const { createWorld } = await import("./world");
        if (disposed) return;
        const created = await createWorld(canvas!, {
          prices,
          monoFont: mono,
          shadows: stage.clientWidth >= PHONE,
          // The board's price, in cents, for the browser tests.
          onBoardIndex: (index) => {
            root!.dataset.board = String(prices[index] ?? "");
          },
        });
        if (disposed) {
          created.dispose();
          return;
        }
        world = created;
        root!.dataset.board ??= String(prices[0] ?? "");
        measure();
        canvas!.dataset.ready = "true";
      } catch {
        // No 3D after all: the chapters carry the page, with the flat map.
        root!.dataset.gl = "off";
      }
    }

    root.dataset.quality = String(quality);
    cancels.push(whenIdle(() => void load()));

    const seen = new IntersectionObserver(
      ([entry]) => {
        active = entry?.isIntersecting ?? false;
        schedule();
      },
      { rootMargin: "100px" },
    );
    seen.observe(root);

    let queued = 0;
    const sizing = new ResizeObserver(() => {
      cancelAnimationFrame(queued);
      queued = requestAnimationFrame(measure);
    });
    sizing.observe(root);
    sizing.observe(stage);

    const onScroll = () => schedule();
    if (!reduced) window.addEventListener("scroll", onScroll, { passive: true });
    document.addEventListener("visibilitychange", schedule);

    return () => {
      disposed = true;
      cancels.forEach((cancel) => cancel());
      cancelAnimationFrame(raf);
      cancelAnimationFrame(queued);
      seen.disconnect();
      sizing.disconnect();
      window.removeEventListener("scroll", onScroll);
      document.removeEventListener("visibilitychange", schedule);
      world?.dispose();
      world = null;
    };
  }, [prices]);

  return (
    <div ref={rootRef} className="lp-story">
      <div className="lp-stage" aria-hidden="true">
        <canvas ref={canvasRef} className="lp-gl" />
      </div>
      <div ref={chaptersRef} className="lp-chapters">
        {children}
      </div>
    </div>
  );
}
