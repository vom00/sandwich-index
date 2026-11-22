/**
 * A hairline under the site header that fills as the page is read
 * (`.scroll-progress` in globals.css). Pure CSS: a scroll timeline drives it,
 * and where a browser has none, it is not shown at all. Decorative, so hidden
 * from assistive technology.
 *
 * Idea from Rare UI's Scroll Progress; written here from scratch.
 */
export function ScrollProgress() {
  return <div className="scroll-progress" aria-hidden="true" />;
}
