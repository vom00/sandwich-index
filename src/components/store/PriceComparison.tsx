import {
  AREA_RADIUS_MILES,
  DIRECTION_PRESENTATION,
  directionOf,
  type AreaComparison,
} from "@/lib/comparison";
import { formatCents, formatCentsDelta, formatPercentDelta } from "@/lib/money";

/**
 * "Is this store a good deal?" — answered in one line.
 *
 * The delta is the headline because it is the only number here the reader
 * cannot work out for themselves; the store price and the area median are
 * context beneath it.
 * Both a dollar figure and a percentage are given because they answer different
 * questions: thirty cents is what you save, nine percent is how unusual the
 * store is.
 *
 * No component in this file renders meaning in colour alone. Each direction
 * carries a glyph and the words "cheaper than" / "pricier than" / "level with",
 * so the sentence still parses in greyscale and reads correctly aloud.
 */
export function PriceComparison({ comparison }: { comparison: AreaComparison }) {
  if (comparison.kind === "too_few_peers") {
    return (
      <Strip>
        <p className="text-ink-muted">
          {comparison.peerCount === 0
            ? `No other store within ${AREA_RADIUS_MILES} miles has a current price on file, so there is nothing to compare this to yet.`
            : `Only ${comparison.peerCount === 1 ? "one other store" : `${comparison.peerCount} other stores`} within ${AREA_RADIUS_MILES} miles ${comparison.peerCount === 1 ? "has" : "have"} a current price. That is too thin to call an area average.`}
        </p>
      </Strip>
    );
  }

  if (comparison.kind === "store_unpriced") {
    return (
      <Strip>
        <p className="text-ink-muted">
          Stores within {AREA_RADIUS_MILES} miles run a median of{" "}
          <span className="tabular font-medium text-ink">
            {formatCents(comparison.areaMedianCents)}
          </span>
          . What this one charges is anybody&rsquo;s guess until somebody says.
        </p>
      </Strip>
    );
  }

  const direction = directionOf(comparison.deltaCents);
  const { glyph, word, colorVar } = DIRECTION_PRESENTATION[direction];

  return (
    <Strip>
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <span
          aria-hidden="true"
          className="text-lg leading-none"
          style={{ color: colorVar }}
        >
          {glyph}
        </span>

        <span
          className="tabular text-3xl font-medium sm:text-4xl"
          style={{ color: colorVar }}
        >
          {direction === "level" ? formatCents(0) : formatCentsDelta(comparison.deltaCents)}
        </span>

        {comparison.percentDelta !== null && direction !== "level" ? (
          <span className="tabular text-lg text-ink-muted">
            {formatPercentDelta(comparison.percentDelta)}
          </span>
        ) : null}

        <span className="text-ink-muted">
          {word} the area
        </span>
      </div>

      <p className="mt-2 text-sm text-ink-muted">
        Measured against a median of{" "}
        <span className="tabular text-ink">{formatCents(comparison.areaMedianCents)}</span>{" "}
        across {comparison.peerCount} other{" "}
        {comparison.peerCount === 1 ? "store" : "stores"} within {AREA_RADIUS_MILES} miles.
        Stale and unpriced stores are left out of that figure.
      </p>
    </Strip>
  );
}

function Strip({ children }: { children: React.ReactNode }) {
  return (
    <section
      aria-label="Comparison with nearby stores"
      className="mt-8 border-y border-rule bg-paper-sunken px-5 py-6 sm:px-6"
    >
      {children}
    </section>
  );
}
