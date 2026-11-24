"use client";

import { useState } from "react";

import type { StoreCard } from "@/lib/store-card";

import type { EncodeRequest } from "./share-gif/encode.worker";

type State = "idle" | "making" | "saved" | "shared" | "failed";

const MESSAGE: Record<State, string> = {
  idle: "",
  making: "Printing the receipt…",
  saved: "Saved. It plays once and stops on the price.",
  shared: "Shared.",
  failed: "Couldn’t make the GIF in this browser. The link still shares the receipt as a picture.",
};

/**
 * Saves the store's till receipt as a GIF that prints itself and rolls the
 * price up, for posting where a link preview would not show.
 *
 * The frames are drawn here, with the page's own fonts; the encoding, which
 * is the slow part, runs in a Web Worker so the page stays responsive. On a
 * phone that can share files it opens the share sheet; anywhere else it
 * downloads. Everything loads on the click, so the page pays nothing for it.
 */
export function ShareGifButton({ card, host, fileName }: { card: StoreCard; host: string; fileName: string }) {
  const [state, setState] = useState<State>("idle");

  async function make(): Promise<void> {
    setState("making");
    let worker: Worker | null = null;
    try {
      const font = getComputedStyle(document.documentElement).getPropertyValue("--font-plex-mono").trim() || "monospace";
      await Promise.all([document.fonts.load(`500 54px ${font}`), document.fonts.load(`400 12px ${font}`)]);
      const { renderFrames } = await import("./share-gif/frames");
      const { width, height, frames, delays } = renderFrames(card, font, host);
      worker = new Worker(new URL("./share-gif/encode.worker.ts", import.meta.url), { type: "module" });
      const encoder = worker;
      const bytes = await new Promise<Uint8Array>((resolve, reject) => {
        encoder.onmessage = (event: MessageEvent<Uint8Array>) => resolve(event.data);
        encoder.onerror = () => reject(new Error("encoder failed"));
        const request: EncodeRequest = { width, height, frames, delays };
        encoder.postMessage(request, frames);
      });
      const file = new File([bytes as BlobPart], fileName, { type: "image/gif" });
      const phone = window.matchMedia("(pointer: coarse)").matches;
      if (phone && navigator.canShare?.({ files: [file] })) {
        await navigator.share({ files: [file] });
        setState("shared");
        return;
      }
      const url = URL.createObjectURL(file);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      link.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      setState("saved");
    } catch (error) {
      // Closing the share sheet is not a failure.
      setState(error instanceof DOMException && error.name === "AbortError" ? "idle" : "failed");
    } finally {
      worker?.terminate();
    }
  }

  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1">
      <button
        type="button"
        onClick={() => void make()}
        disabled={state === "making"}
        className="btn-quiet press inline-flex min-h-11 items-center gap-2 rounded-md border border-rule px-3.5 text-sm disabled:opacity-60"
      >
        <svg aria-hidden="true" viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="1.5">
          <path d="M3.5 1.75h9v12.5l-1.5-1-1.5 1-1.5-1-1.5 1-1.5-1-1.5 1z" strokeLinejoin="round" />
          <path d="M5.5 5h5M5.5 7.5h5M5.5 10h3" strokeLinecap="round" />
        </svg>
        Save the receipt as a GIF
      </button>
      <p role="status" aria-live="polite" className="text-xs text-ink-subtle">
        {MESSAGE[state]}
      </p>
    </div>
  );
}
