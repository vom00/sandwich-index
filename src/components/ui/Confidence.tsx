import { feedById } from "@/lib/feeds";
import { visitorPrices } from "@/lib/provenance";

/**
 * What a price rests on, shown beside every price.
 *
 * A store with one report and a store with thirty must not look equally
 * authoritative, and the honest way to say so is to show the number rather than
 * to imply confidence through typography.
 *
 * The count is `confirmedCount`, never `reportCount` — delivery and held
 * submissions cannot set the price, so quoting the total next to it would
 * overstate how much evidence the number actually rests on.
 *
 * When a feed set the price, that is said first and by name. A feed's figure
 * with "no confirmed prices" beside it would read as a contradiction; with
 * "from MenuPriceTracker" beside it, it reads as what it is.
 */
export function Confidence({
  sampleCount,
  totalCount,
  priceFeed = null,
}: {
  sampleCount: number;
  totalCount: number;
  /** The feed that set the displayed price, or null when a visitor did. */
  priceFeed?: string | null;
}) {
  if (priceFeed !== null) {
    const feed = feedById(priceFeed);
    return (
      <span className="text-xs text-ink-subtle">
        from{" "}
        <span
          title={
            feed === null
              ? undefined
              : `Listed by ${feed.name}, ${feed.method}. Not a visitor's report.`
          }
        >
          {feed?.name ?? "a price feed"}
        </span>
        {sampleCount > 0
          ? ` · ${visitorPrices(sampleCount)}`
          : null}
      </span>
    );
  }

  if (sampleCount === 0) {
    return <span className="text-xs text-ink-subtle">no confirmed prices</span>;
  }

  const excluded = totalCount - sampleCount;

  return (
    <span className="text-xs text-ink-subtle">
      {sampleCount === 1 ? "1 price" : `${sampleCount} prices`}
      {excluded > 0 ? (
        <>
          {" "}
          <span title="Delivery prices and submissions held for review are not counted">
            ({excluded} not counted)
          </span>
        </>
      ) : null}
    </span>
  );
}
