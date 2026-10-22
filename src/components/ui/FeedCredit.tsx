import { feedAttribution, feedById } from "@/lib/feeds";

/**
 * A feed's credit line, as the feed asks for it, with its address as a link.
 *
 * Drive Thru Index's permission to quote its figures comes with this line
 * ("Source: Drive Thru Index (https://drivethruindex.com), prices checked
 * <date>"), so it goes wherever one of its prices is shown on its own: the
 * store page and the map's store sheet. Renders nothing for a visitor's price
 * or a feed that asks for no credit.
 */
export function FeedCredit({
  feed,
  observedAt,
  className = "text-xs text-ink-subtle",
}: {
  feed: string | null;
  observedAt: string | null;
  className?: string;
}) {
  if (feed === null || observedAt === null) return null;
  const line = feedAttribution(feed, observedAt);
  const homepage = feedById(feed)?.homepage;
  if (line === null) return null;

  const at = homepage === undefined ? -1 : line.indexOf(homepage);
  if (homepage === undefined || at === -1) return <p className={className}>{line}</p>;

  return (
    <p className={className}>
      {line.slice(0, at)}
      <a
        href={homepage}
        target="_blank"
        rel="noreferrer noopener"
        className="hover-accent inline-flex min-h-11 items-center underline decoration-rule underline-offset-2"
      >
        {homepage}
      </a>
      {line.slice(at + homepage.length)}
    </p>
  );
}
