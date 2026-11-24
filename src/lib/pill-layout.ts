/**
 * Which price pills the vector map shows where they would overlap.
 *
 * On the Leaflet map, pills in a dense suburb pile on top of each other, so
 * some can't be clicked and their 44px targets overlap. The vector map shows
 * a pill only where it has room: pills are laid out in priority order, and one
 * that would overlap a pill already placed is hidden (and taken out of the tab
 * order) until a zoom gives it room. Every store is still a row in the list
 * beside the map, so nothing is out of reach.
 *
 * Priority: the selected store always; then priced stores, cheapest first,
 * because the cheapest nearby is what the map is for; then stale prices, then
 * stores with none; nearest the middle of the map first within each.
 */

export interface PillCandidate {
  id: string;
  /** Screen position of the store, in px from the map's top left. The pill sits above it. */
  x: number;
  y: number;
  /** The pill's target box: its width, and its 44px height. */
  width: number;
  height: number;
}

export interface PillRank {
  id: string;
  selected: boolean;
  /** 0 priced, 1 stale, 2 no price. */
  standing: 0 | 1 | 2;
  /** The price, for priced stores; ignored otherwise. */
  priceCents: number | null;
  /** Distance from the middle of the map, in px. */
  distance: number;
}

export function rankPills(pills: readonly PillRank[]): string[] {
  return [...pills]
    .sort(
      (a, b) =>
        Number(b.selected) - Number(a.selected) ||
        a.standing - b.standing ||
        (a.standing === 0 ? (a.priceCents ?? 0) - (b.priceCents ?? 0) : 0) ||
        a.distance - b.distance ||
        a.id.localeCompare(b.id),
    )
    .map((pill) => pill.id);
}

const CELL = 64;

/**
 * Places pills in the order given; returns the ids shown. `gap` is the space
 * kept clear between two pills' target boxes. A pill wholly outside the view
 * neither shows nor blocks.
 */
export function placePills(
  ordered: readonly PillCandidate[],
  view: { width: number; height: number },
  gap = 2,
): Set<string> {
  const shown = new Set<string>();
  const grid = new Map<string, { left: number; top: number; right: number; bottom: number }[]>();

  for (const pill of ordered) {
    const left = pill.x - pill.width / 2;
    const right = pill.x + pill.width / 2;
    const top = pill.y - pill.height;
    const bottom = pill.y;
    if (right < 0 || left > view.width || bottom < 0 || top > view.height) continue;

    const cells: string[] = [];
    for (let cx = Math.floor((left - gap) / CELL); cx <= Math.floor((right + gap) / CELL); cx += 1) {
      for (let cy = Math.floor((top - gap) / CELL); cy <= Math.floor((bottom + gap) / CELL); cy += 1) {
        cells.push(`${cx}:${cy}`);
      }
    }
    const clashes = cells.some((cell) =>
      (grid.get(cell) ?? []).some(
        (box) => left < box.right + gap && right + gap > box.left && top < box.bottom + gap && bottom + gap > box.top,
      ),
    );
    if (clashes) continue;

    const box = { left, top, right, bottom };
    for (const cell of cells) {
      const list = grid.get(cell) ?? [];
      list.push(box);
      grid.set(cell, list);
    }
    shown.add(pill.id);
  }
  return shown;
}
