import { useMemo } from "react";
import { AbsoluteFill, interpolate, Sequence, useCurrentFrame, useVideoConfig } from "remotion";

import priceMapJson from "@/data/landing/price-map.json";
import { priceTier, type PriceMap, type PriceTier } from "@/lib/landing-map";
import { formatCents, formatCount } from "@/lib/money";
import { stateName, storyDateSpan, storyMonthName, type MonthlyStory } from "@/lib/monthly-story";

import { C, DISPLAY, FlapBoard, Masthead, MONO, ms, QUART, Rise, Rolling } from "./parts";
import type { ScenePlan, SceneId } from "./plan";

export const PRICE_MAP = priceMapJson as unknown as PriceMap;

/** Where the site lives, for the end card. */
const SITE_HOST = "sandwich-index.vercel.app";

export interface VideoProps extends Record<string, unknown> {
  month: string;
  /** Filled by calculateMetadata from src/data/monthly/<month>.json. */
  story?: MonthlyStory;
  plan?: ScenePlan;
}

const TIER_COLOUR: Record<PriceTier, string> = { none: C.rule, low: C.low, mid: C.mid, high: C.high };
const TIER_SHAPE: Record<Exclude<PriceTier, "none">, string> = { low: "▼", mid: "●", high: "▲" };

