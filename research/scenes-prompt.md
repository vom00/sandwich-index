# Two more 3D scenes: the prompt (2026-10-12)

Written by Claude from the owner's request, then run in the same session.

---

Sandwich Index landing page: add two more clay 3D scenes in the same style as
the kitchen line (soft clay, isometric, the Sendoso Dribbble shot as the
reference: https://dribbble.com/shots/26613831-3D-Animation-For-Sendoso-com),
following the web-animation-design skill.

1. **"Why it moves" section: corporate headquarters.** A giant office tower on
   a plaza, with people in business attire (suits, briefcases) walking in and
   out through a revolving door, in a loop. Two small franchise restaurants on
   the plaza edges, each with a different price sign, so the scene carries the
   section's point: corporate is big, but each operator sets the price. Place it
   in the empty left column under the "Why it moves" eyebrow on wide screens,
   after the paragraphs on phones.
2. **"How a price gets here" section: a person logging a price.** A person in
   front of a menu board looks up at it, types the price into their phone (the
   screen fills in "$2.49" digit by digit), taps send, and a price card flies
   from the phone onto a pin on a small floating map, which bounces once. Loop.
   It walks through the section's three steps: see it, log it, the store's price
   updates.

Rules, the same as the kitchen line:
- No McDonald's logos, arches, uniforms or red and yellow. The tower is a
  generic corporate HQ in the site's palette.
- One shared stage: `src/components/landing/scenes/`, one React wrapper picking
  the scene by name (server components can't pass functions), one shared three
  chunk, lazy and client-only, a fixed-aspect box reserved up front.
- Motion: ease-out for things that appear, ease-in-out for things that move on
  screen, a small bounce only for the pin. Every scene runs only while on screen
  and the tab is visible; reduced motion or data saver draws one still frame.
- Decorative: canvas `aria-hidden`, a caption that says what the scene shows.
- Tests: extend the kitchen suite to cover all three scenes. Every existing
  suite still passes.
