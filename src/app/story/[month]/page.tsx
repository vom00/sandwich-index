import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

import { FeedCredit } from "@/components/ui/FeedCredit";
import { Odometer } from "@/components/ui/Odometer";
import { WordRise } from "@/components/ui/WordRise";
import { MONTHLY_STORIES } from "@/data/monthly";
import { feedName } from "@/lib/feeds";
import { getAdminDb } from "@/lib/firebase/admin";
import { countConfirmed } from "@/lib/monthly-confirmed.server";
import { formatCents, formatCentsDelta, formatCount } from "@/lib/money";
import {
  MOVERS_SHOWN,
  monthBounds,
  stateName,
  storyDateSpan,
  storyMonthName,
  type MonthlyStory,
  type StateRank,
  type StoryField,
} from "@/lib/monthly-story";

/**
 * One month of the index in a few figures (`lib/monthly-story`), built by
 * `npm run build:monthly-story` into `src/data/monthly`. Every month on file
 * is built at build time; any other month is a 404.
 *
 * The page's one moment: the two state medians roll up on the odometer as it
 * opens. Everything else is still. A figure the month has no data for is shown
 * blank, in a dashed "not yet" slot that says why, and the introduction names
 * every blank up front.
 *
 * The one live figure is the count of visitor reports, read from the database
 * when the page is built and again every six hours (`revalidate`), at one read
 * per report sent that month. If the database can't be read the file's count
 * stands, or the slot is blank and says so.
 */
export const dynamicParams = false;
export const revalidate = 21600;

export function generateStaticParams(): { month: string }[] {
  return Object.keys(MONTHLY_STORIES).map((month) => ({ month }));
}

function storyFor(month: string): MonthlyStory | null {
  return Object.hasOwn(MONTHLY_STORIES, month) ? (MONTHLY_STORIES[month] ?? null) : null;
}

export async function generateMetadata(props: PageProps<"/story/[month]">): Promise<Metadata> {
  const { month } = await props.params;
  const story = storyFor(month);
  if (story === null) return { title: "Story not found — Sandwich Index" };
  const name = storyMonthName(month);
  const { states } = story;
  return {
    title: `The McChicken index, ${name} — Sandwich Index`,
    description:
      states === null
        ? `McChicken prices across the US in ${name}: what the data on file shows, and what it doesn't.`
        : `McChicken prices across the US in ${name}: cheapest in ${listStates(states.cheapest)} at a median ${formatCents(states.cheapest.medianCents)}, priciest in ${listStates(states.priciest)} at ${formatCents(states.priciest.medianCents)}.`,
  };
}

const FIELD_LABELS: Record<StoryField, string> = {
  feed: "This month’s prices",
  states: "Cheapest and priciest states",
  movers: "Biggest price changes",
  confirmed: "Prices confirmed by visitors",
};

/** "Texas", "Alaska and Vermont", "New Hampshire, Alaska and Vermont". */
function listStates(rank: StateRank): string {
  const names = rank.states.map((s) => stateName(s.state));
  return names.length <= 1 ? (names[0] ?? "") : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
}

type LiveCount = { count: number; at: string } | { reason: string };

async function liveConfirmed(month: string): Promise<LiveCount> {
  try {
    const result = await countConfirmed(getAdminDb(), month);
    return result.count === null ? { reason: result.reason } : { count: result.count, at: new Date().toISOString() };
  } catch (error) {
    console.error(`[story] visitor reports for ${month} not counted:`, error);
    return { reason: "The site’s database could not be read when this page was last built; it is read again every six hours." };
  }
}

const dayName = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric", timeZone: "UTC" });

function Section({ id, title, children }: { id: string; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={id} className="mt-14 border-t border-rule pt-8">
      <h2 id={id} className="wr font-display text-2xl">
        <WordRise text={title} />
      </h2>
      <div className="mt-5">{children}</div>
    </section>
  );
}

/** Where a figure would be, left empty on purpose: the dashed border means "not yet". */
function Blank({ reason }: { reason: string }) {
  return (
    <div className="rounded-md border border-dashed border-ink-subtle/60 px-4 py-5">
      <p className="text-ink-muted">Not available for this month.</p>
      <p className="mt-1 text-sm text-ink-subtle">{reason}</p>
    </div>
  );
}

