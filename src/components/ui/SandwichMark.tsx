/**
 * The site's mark: a McChicken, side on. Toasted top bun, shredded lettuce, a
 * crisp patty that overhangs the bun the way the real one does, and the heel.
 *
 * Drawn in the kitchen scene's bun, patty and lettuce colours with the site's
 * ink for outlines, so it sits next to the wordmark like type rather than
 * clip art. No McDonald's red or yellow and nothing arch-shaped: the site is
 * about the sandwich, not the brand. `src/app/icon.svg` is the same drawing.
 *
 * Decorative wherever it appears next to the name, so it is hidden from
 * assistive technology; the link text says "Sandwich Index".
 */
export function SandwichMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      aria-hidden="true"
      focusable="false"
      className={className}
      fill="none"
      stroke="#15140f"
      strokeWidth={1.5}
      strokeLinejoin="round"
    >
      {/* Heel. */}
      <rect x="5" y="21" width="22" height="6" rx="3" fill="#d79a5b" />
      {/* Patty, wider than the bun, with a few crumbs of crust. */}
      <rect x="2.75" y="15.75" width="26.5" height="6" rx="3" fill="#b8762c" />
      <g fill="#9c5f1e" stroke="none">
        <circle cx="8" cy="18.75" r="0.9" />
        <circle cx="13" cy="17.9" r="0.8" />
        <circle cx="18.5" cy="19.1" r="0.9" />
        <circle cx="24" cy="18" r="0.8" />
      </g>
      {/* Shredded lettuce. */}
      <path
        d="M5.5 15.4c1.4-1.6 2.6-1.6 4 0s2.6 1.6 4 0 2.6-1.6 4 0 2.6 1.6 4 0 2.6-1.6 4 0"
        stroke="#5f8f3a"
        strokeWidth={2}
        strokeLinecap="round"
      />
      {/* Top bun, with a highlight where it was toasted. */}
      <path d="M5 13.75C5 8.5 9.75 5 16 5s11 3.5 11 8.75Z" fill="#c8843f" />
      <path d="M9.25 10.25C10.75 8.25 13.25 7.25 16 7.1" stroke="#e8b680" strokeWidth={1.4} strokeLinecap="round" />
    </svg>
  );
}