/** "A, B and C". */
function list(items: string[]): string {
  if (items.length <= 1) return items.join("");
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

function year(iso: string): string {
  return String(new Date(iso).getUTCFullYear());
}

const page = { background: C.paper, color: C.ink } as const;
const heading = { fontFamily: DISPLAY, fontSize: 72, fontWeight: 400, lineHeight: 1.08, letterSpacing: "-0.01em", margin: 0 } as const;
const note = { fontFamily: MONO, fontSize: 24, lineHeight: 1.45, color: C.inkSubtle } as const;

/* -------------------------------------------------------------------------- */

function Title({ story }: { story: MonthlyStory }) {
  const [monthName = "", monthYear = ""] = storyMonthName(story.month).split(" ");
  return (
    <AbsoluteFill style={page}>
      <Masthead month="Monthly" />
      <div style={{ position: "absolute", left: 72, right: 72, top: 300 }}>
        <Rise start={0}>
          <p style={{ fontFamily: MONO, fontSize: 30, letterSpacing: "0.1em", textTransform: "uppercase", color: C.inkMuted, margin: 0 }}>
            What a McChicken costs
          </p>
        </Rise>
        <Rise start={3}>
          <h1 style={{ ...heading, fontSize: 150, fontWeight: 700, marginTop: 28 }}>{monthName}</h1>
        </Rise>
        <div style={{ marginTop: 48 }}>
          <FlapBoard text={monthYear} start={8} />
        </div>
        {story.feed !== null ? (
          <Rise start={12} style={{ marginTop: 64 }}>
            <p style={{ ...note, fontSize: 30, color: C.inkMuted, margin: 0 }}>
              {formatCount(story.feed.stores)} McDonald&rsquo;s, store by store
            </p>
          </Rise>
        ) : null}
      </div>
    </AbsoluteFill>
  );
}

/* -------------------------------------------------------------------------- */

const MAP_LEFT = 40;
const MAP_SCALE = 1;
const DOT_R = 2.4;

interface Dot {
  x: number;
  y: number;
  tier: PriceTier;
  /** 0..1, cheapest first; -1 for a cell with no priced store. */
  rank: number;
}

function useDots(map: PriceMap): Dot[] {
  return useMemo(() => {
    const priced = map.points.filter((point) => point[2] > 0).sort((a, b) => a[2] - b[2]);
    const rankOf = new Map(priced.map((point, index) => [point, index / Math.max(1, priced.length - 1)]));
    return map.points.map((point) => ({
      x: point[0],
      y: point[1],
      tier: priceTier(point[2], map.priceCents),
      rank: rankOf.get(point) ?? -1,
    }));
  }, [map]);
}

/** The national dot map. `fill` 0..1 shows the priced dots cheapest first; `dim` fades it back. */
function DotMap({ fill, dim = 1, top }: { fill: number; dim?: number; top: number }) {
  const dots = useDots(PRICE_MAP);
  return (
    <svg
      width={PRICE_MAP.width * MAP_SCALE}
      height={PRICE_MAP.height * MAP_SCALE}
      viewBox={`0 0 ${PRICE_MAP.width} ${PRICE_MAP.height}`}
      style={{ position: "absolute", left: MAP_LEFT, top, opacity: dim }}
    >
      {dots.map((dot, index) => {
        // An even pass through the ranks, so cheapest-first reads; each dot fades in on --ease-out-quart.
        const shown = dot.rank < 0 ? 1 : QUART(Math.min(1, Math.max(0, (fill * 1.04 - dot.rank) / 0.04)));
        if (shown <= 0) return null;
        return <circle key={index} cx={dot.x} cy={dot.y} r={DOT_R} fill={TIER_COLOUR[dot.tier]} opacity={shown} />;
      })}
    </svg>
  );
}

function Legend({ start }: { start: number }) {
  const { p10, p90 } = PRICE_MAP.priceCents;
  const rows: [Exclude<PriceTier, "none">, string][] = [
    ["low", `${formatCents(p10)} or less`],
    ["mid", "between"],
    ["high", `${formatCents(p90)} or more`],
  ];
  return (
    <Rise start={start} style={{ display: "flex", gap: 40, fontFamily: MONO, fontSize: 28 }}>
      {rows.map(([tier, label]) => (
        <span key={tier} style={{ display: "inline-flex", alignItems: "center", gap: 12 }}>
          <span style={{ color: TIER_COLOUR[tier] }}>{TIER_SHAPE[tier]}</span>
          {label}
        </span>
      ))}
    </Rise>
  );
}

function Country({ story, frames }: { story: MonthlyStory; frames: number }) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const fill = interpolate(frame - ms(400, fps), [0, ms(4000, fps)], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const { generatedFrom } = PRICE_MAP;
  return (
    <AbsoluteFill style={page}>
      <Masthead month={storyMonthName(story.month)} />
      <Rise start={0} style={{ position: "absolute", left: 72, right: 72, top: 170 }}>
        <h2 style={heading}>
          {formatCount(generatedFrom.priced)} McChicken prices, cheapest first
        </h2>
      </Rise>
      <DotMap fill={fill} top={430} />
      <div style={{ position: "absolute", left: 72, right: 72, top: 1090 }}>
        <Legend start={Math.round(frames * 0.45)} />
        <p style={{ ...note, marginTop: 28 }}>
          Each dot is the median of the stores near it. Drive Thru Index readings,{" "}
          {storyDateSpan(generatedFrom.oldestObservedAt, generatedFrom.newestObservedAt)}, {year(generatedFrom.newestObservedAt)}.
        </p>
      </div>
    </AbsoluteFill>
  );
}

/* -------------------------------------------------------------------------- */

function StateCard({
  tier,
  label,
  cents,
  states,
  start,
}: {
  tier: "low" | "high";
  label: string;
  cents: number;
  states: { state: string; stores: number }[];
  start: number;
}) {
  const tie = states.length > 1;
  return (
    <Rise start={start} style={{ background: C.paper, border: `2px solid ${C.ink}`, borderRadius: 16, padding: "30px 36px" }}>
      <p style={{ fontFamily: MONO, fontSize: 26, letterSpacing: "0.1em", textTransform: "uppercase", margin: 0, display: "flex", gap: 14 }}>
        <span style={{ color: TIER_COLOUR[tier] }}>{TIER_SHAPE[tier]}</span>
        {label}
      </p>
      <Rolling text={formatCents(cents)} start={start + 6} style={{ fontSize: 120, fontWeight: 500, marginTop: 8 }} />
      <p style={{ fontFamily: DISPLAY, fontSize: tie ? 46 : 60, lineHeight: 1.1, margin: "10px 0 0" }}>
        {list(states.map((entry) => stateName(entry.state)))}
      </p>
      <p style={{ ...note, fontSize: 26, margin: "12px 0 0" }}>
        {list(states.map((entry) => formatCount(entry.stores)))} priced stores{tie ? `, a ${states.length}-way tie` : ""}
      </p>
    </Rise>
  );
}

function States({ story }: { story: MonthlyStory }) {
  const states = story.states!;
  return (
    <AbsoluteFill style={page}>
      <Masthead month={storyMonthName(story.month)} />
      <Rise start={0} style={{ position: "absolute", left: 72, right: 72, top: 170 }}>
        <h2 style={heading}>The median McChicken, state by state</h2>
      </Rise>
      <div style={{ position: "absolute", left: 72, right: 72, top: 400, display: "grid", gap: 32 }}>
        <StateCard tier="low" label="Cheapest state" cents={states.cheapest.medianCents} states={states.cheapest.states} start={8} />
        <StateCard tier="high" label="Priciest state" cents={states.priciest.medianCents} states={states.priciest.states} start={20} />
        <p style={{ ...note, margin: "8px 0 0" }}>
          Medians of the {states.ranked} states with at least {states.minStores} priced stores
          {story.feed !== null ? `. Drive Thru Index readings, ${storyDateSpan(story.feed.from, story.feed.to)}.` : "."}
        </p>
      </div>
    </AbsoluteFill>
  );
}

/* -------------------------------------------------------------------------- */

function Movers({ story }: { story: MonthlyStory }) {
  const movers = story.movers!;
  return (
    <AbsoluteFill style={page}>
      <Masthead month={storyMonthName(story.month)} />
      <Rise start={0} style={{ position: "absolute", left: 72, right: 72, top: 170 }}>
        <h2 style={heading}>The biggest price changes</h2>
        <p style={{ ...note, fontSize: 30, color: C.inkMuted, marginTop: 24 }}>
          {formatCount(movers.up)} stores went up and {formatCount(movers.down)} went down, of{" "}
          {formatCount(movers.compared)} priced in both readings.
        </p>
      </Rise>
      <div style={{ position: "absolute", left: 72, right: 72, top: 470, display: "grid", gap: 44 }}>
        {movers.top.map((mover, index) => {
          const up = mover.toCents > mover.fromCents;
          const start = 10 + index * 12;
          return (
            <Rise key={mover.storeId} start={start} style={{ borderTop: `2px solid ${C.rule}`, paddingTop: 28 }}>
              <p style={{ fontFamily: DISPLAY, fontSize: 40, lineHeight: 1.15, margin: 0 }}>{mover.label}</p>
              <div style={{ display: "flex", alignItems: "baseline", gap: 28, marginTop: 14, fontFamily: MONO, fontSize: 64 }}>
                <span style={{ color: C.inkSubtle, textDecoration: "line-through", textDecorationThickness: 3 }}>
                  {formatCents(mover.fromCents)}
                </span>
                <span style={{ color: C.inkSubtle, fontSize: 48 }}>→</span>
                <Rolling text={formatCents(mover.toCents)} start={start + 8} style={{ fontWeight: 500 }} />
                <span style={{ fontSize: 30, color: up ? C.high : C.low, marginLeft: "auto" }}>
                  {up ? "▲" : "▼"} {formatCents(Math.abs(mover.toCents - mover.fromCents))}
                </span>
              </div>
            </Rise>
          );
        })}
      </div>
      {story.feed !== null ? (
        <p style={{ ...note, position: "absolute", left: 72, right: 72, bottom: 80, margin: 0 }}>
          {movers.tiedAtTop > 1 ? `${formatCount(movers.tiedAtTop)} stores share the largest change. ` : ""}
          Drive Thru Index readings, {storyDateSpan(movers.previous.from, movers.previous.to)} and{" "}
          {storyDateSpan(story.feed.from, story.feed.to)}.
        </p>
      ) : null}
    </AbsoluteFill>
  );
}

/* -------------------------------------------------------------------------- */

function Confirmed({ story }: { story: MonthlyStory }) {
  const count = story.confirmed!.count;
  return (
    <AbsoluteFill style={page}>
      <Masthead month={storyMonthName(story.month)} />
      <div style={{ position: "absolute", left: 72, right: 72, top: 420 }}>
        <Rolling text={formatCount(count)} start={4} style={{ fontSize: 200, fontWeight: 500 }} />
        <Rise start={10}>
          <p style={{ ...heading, fontSize: 64, marginTop: 24 }}>
            {count === 1 ? "report" : "reports"} from visitors accepted this month
          </p>
        </Rise>
      </div>
    </AbsoluteFill>
  );
}

/* -------------------------------------------------------------------------- */

/** Held still: X loops short videos, so the restart reads as a cut. */
function End({ story }: { story: MonthlyStory }) {
  const { generatedFrom } = PRICE_MAP;
  return (
    <AbsoluteFill style={{ ...page, justifyContent: "center", padding: "0 72px" }}>
      <p style={{ ...heading, fontSize: 96 }}>Every price has a source.</p>
      <p style={{ fontFamily: MONO, fontSize: 44, fontWeight: 500, color: C.accent, marginTop: 40 }}>{SITE_HOST}</p>
      <div style={{ position: "absolute", left: 72, right: 72, bottom: 80, borderTop: `2px solid ${C.ink}`, paddingTop: 24 }}>
        <p style={{ ...note, margin: 0 }}>
          {story.feed !== null
            ? `Prices: Drive Thru Index (drivethruindex.com), readings ${storyDateSpan(story.feed.from, story.feed.to)}, ${year(story.feed.to)}, ${formatCount(story.feed.stores)} stores. `
            : ""}
          Map: readings {storyDateSpan(generatedFrom.oldestObservedAt, generatedFrom.newestObservedAt)}.
        </p>
        <p style={{ ...note, margin: "12px 0 0" }}>
          Not affiliated with McDonald&rsquo;s. McDonald&rsquo;s and McChicken are its trademarks.
        </p>
      </div>
    </AbsoluteFill>
  );
}

/* -------------------------------------------------------------------------- */

export function MonthlyPriceMap({ story, plan }: VideoProps) {
  if (story === undefined || plan === undefined) return <AbsoluteFill style={page} />;
  const scene = (id: SceneId, frames: number) => {
    switch (id) {
      case "title":
        return <Title story={story} />;
      case "country":
        return <Country story={story} frames={frames} />;
      case "states":
        return <States story={story} />;
      case "movers":
        return <Movers story={story} />;
      case "confirmed":
        return <Confirmed story={story} />;
      case "end":
        return <End story={story} />;
    }
  };
  return (
    <AbsoluteFill style={page}>
      {plan.scenes.map(({ id, from, frames }) => (
        <Sequence key={id} from={from} durationInFrames={frames} name={id}>
          {scene(id, frames)}
        </Sequence>
      ))}
    </AbsoluteFill>
  );
}
