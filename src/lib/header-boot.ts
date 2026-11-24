/**
 * Two once-only moments in the site header (components/ui/SiteHeader.tsx):
 *
 * - **The logo builds itself** on the first page of a browser session: its
 *   layers drop into a stack, then the wordmark inks in. Later pages show it
 *   built.
 * - **The masthead figure rolls in** the first time this browser sees it, and
 *   again only when the national median has changed since its last visit.
 *
 * The header is server-rendered finished, so without help each piece would
 * paint finished, snap back, then animate. This snippet runs before the
 * header is parsed (app/layout.tsx) and, when either moment is due and motion
 * is allowed, adds a style that holds that piece at its start from the first
 * paint: the logo's layers hidden, the figure's wheels at zero. The header
 * removes the style when it takes over. If the app's JavaScript never runs,
 * the style's own 3-second fallback lets go, so nothing can stay hidden or
 * show a wrong figure.
 *
 * Plain module (not "use client") so the server layout can read it.
 */

/** sessionStorage: set once the logo has built in this session. */
export const LOGO_BUILT_KEY = "si-logo-built";

/** localStorage: the masthead figure this browser last rolled in. */
export const FIGURE_SEEN_KEY = "si-masthead-seen";

/** id of the style element the snippet adds. Its data-logo / data-figure say which moment is due. */
export const HEADER_BOOT_ID = "header-boot";

const LOGO_CSS = ".logo-layer,.logo-word{animation:hb-logo 1ms 3s both}@keyframes hb-logo{from{opacity:0}}";
const FIGURE_CSS = ".masthead .odo-col::before{animation:hb-odo 1ms 3s both}@keyframes hb-odo{from{transform:translateY(0)}}";

/** `figure` is the masthead's value (cents, as a string), or null when there is none. */
export function headerBootScript(figure: string | null): string {
  const k = JSON.stringify;
  return `(function(){try{if(matchMedia("(prefers-reduced-motion: reduce)").matches)return;var l=!sessionStorage.getItem(${k(LOGO_BUILT_KEY)}),f=${k(figure)},r=f!==null&&localStorage.getItem(${k(FIGURE_SEEN_KEY)})!==f;if(!l&&!r)return;var s=document.createElement("style");s.id=${k(HEADER_BOOT_ID)};s.textContent=(l?${k(LOGO_CSS)}:"")+(r?${k(FIGURE_CSS)}:"");s.dataset.logo=l?"1":"";s.dataset.figure=r?"1":"";document.head.appendChild(s)}catch(e){}})()`;
}