function StateCard({ label, rank, delay }: { label: string; rank: StateRank; delay: string }) {
  const tied = rank.states.length > 1;
  return (
    <div className="reveal rounded-md border border-rule bg-paper-raised p-5 sm:p-6" style={{ animationDelay: delay }}>
      <p className="font-mono text-xs uppercase tracking-[0.18em] text-ink-subtle">{label}</p>
      {/* The figure first, so the two cards' figures line up however many
          states share one. */}
      <div className="mt-3 flex items-baseline gap-2">
        <Odometer roll="load" value={formatCents(rank.medianCents)} className="tabular text-4xl font-medium sm:text-5xl" />
        <span className="text-sm text-ink-subtle">median</span>
      </div>
      <p className="mt-3 font-display text-2xl leading-snug">{listStates(rank)}</p>
      <p className="mt-2 text-sm text-ink-subtle">
        {tied
          ? `A tie. Stores priced: ${rank.states.map((s) => `${stateName(s.state)} ${formatCount(s.stores)}`).join(", ")}.`
          : `From ${formatCount(rank.states[0]?.stores ?? 0)} stores.`}
      </p>
    </div>
  );
}

export default async function StoryPage(props: PageProps<"/story/[month]">) {
  const { month } = await props.params;
  const story = storyFor(month);
  if (story === null) notFound();

  const name = storyMonthName(month);
  // The live count wins; failing that, the count in the file; failing both,
  // the slot is blank with the live read's reason.
  const live = await liveConfirmed(month);
  const confirmed =
    "count" in live ? live : story.confirmed !== null ? { count: story.confirmed.count, at: story.generatedAt } : null;
  const missing =
    confirmed !== null
      ? story.missing.filter((m) => m.field !== "confirmed")
      : [...story.missing.filter((m) => m.field !== "confirmed"), { field: "confirmed" as const, reason: "reason" in live ? live.reason : "" }];
  // Counted before the month was out, so the figure is "so far".
  const ongoing = confirmed !== null && confirmed.at < monthBounds(month).end;
  const reason = (field: StoryField) => missing.find((m) => m.field === field)?.reason ?? "";
  const source = story.feed === null ? null : feedName(story.feed.id);
  // The figures with a section of their own that is left blank; the feed's
  // absence is said in the introduction itself.
  const blanks = missing.map((m) => m.field).filter((field) => field !== "feed");

  return (
    <main id="main" className="mx-auto w-full max-w-3xl px-5 py-16 sm:px-8 sm:py-24">
      <p className="reveal font-mono text-xs uppercase tracking-[0.18em] text-ink-subtle">The McChicken index, monthly</p>
      <h1 className="reveal mt-3 font-display text-4xl leading-tight sm:text-5xl" style={{ animationDelay: "70ms" }}>
        {name}
      </h1>
      <p className="reveal mt-6 max-w-2xl text-lg leading-relaxed text-ink-muted" style={{ animationDelay: "140ms" }}>
        {story.feed !== null && source !== null ? (
          <>
            {source} checked the McChicken&rsquo;s pickup price at{" "}
            <span className="tabular text-ink">{formatCount(story.feed.stores)}</span> of the{" "}
            <span className="tabular">{formatCount(story.listedStores)}</span> US McDonald&rsquo;s on our list,{" "}
            {story.feed.from.slice(0, 10) === story.feed.to.slice(0, 10) ? "on " : "from "}
            {storyDateSpan(story.feed.from, story.feed.to)}. Every figure below is counted from those
            prices, or from reports on this site, and none is estimated.
          </>
        ) : (
          <>
            There is no price reading dated in {name}, so this month has nothing to count.
          </>
        )}
        {blanks.length > 0 ? (
          <span className="mt-3 block text-base text-ink-subtle">
            {blanks.length === 1 ? "One figure is" : `${blanks.length} figures are`} left blank, because the data to
            count {blanks.length === 1 ? "it" : "them"} was not on file:{" "}
            {blanks.map((field) => FIELD_LABELS[field].toLowerCase()).join("; ")}.
          </span>
        ) : null}
      </p>

      <Section id="states" title="Cheapest and priciest states">
        {story.states !== null ? (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <StateCard label="Cheapest" rank={story.states.cheapest} delay="210ms" />
              <StateCard label="Priciest" rank={story.states.priciest} delay="280ms" />
            </div>
            <p className="mt-4 text-sm leading-relaxed text-ink-subtle">
              Each state&rsquo;s figure is the middle price of its stores. Only states with at least{" "}
              {story.states.minStores} priced stores are ranked (Washington, DC counts as one):{" "}
              {story.states.ranked} this month.
            </p>
          </>
        ) : (
          <Blank reason={reason("states")} />
        )}
      </Section>

      <Section id="movers" title="Biggest price changes">
        {story.movers !== null ? (
          <>
            <p className="leading-relaxed text-ink-muted">
              Of the <span className="tabular">{formatCount(story.movers.compared)}</span> stores priced in
              this reading and in the one before it ({storyDateSpan(story.movers.previous.from, story.movers.previous.to)}),{" "}
              <span className="tabular text-ink">{formatCount(story.movers.up + story.movers.down)}</span> changed
              price: <span className="tabular">{formatCount(story.movers.up)}</span> went up and{" "}
              <span className="tabular">{formatCount(story.movers.down)}</span> went down.
            </p>
            {story.movers.top.length > 0 ? (
              <ol className="mt-5 border-t border-rule">
                {story.movers.top.map((mover) => (
                  <li
                    key={mover.storeId}
                    className="flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 border-b border-rule py-3"
                  >
                    <Link href={`/store/${mover.storeId}`} className="link-wipe hover-accent inline-flex min-h-11 items-center">
                      <span className="wipe">{mover.label}</span>
                    </Link>
                    <p className="tabular shrink-0 text-ink">
                      <span className="sr-only">from </span>
                      <span className="text-ink-subtle line-through decoration-ink-subtle/70">{formatCents(mover.fromCents)}</span>
                      <span aria-hidden="true" className="px-2 text-ink-subtle">→</span>
                      <span className="sr-only"> to </span>
                      <span className="font-medium">{formatCents(mover.toCents)}</span>
                      <span className="ml-3 text-sm text-ink-subtle">{formatCentsDelta(mover.toCents - mover.fromCents)}</span>
                    </p>
                  </li>
                ))}
              </ol>
            ) : null}
            {story.movers.tiedAtTop > story.movers.top.length ? (
              <p className="mt-4 text-sm leading-relaxed text-ink-subtle">
                {formatCount(story.movers.tiedAtTop)} stores changed by{" "}
                {formatCents(Math.abs((story.movers.top[0]?.toCents ?? 0) - (story.movers.top[0]?.fromCents ?? 0)))}, the most of
                any. The {MOVERS_SHOWN} shown changed the most as a share of their old price; after that, the lowest
                restaurant number comes first.
              </p>
            ) : null}
          </>
        ) : (
          <Blank reason={reason("movers")} />
        )}
      </Section>

      <Section id="confirmed" title="Prices confirmed by visitors">
        {confirmed !== null ? (
          <p className="flex flex-wrap items-baseline gap-x-3" data-counted={confirmed.at}>
            <span className="tabular text-4xl font-medium">{formatCount(confirmed.count)}</span>{" "}
            <span className="text-ink-muted">
              {confirmed.count === 1 ? "report" : "reports"} from visitors accepted in {name}
              {ongoing ? `, as of ${dayName(confirmed.at)}` : ""}.
            </span>
          </p>
        ) : (
          <Blank reason={reason("confirmed")} />
        )}
      </Section>

      <footer className="mt-14 border-t border-rule pt-6 text-xs leading-relaxed text-ink-subtle">
        {story.feed !== null ? <FeedCredit feed={story.feed.id} observedAt={story.feed.to} className="text-xs text-ink-subtle" /> : null}
        <p className="mt-1">
          Store list from All The Places. Counted on {story.generatedAt.slice(0, 10)}.{" "}
          <Link href="/about" className="link-prose inline-flex min-h-11 items-center">
            How the data works
          </Link>
        </p>
      </footer>
    </main>
  );
}
