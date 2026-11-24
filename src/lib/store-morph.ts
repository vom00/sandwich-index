import type { useRouter } from "next/navigation";

/**
 * The map's store row, or its open sheet, turning into the store page: the
 * store's name and price travel to where the page's header shows them, and
 * everything else crossfades.
 *
 * A same-document view transition around a client-side navigation. The
 * browser captures the map as it stands, the router swaps the page in, and
 * the store page reports the moment its header is in the document
 * (`StoreMorphLanding`) so the browser can capture that and animate between
 * the two. The matching names on the page side are CSS (`data-morph` in
 * globals.css), switched on only while a morph is in play.
 *
 * Under reduced motion nothing is named, so the whole page simply
 * crossfades. Without the View Transitions API this does nothing and the link
 * navigates as it always did.
 */

type Router = ReturnType<typeof useRouter>;

/**
 * How long the frozen map waits for the store page. A page that has not come
 * back by then (an error, a slow cold render) arrives without the morph
 * rather than leaving the screen stuck.
 */
const LANDING_TIMEOUT_MS = 2500;

/**
 * How long after the morph the document stays marked. The store page's own
 * rise and roll are cut to nothing while it is (see globals.css), and they
 * must be past their natural end before the mark goes, or they would replay.
 */
const UNMARK_AFTER_MS = 1500;

let pendingLanding: (() => void) | null = null;
let generation = 0;

export function morphToStore(
  event: { preventDefault: () => void },
  router: Router,
  href: string,
  /** The row or sheet holding `[data-morph-source]` elements. */
  source: Element | null | undefined,
): void {
  if (typeof document.startViewTransition !== "function") return;
  event.preventDefault();

  const root = document.documentElement;
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const named: HTMLElement[] = [];
  if (!reduced && source) {
    for (const part of ["name", "price"] as const) {
      const element = source.querySelector<HTMLElement>(`[data-morph-source="${part}"]`);
      if (element === null) continue;
      element.style.viewTransitionName = `store-${part}`;
      named.push(element);
    }
  }

  const run = ++generation;
  root.dataset.morph = reduced ? "fade" : "store";

  const transition = document.startViewTransition(
    () =>
      new Promise<void>((resolve) => {
        const land = () => {
          if (pendingLanding !== land) return;
          pendingLanding = null;
          resolve();
        };
        pendingLanding = land;
        router.push(href);
        window.setTimeout(land, LANDING_TIMEOUT_MS);
      }),
  );

  void transition.finished.finally(() => {
    for (const element of named) element.style.viewTransitionName = "";
    window.setTimeout(() => {
      if (run === generation) delete root.dataset.morph;
    }, UNMARK_AFTER_MS);
  });
}

/** Called by the store page once its header is in the document. */
export function landMorph(): void {
  pendingLanding?.();
}
