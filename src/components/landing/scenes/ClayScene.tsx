"use client";

import { useEffect, useRef, useState } from "react";

import type { ClaySceneController, SceneFactory } from "./stage";

/**
 * One of the landing page's clay 3D scenes, by name.
 *
 * Picked by name rather than passed in, because the landing page is a server
 * component and can't hand a function to a client one. Each name maps to a
 * dynamic import, so three.js (about 136 KB gzipped, shared by all three
 * scenes) loads only on the client, only on `/`, and only once the browser is
 * idle and a scene is near the screen. The headline number paints first.
 *
 * The figure and caption are server-rendered at a fixed aspect ratio, so the
 * page never shifts when a scene arrives. Each scene runs only while it is on
 * screen and the tab is in the foreground. With reduced motion requested, or
 * data saver on, it draws one still frame and never animates. Without WebGL the
 * canvas stays empty and the caption stands on its own.
 *
 * Decorative: the canvas is hidden from assistive technology, and the caption
 * says in words what the scene shows.
 */

export type SceneName = "kitchen" | "headquarters" | "logging";

const LOADERS: Record<SceneName, () => Promise<SceneFactory>> = {
  kitchen: () => import("./kitchen").then((module) => module.createKitchenScene),
  headquarters: () => import("./headquarters").then((module) => module.createHeadquartersScene),
  logging: () => import("./logging").then((module) => module.createLoggingScene),
};

type Status = "waiting" | "ready" | "unsupported";

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

function prefersStill(): boolean {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean } }).connection;
  return reduced || connection?.saveData === true;
}

function whenIdle(callback: () => void): () => void {
  if (typeof window.requestIdleCallback === "function") {
    const handle = window.requestIdleCallback(callback, { timeout: 1500 });
    return () => window.cancelIdleCallback(handle);
  }
  const handle = window.setTimeout(callback, 300);
  return () => window.clearTimeout(handle);
}

/** The mono family next/font registered, resolved to a usable font string. */
function monoFamily(): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue("--font-mono").trim();
  return value === "" ? "ui-monospace, monospace" : value;
}

export function ClayScene({
  scene: name,
  caption,
  aspect = "aspect-[4/3]",
  className = "",
}: {
  scene: SceneName;
  caption: string;
  /** A Tailwind aspect-ratio class for the reserved box. */
  aspect?: string;
  className?: string;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<Status>("waiting");

  useEffect(() => {
    const frame = frameRef.current;
    const canvas = canvasRef.current;
    if (frame === null || canvas === null) return;

    let controller: ClaySceneController | null = null;
    let disposed = false;
    let onScreen = false;
    let cancelIdle: (() => void) | null = null;

    const reducedQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

    function play(): void {
      if (controller === null) return;
      if (prefersStill()) {
        controller.still();
        return;
      }
      if (onScreen && document.visibilityState === "visible") controller.start();
      else controller.stop();
    }

    async function mount(): Promise<void> {
      if (!hasWebGL()) {
        setStatus("unsupported");
        return;
      }
      const family = monoFamily();
      // Signs and price tags are drawn once; make sure the face is there.
      await document.fonts.load(`500 72px ${family}`).catch(() => undefined);
      const create = await LOADERS[name]();
      if (disposed) return;
      try {
        controller = create(canvas!, { monoFont: family });
      } catch {
        setStatus("unsupported");
        return;
      }
      const { width, height } = frame!.getBoundingClientRect();
      controller.resize(width, height);
      setStatus("ready");
      play();
    }

    const visibility = new IntersectionObserver(
      ([entry]) => {
        onScreen = entry?.isIntersecting ?? false;
        if (onScreen && controller === null && cancelIdle === null) {
          cancelIdle = whenIdle(() => void mount());
        }
        play();
      },
      { rootMargin: "120px" },
    );
    visibility.observe(frame);

    const sizing = new ResizeObserver(([entry]) => {
      if (controller === null || entry === undefined) return;
      controller.resize(entry.contentRect.width, entry.contentRect.height);
    });
    sizing.observe(frame);

    document.addEventListener("visibilitychange", play);
    reducedQuery.addEventListener("change", play);

    return () => {
      disposed = true;
      cancelIdle?.();
      visibility.disconnect();
      sizing.disconnect();
      document.removeEventListener("visibilitychange", play);
      reducedQuery.removeEventListener("change", play);
      controller?.dispose();
      controller = null;
    };
  }, [name]);

  return (
    <figure className={className} data-scene={name}>
      <div ref={frameRef} className={`relative w-full ${aspect}`}>
        <canvas
          ref={canvasRef}
          aria-hidden="true"
          data-status={status}
          className="clay-canvas absolute inset-0 h-full w-full"
        />
      </div>
      <figcaption className="mt-3 max-w-sm text-xs leading-relaxed text-ink-subtle">{caption}</figcaption>
    </figure>
  );
}
