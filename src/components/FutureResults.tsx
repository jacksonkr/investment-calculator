"use client";

import { useMemo, useState } from "react";
import { ChartFrame, bandPath, linePath } from "@/components/ChartFrame";
import { CONTRIB, GROWTH, Card, Insights, Legend, StatTile } from "@/components/ui";
import { formatChange, formatCompact, formatMoney, formatPercent } from "@/lib/format";
import { deflator, project, simulate, type Inputs } from "@/lib/simulate";

const YEAR_TICKS = [1, 2, 5, 10, 20];
const yearTick = (year: number) => (year === 0 ? "Today" : `Yr ${year}`);
const THIS_YEAR = new Date().getFullYear();
const yearTitle = (year: number) =>
  year === 0
    ? `Today (${THIS_YEAR})`
    : `After ${year} year${year === 1 ? "" : "s"} (${THIS_YEAR + year})`;
const yearSpan = (from: number, to: number) =>
  `${from === 0 ? "Today" : `Year ${from}`} to year ${to} (${THIS_YEAR + from} to ${THIS_YEAR + to}), ${to - from} year${to - from === 1 ? "" : "s"}`;
const gain = (balance: number, contributed: number) =>
  contributed > 0 ? formatChange(balance / contributed - 1) : "n/a";

type Props = {
  inputs: Inputs;
  real: boolean;
  onRealChange: (real: boolean) => void;
  /** Name of the index or ticker the return assumptions were measured from. */
  basis?: { name: string; years: number; simulationReturnPct: number };
};

