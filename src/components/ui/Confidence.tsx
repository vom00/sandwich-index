/**
 * The submission count shown beside every price.
 *
 * A store with one report and a store with thirty must not look equally
 * authoritative, and the honest way to say so is to show the number rather than
 * to imply confidence through typography.
 *
 * The count is `confirmedCount`, never `reportCount` — delivery and held
 * submissions cannot set the price, so quoting the total next to it would
 * overstate how much evidence the number actually rests on.
 */
export function Confidence({
  sampleCount,
  totalCount,
}: {
  sampleCount: number;
  totalCount: number;
}) {
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
