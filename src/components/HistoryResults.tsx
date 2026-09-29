"use client";

import { useMemo } from "react";
import { ChartFrame, bandPath, linePath } from "@/components/ChartFrame";
import { CONTRIB, GROWTH, Card, Insights, Legend, StatTile } from "@/components/ui";
import { formatChange, formatCompact, formatMoney, formatPercent } from "@/lib/format";
import { backtest, formatMonth, type PriceHistory } from "@/lib/history";
import type { Inputs } from "@/lib/simulate";

// Points are monthly, so ticks land on whole years.
const MONTH_TICKS = [12, 24, 60, 120, 240];

export function HistoryResults({ history, inputs }: { history: PriceHistory; inputs: Inputs }) {
  const result = useMemo(() => backtest(history.prices, inputs), [history, inputs]);
  const { points, worstDrop, bestYear, worstYear } = result;

  const start = points[0];
  const final = points[points.length - 1];
  const growth = final.balance - final.contributed;
  const span = `${result.years % 1 === 0 ? result.years : result.years.toFixed(1)} year${result.years === 1 ? "" : "s"}`;
  const yearlyRows = points.filter((_, i) => i % 12 === 0 || i === points.length - 1);

  return (
    <>
      <Card className="p-6">
        <p className="text-sm text-ink-2">
          If you had started in {formatMonth(start.date)} and kept going, today you would have
        </p>
        <p className="mt-1 text-5xl font-semibold tracking-tight text-ink sm:text-6xl">
          {formatMoney(final.balance)}
        </p>
        <p className="mt-2 text-sm text-ink-2">
          from {formatMoney(final.contributed)} put into {history.name} over {span}.
        </p>
        {result.capped && (
          <p className="mt-2 text-sm text-ink-2">
            You asked for {inputs.years} years, but the price history only goes back to{" "}
            {formatMonth(start.date)}.
          </p>
        )}
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
        <StatTile
          label="Yearly growth of the price"
          value={formatPercent(result.yearlyGrowth, 1)}
          note="compounded, over this period"
        />
        <StatTile
          label="Biggest drop"
          value={worstDrop ? `−${formatPercent(worstDrop.depth)}` : "None"}
          note={
            worstDrop
              ? `${formatMonth(worstDrop.from)} to ${formatMonth(worstDrop.to)}`
              : undefined
          }
        />
      </div>

      <Card className="max-lg:order-first">
        <h2 className="text-base font-semibold text-ink">What actually happened</h2>
        <p className="mt-1 text-sm text-ink-2">
          Your plan replayed against the real month-by-month prices of {history.name}. Unlike a
          steady projection, the real path has dips you would have had to sit through.
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
            ariaLabel={`Line chart of balance versus contributions from ${formatMonth(start.date)} to ${formatMonth(final.date)}. Final balance ${formatMoney(final.balance)}, contributions ${formatMoney(final.contributed)}.`}
            steps={points.length - 1}
            tickSteps={MONTH_TICKS}
            tickLabel={(index) => points[index].date.slice(0, 4)}
            title={(index) => formatMonth(points[index].date)}
            yMax={Math.max(...points.map((p) => Math.max(p.balance, p.contributed)))}
            endLabels={[
              { value: final.balance, color: GROWTH },
              { value: final.contributed, color: CONTRIB },
            ]}
            tooltip={(index) => {
              const p = points[index];
              return [
                { label: "Balance", value: formatMoney(p.balance), color: GROWTH },
                { label: "What you put in", value: formatMoney(p.contributed), color: CONTRIB },
                { label: "Growth", value: formatMoney(p.balance - p.contributed) },
                {
                  label: "Gain on what you put in",
                  value: p.contributed > 0 ? formatChange(p.balance / p.contributed - 1) : "n/a",
                },
                {
                  label: "Price change, past 12 months",
                  value: index >= 12 ? formatChange(p.close / points[index - 12].close - 1) : "n/a",
                },
              ];
            }}
            region={(from, to) => {
              const a = points[from];
              const b = points[to];
              const months = to - from;
              const added = b.contributed - a.contributed;
              let peak = a.close;
              let drop = 0;
              for (let i = from; i <= to; i++) {
                peak = Math.max(peak, points[i].close);
                drop = Math.max(drop, 1 - points[i].close / peak);
              }
              return {
                heading: `${formatMonth(a.date)} to ${formatMonth(b.date)}, ${
                  months < 12 ? `${months} month${months === 1 ? "" : "s"}` : `${(months / 12).toFixed(1)} years`
                }`,
                rows: [
                  { label: "Balance", value: `${formatMoney(a.balance)} to ${formatMoney(b.balance)}`, color: GROWTH },
                  { label: "Put in during this period", value: formatMoney(added), color: CONTRIB },
                  { label: "Growth during this period", value: formatMoney(b.balance - a.balance - added) },
                  { label: "Price change", value: formatChange(b.close / a.close - 1) },
                  {
                    label: "Yearly price growth, compounded",
                    value: months >= 12 ? formatChange(Math.pow(b.close / a.close, 12 / months) - 1, 1) : "n/a",
                  },
                  { label: "Biggest drop in this period", value: drop > 0 ? `−${formatPercent(drop)}` : "None" },
                ],
              };
            }}
            markers={(index) => [
              { value: points[index].balance, color: GROWTH },
              { value: points[index].contributed, color: CONTRIB },
            ]}
          >
            {({ x, y }) => {
              const balance = points.map((p, i): [number, number] => [x(i), y(p.balance)]);
              const contributed = points.map((p, i): [number, number] => [x(i), y(p.contributed)]);
              const baseline = points.map((_, i): [number, number] => [x(i), y(0)]);
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
        <p className="mt-2 text-xs text-ink-2">
          Amounts are in the dollars of their time and are not adjusted for inflation.
          {history.includesDividends
            ? " Prices include reinvested dividends."
            : " Index prices leave out dividends, so an index fund that paid them would have done somewhat better."}
        </p>
      </Card>

      <Insights
        items={[
          growth >= 0
            ? `${formatPercent(growth / final.balance)} of the final balance is growth, not money you put in.`
            : `This plan would have ended ${formatCompact(-growth)} below what was put in.`,
          worstDrop
            ? `The hardest stretch was ${formatMonth(worstDrop.from)} to ${formatMonth(worstDrop.to)}, when the price fell ${formatPercent(worstDrop.depth)}. Staying invested through drops like that is the price of the long-run growth.`
            : null,
          bestYear && worstYear && bestYear.year !== worstYear.year
            ? `Single years varied widely: the best was ${bestYear.year} (${formatPercent(bestYear.change)}) and the worst was ${worstYear.year} (${formatPercent(worstYear.change)}).`
            : null,
          "This is one history out of many that could have happened. A different starting date can change the result a lot, so try a few timeframes.",
        ]}
      />

      <details className="rounded-2xl border border-hairline bg-surface p-5">
        <summary className="cursor-pointer text-base font-semibold text-ink">
          Year-by-year table
        </summary>
        <div className="mt-4 overflow-x-auto">
          <table className="w-full text-right text-sm tabular-nums">
            <thead>
              <tr className="border-b border-hairline text-xs text-ink-2">
                <th className="py-2 text-left font-medium">Date</th>
                <th className="py-2 font-medium">You put in</th>
                <th className="py-2 font-medium">Balance</th>
                <th className="py-2 font-medium">Growth</th>
              </tr>
            </thead>
            <tbody>
              {yearlyRows.map((p) => (
                <tr key={p.date} className="border-b border-hairline last:border-0">
                  <td className="py-1.5 text-left text-ink-2">{formatMonth(p.date)}</td>
                  <td className="py-1.5">{formatMoney(p.contributed)}</td>
                  <td className="py-1.5">{formatMoney(p.balance)}</td>
                  <td className="py-1.5">{formatMoney(p.balance - p.contributed)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </>
  );
}