export function FutureResults({ inputs, real, onRealChange, basis }: Props) {
  const [seed, setSeed] = useState(1);

  const { points, outcomes, lossChance, paths } = useMemo(() => {
    const adjust = (year: number) => (real ? deflator(inputs.inflationPct, year) : 1);
    const simulation = simulate(
      { ...inputs, returnPct: basis?.simulationReturnPct ?? inputs.returnPct },
      seed,
    );
    return {
      points: project(inputs).map((p) => ({
        year: p.year,
        contributed: p.contributed * adjust(p.year),
        balance: p.balance * adjust(p.year),
        balanceNoFees: p.balanceNoFees * adjust(p.year),
      })),
      outcomes: simulation.outcomes.map((o) => ({
        year: o.year,
        p10: o.p10 * adjust(o.year),
        p25: o.p25 * adjust(o.year),
        p50: o.p50 * adjust(o.year),
        p75: o.p75 * adjust(o.year),
        p90: o.p90 * adjust(o.year),
      })),
      lossChance: simulation.lossChance,
      paths: simulation.paths,
    };
  }, [inputs, real, seed, basis?.simulationReturnPct]);

  const years = inputs.years;
  const final = points[points.length - 1];
  const finalOutcome = outcomes[outcomes.length - 1];
  const growth = final.balance - final.contributed;
  const feeCost = final.balanceNoFees - final.balance;
  const todaysDollars = final.balance * (real ? 1 : deflator(inputs.inflationPct, years));

  const netReturn =
    ((1 + inputs.returnPct / 100) * (1 - inputs.feePct / 100)) /
      (real ? 1 + inputs.inflationPct / 100 : 1) -
    1;
  const doublingYears = netReturn > 0 ? Math.log(2) / Math.log(1 + netReturn) : null;
  const dollars = real ? "in today's dollars" : "in future dollars";

  return (
    <>
      <div className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <label className="flex cursor-pointer items-center gap-2 text-sm text-ink">
          <input
            type="checkbox"
            checked={real}
            onChange={(e) => onRealChange(e.target.checked)}
            className="h-4 w-4 accent-(--series-growth)"
          />
          Show in today&apos;s dollars
        </label>
        <span className="text-xs text-ink-2">
          {real
            ? `Every figure is adjusted for ${inputs.inflationPct}% yearly inflation, so it shows what the money could actually buy.`
            : "Figures are in future dollars, which will buy less than dollars do today."}
        </span>
      </div>

      {basis && (
        <Card className="text-sm text-ink-2">
          <p>
            <span className="font-medium text-ink">
              This assumes {basis.name} keeps behaving the way it has.
            </span>{" "}
            Over the last {basis.years.toFixed(0)} years it grew {inputs.returnPct}% a year on
            average, with ups and downs of {inputs.volatilityPct}%. The past is a reference point, not a
            forecast.
          </p>
          {basis.years < 10 && (
            <p className="mt-2">
              There are fewer than 10 years of history here. Short track records often capture
              one unusually good or bad stretch, so treat these numbers with extra caution.
            </p>
          )}
          {inputs.returnPct > 20 && (
            <p className="mt-2">
              Returns this high have rarely lasted for decades. Compounding them far into the
              future produces very large numbers that are unlikely to hold up.
            </p>
          )}
        </Card>
      )}

      <Card className="p-6">
        <p className="text-sm text-ink-2">
          After {years} year{years === 1 ? "" : "s"} of steady {inputs.returnPct}% growth you could
          have
        </p>
        <p className="mt-1 text-5xl font-semibold tracking-tight text-ink sm:text-6xl">
          {formatMoney(final.balance)}
        </p>
        <p className="mt-2 text-sm text-ink-2">
          {dollars}, from {formatMoney(final.contributed)} put in.
        </p>
      </Card>

      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        <StatTile label="You put in" value={formatCompact(final.contributed)} />
        <StatTile
          label="Growth"
          value={formatCompact(growth)}
          note={
            final.contributed > 0
              ? `${(final.balance / final.contributed).toFixed(1)}× what you put in`
              : undefined
          }
        />
        <StatTile label="Lost to fees" value={formatCompact(feeCost)} />
        {real ? (
          <StatTile
            label="Chance of ending behind"
            value={formatPercent(lossChance, lossChance > 0 && lossChance < 0.1 ? 1 : 0)}
            note="of simulated futures"
          />
        ) : (
          <StatTile
            label="In today's dollars"
            value={formatCompact(todaysDollars)}
            note={`after ${inputs.inflationPct}% inflation`}
          />
        )}
      </div>

      <Card>
        <h2 className="text-base font-semibold text-ink">If growth were perfectly steady</h2>
        <p className="mt-1 text-sm text-ink-2">
          The gap between the two lines is money the market made for you. It widens over time
          because growth compounds.
        </p>
        <div className="mt-3">
          <Legend
            items={[
              { label: "Balance", color: GROWTH, swatch: "line" },
              { label: "What you put in", color: CONTRIB, swatch: "line" },
            ]}
          />
        </div>
        <div className="mt-2">
          <ChartFrame
            ariaLabel={`Line chart of balance versus contributions over ${years} years. Final balance ${formatMoney(final.balance)}, contributions ${formatMoney(final.contributed)}.`}
            steps={years}
            tickSteps={YEAR_TICKS}
            tickLabel={yearTick}
            title={yearTitle}
            yMax={Math.max(final.balance, final.contributed)}
            endLabels={[
              { value: final.balance, color: GROWTH },
              { value: final.contributed, color: CONTRIB },
            ]}
            tooltip={(year) => {
              const p = points[year];
              return [
                { label: "Balance", value: formatMoney(p.balance), color: GROWTH },
                { label: "What you put in", value: formatMoney(p.contributed), color: CONTRIB },
                { label: "Growth", value: formatMoney(p.balance - p.contributed) },
                { label: "Gain on what you put in", value: gain(p.balance, p.contributed) },
                { label: "Yearly growth rate", value: `${inputs.returnPct}%` },
              ];
            }}
            region={(from, to) => {
              const a = points[from];
              const b = points[to];
              const added = b.contributed - a.contributed;
              return {
                heading: yearSpan(from, to),
                rows: [
                  { label: "Balance", value: `${formatMoney(a.balance)} to ${formatMoney(b.balance)}`, color: GROWTH },
                  { label: "Put in during this period", value: formatMoney(added), color: CONTRIB },
                  { label: "Growth during this period", value: formatMoney(b.balance - a.balance - added) },
                  { label: "Change in balance", value: a.balance > 0 ? formatChange(b.balance / a.balance - 1) : "n/a" },
                  { label: "Yearly growth rate", value: `${inputs.returnPct}%` },
                ],
              };
            }}
            markers={(year) => [
              { value: points[year].balance, color: GROWTH },
              { value: points[year].contributed, color: CONTRIB },
            ]}
          >
            {({ x, y }) => {
              const balance = points.map((p): [number, number] => [x(p.year), y(p.balance)]);
              const contributed = points.map((p): [number, number] => [x(p.year), y(p.contributed)]);
              const baseline = points.map((p): [number, number] => [x(p.year), y(0)]);
              return (
                <>
                  <path d={bandPath(balance, baseline)} fill={GROWTH} opacity={0.12} />
                  <path d={bandPath(contributed, baseline)} fill={CONTRIB} opacity={0.12} />
                  <path d={linePath(balance)} fill="none" stroke={GROWTH} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                  <path d={linePath(contributed)} fill="none" stroke={CONTRIB} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                </>
              );
            }}
          </ChartFrame>
        </div>
      </Card>

      <Card>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1 basis-72">
            <h2 className="text-base font-semibold text-ink">What could really happen</h2>
            <p className="mt-1 text-sm text-ink-2">
              Real markets have good years and bad years. This runs{" "}
              {paths.toLocaleString("en-US")} random futures with the same long-run growth and shows
              where they land.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setSeed((current) => current + 1)}
            className="rounded-md border border-hairline px-3 py-1.5 text-xs text-ink-2 hover:text-ink"
          >
            Run again
          </button>
        </div>
        <div className="mt-3">
          <Legend
            items={[
              { label: "Middle outcome", color: GROWTH, swatch: "line" },
              { label: "Range of most outcomes (8 in 10)", color: GROWTH, swatch: "band" },
              { label: "What you put in", color: CONTRIB, swatch: "line" },
            ]}
          />
        </div>
        <div className="mt-2">
          <ChartFrame
            ariaLabel={`Range of simulated outcomes over ${years} years. Middle outcome ${formatMoney(finalOutcome.p50)}, with 8 in 10 outcomes between ${formatMoney(finalOutcome.p10)} and ${formatMoney(finalOutcome.p90)}.`}
            steps={years}
            tickSteps={YEAR_TICKS}
            tickLabel={yearTick}
            title={yearTitle}
            yMax={Math.max(finalOutcome.p90, final.contributed)}
            endLabels={[
              { value: finalOutcome.p50, color: GROWTH },
              { value: final.contributed, color: CONTRIB },
            ]}
            tooltip={(year) => {
              const o = outcomes[year];
              return [
                { label: "Good run (top 10%)", value: formatMoney(o.p90), color: GROWTH, swatch: "band" },
                { label: "Middle outcome", value: formatMoney(o.p50), color: GROWTH },
                { label: "Rough run (bottom 10%)", value: formatMoney(o.p10), color: GROWTH, swatch: "band" },
                { label: "What you put in", value: formatMoney(points[year].contributed), color: CONTRIB },
                { label: "Gain in the middle outcome", value: gain(o.p50, points[year].contributed) },
              ];
            }}
            region={(from, to) => {
              const a = outcomes[from];
              const b = outcomes[to];
              const added = points[to].contributed - points[from].contributed;
              return {
                heading: yearSpan(from, to),
                rows: [
                  { label: "Middle outcome", value: `${formatMoney(a.p50)} to ${formatMoney(b.p50)}`, color: GROWTH },
                  { label: "Put in during this period", value: formatMoney(added), color: CONTRIB },
                  { label: "Growth in the middle outcome", value: formatMoney(b.p50 - a.p50 - added) },
                  { label: "Change in the middle outcome", value: a.p50 > 0 ? formatChange(b.p50 / a.p50 - 1) : "n/a" },
                  { label: "Range of most outcomes at the end", value: `${formatMoney(b.p10)} to ${formatMoney(b.p90)}`, color: GROWTH, swatch: "band" },
                ],
              };
            }}
            markers={(year) => [
              { value: outcomes[year].p50, color: GROWTH },
              { value: points[year].contributed, color: CONTRIB },
            ]}
          >
            {({ x, y }) => {
              const at = (key: "p10" | "p25" | "p50" | "p75" | "p90") =>
                outcomes.map((o): [number, number] => [x(o.year), y(o[key])]);
              const contributed = points.map((p): [number, number] => [x(p.year), y(p.contributed)]);
              return (
                <>
                  <path d={bandPath(at("p90"), at("p10"))} fill={GROWTH} opacity={0.14} />
                  <path d={bandPath(at("p75"), at("p25"))} fill={GROWTH} opacity={0.18} />
                  <path d={linePath(contributed)} fill="none" stroke={CONTRIB} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                  <path d={linePath(at("p50"))} fill="none" stroke={GROWTH} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
                </>
              );
            }}
          </ChartFrame>
        </div>
        <p className="mt-2 text-xs text-ink-2">
          The darker band holds the middle half of outcomes.
          {!basis &&
            " The middle outcome sits below the steady projection because a big loss hurts more than an equal gain helps."}
        </p>
      </Card>

      <Insights
        items={[
          growth > 0
            ? `${formatPercent(growth / final.balance)} of the final balance is growth, not money you put in. That is compounding: your earnings start earning too.`
            : "With these assumptions the balance never gets ahead of what you put in.",
          doublingYears !== null
            ? `At ${formatPercent(netReturn, 1)} a year after fees${real ? " and inflation" : ""}, money doubles roughly every ${doublingYears.toFixed(1)} years.`
            : "At this rate, after costs, money does not grow at all.",
          `Markets don't move in a straight line. In ${paths.toLocaleString("en-US")} simulated futures, the middle outcome was ${formatCompact(finalOutcome.p50)}, but 1 in 10 ended below ${formatCompact(finalOutcome.p10)} and 1 in 10 ended above ${formatCompact(finalOutcome.p90)}.`,
          lossChance > 0
            ? `${formatPercent(lossChance, lossChance < 0.1 ? 1 : 0)} of simulated futures ended with less than was put in.`
            : "None of the simulated futures ended with less than was put in.",
          feeCost > 1
            ? `A ${inputs.feePct}% yearly fee sounds small, but over ${years} years it costs about ${formatCompact(feeCost)}.`
            : null,
        ]}
      />

      <details className="rounded-2xl border border-hairline bg-surface p-5">
        <summary className="cursor-pointer text-base font-semibold text-ink">
          Year-by-year table
        </summary>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full min-w-[560px] text-right text-sm tabular-nums">
            <thead>
              <tr className="border-b border-hairline text-xs text-ink-2">
                <th className="py-2 text-left font-medium">Year</th>
                <th className="py-2 font-medium">You put in</th>
                <th className="py-2 font-medium">Steady growth</th>
                <th className="py-2 font-medium">Rough run</th>
                <th className="py-2 font-medium">Middle outcome</th>
                <th className="py-2 font-medium">Good run</th>
              </tr>
            </thead>
            <tbody>
              {points.map((p, i) => (
                <tr key={p.year} className="border-b border-hairline last:border-0">
                  <td className="py-1.5 text-left text-ink-2">{p.year === 0 ? "Today" : p.year}</td>
                  <td className="py-1.5">{formatMoney(p.contributed)}</td>
                  <td className="py-1.5">{formatMoney(p.balance)}</td>
                  <td className="py-1.5">{formatMoney(outcomes[i].p10)}</td>
                  <td className="py-1.5">{formatMoney(outcomes[i].p50)}</td>
                  <td className="py-1.5">{formatMoney(outcomes[i].p90)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  );
}
