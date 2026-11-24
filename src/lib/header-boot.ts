/**
 * Two once-only moments in the site header (components/ui/SiteHeader.tsx):
 *
 * - **The logo builds itself** on the first page of a browser session: its
 *   layers drop into a stack, then the wordmark inks in. Later pages show it
 *   built.
 * - **The masthead figure rolls in** the first time this browser sees it, and
 *   again only when the national median has changed since its last visit.
 *
 * The header is server-rendered finished, so without help the logo would
 * paint built, vanish and build again. This snippet runs before the header is
 * parsed (app/layout.tsx) and, when motion is allowed, decides both:
 *
 * - Logo due: a style (`HEADER_BOOT_ID`) holds the layers and the wordmark
 *   hidden from the first paint. The header removes it when it takes over and
 *   plays the build. If the app's JavaScript never runs, the style's own
 *   3-second fallback lets go, so nothing can stay hidden.
 * - Figure due: a second style (`FIGURE_ROLL_ID`) rolls the wheels from the
 *   first paint in CSS alone, exactly as the Odometer's `roll="load"` does,
 *   so they are moving from the first frame and never rest on a zero that
 *   isn't the price. It needs no takeover; the figure is recorded as seen at
 *   once.
 *
 * Plain module (not "use client") so the server layout can read it.
 */

/** sessionStorage: set once the logo has built in this session. */
export const LOGO_BUILT_KEY = "si-logo-built";

/** localStorage: the masthead figure this browser last rolled in. */
export const FIGURE_SEEN_KEY = "si-masthead-seen";

/** id of the style that holds the logo for its build. */
export const HEADER_BOOT_ID = "header-boot";

/** id of the style that rolls the masthead figure. */
export const FIGURE_ROLL_ID = "header-boot-figure";

const LOGO_CSS = ".logo-layer,.logo-word{animation:hb-logo 1ms 3s both}@keyframes hb-logo{from{opacity:0}}";
const FIGURE_CSS =
  "@media (prefers-reduced-motion:no-preference){.masthead .odo-col::before{animation:odo-roll 1100ms var(--ease-out-expo) calc(var(--k,0)*70ms) backwards}}";

/** `figure` is the masthead's value (cents, as a string), or null when there is none. */
export function headerBootScript(figure: string | null): string {
  const k = JSON.stringify;
  return `(function(){try{if(matchMedia("(prefers-reduced-motion: reduce)").matches)return;var h=document.head,f=${k(figure)},s;if(!sessionStorage.getItem(${k(LOGO_BUILT_KEY)})){s=document.createElement("style");s.id=${k(HEADER_BOOT_ID)};s.textContent=${k(LOGO_CSS)};h.appendChild(s)}if(f!==null&&localStorage.getItem(${k(FIGURE_SEEN_KEY)})!==f){s=document.createElement("style");s.id=${k(FIGURE_ROLL_ID)};s.textContent=${k(FIGURE_CSS)};h.appendChild(s);localStorage.setItem(${k(FIGURE_SEEN_KEY)},f)}}catch(e){}})()`;
}
