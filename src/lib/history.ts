import type { Inputs } from "@/lib/simulate";

export type PricePoint = {
  /** Month of the price, as "YYYY-MM". */
  date: string;
  close: number;
};

export type PriceHistory = {
  symbol: string;
  name: string;
  /** False for raw indexes, whose prices leave out dividends. */
  includesDividends: boolean;
  prices: PricePoint[];
};

export const INDEXES: { symbol: string; name: string }[] = [
  { symbol: "^GSPC", name: "S&P 500" },
  { symbol: "^DJI", name: "Dow Jones" },
  { symbol: "^IXIC", name: "Nasdaq" },
];

export type HistoricalStats = {
  /** Yearly growth the price actually compounded at, in percent. */
  returnPct: number;
  /**
   * Plain average of yearly returns, in percent. It runs higher than the
   * compounded rate, more so for volatile prices, and is what the simulation
   * needs for its middle outcome to match `returnPct`.
   */
  simulationReturnPct: number;
  /** Standard deviation of yearly returns, in percent. */
  volatilityPct: number;
  /** Length of the price history, in years. */
  years: number;
};

export type BacktestPoint = {
  date: string;
  /** The investment's price that month. */
  close: number;
  contributed: number;
  balance: number;
};

export type Backtest = {
  points: BacktestPoint[];
  years: number;
  /** True when there was less history than the requested timeframe. */
  capped: boolean;
  /** Compound yearly growth of the price itself over the period, as a fraction. */
  yearlyGrowth: number;
  worstDrop: { depth: number; from: string; to: string } | null;
  bestYear: { year: string; change: number } | null;
  worstYear: { year: string; change: number } | null;
};

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** "2009-03" -> "Mar 2009" */
export function formatMonth(date: string) {
  const [year, month] = date.split("-");
  return `${MONTHS[Number(month) - 1]} ${year}`;
}

/**
 * Summarizes a price history as a yearly growth rate and volatility,
 * measured from month-to-month changes.
 */
export function historicalStats(prices: PricePoint[]): HistoricalStats {
  const logs: number[] = [];
  for (let i = 1; i < prices.length; i++) {
    logs.push(Math.log(prices[i].close / prices[i - 1].close));
  }
  const mean = logs.reduce((sum, v) => sum + v, 0) / logs.length;
  const variance =
    logs.reduce((sum, v) => sum + (v - mean) * (v - mean), 0) / Math.max(1, logs.length - 1);

  const yearlyMu = mean * 12;
  const yearlyVar = variance * 12;
  const average = Math.exp(yearlyMu + yearlyVar / 2);
  const deviation = average * Math.sqrt(Math.exp(yearlyVar) - 1);

  return {
    returnPct: Math.round((Math.exp(yearlyMu) - 1) * 1000) / 10,
    simulationReturnPct: (average - 1) * 100,
    volatilityPct: Math.round(deviation * 1000) / 10,
    years: logs.length / 12,
  };
}

/**
 * Replays the plan against what the market actually did: start `inputs.years`
 * ago (or as far back as the history goes) and invest every month until now.
 */
export function backtest(prices: PricePoint[], inputs: Inputs): Backtest {
  const months = Math.min(inputs.years * 12, prices.length - 1);
  const slice = prices.slice(-(months + 1));
  const feeDrag = Math.pow(1 - inputs.feePct / 100, 1 / 12);

  let monthly = inputs.monthly;
  let contributed = inputs.initial;
  let balance = inputs.initial;
  const points: BacktestPoint[] = [
    { date: slice[0].date, close: slice[0].close, contributed, balance },
  ];
  for (let i = 1; i <= months; i++) {
    contributed += monthly;
    balance = (balance + monthly) * (slice[i].close / slice[i - 1].close) * feeDrag;
    points.push({ date: slice[i].date, close: slice[i].close, contributed, balance });
    if (i % 12 === 0) monthly *= 1 + inputs.contributionGrowthPct / 100;
  }

  let peak = slice[0];
  let worstDrop: Backtest["worstDrop"] = null;
  for (const point of slice) {
    if (point.close > peak.close) peak = point;
    const depth = 1 - point.close / peak.close;
    if (depth > (worstDrop?.depth ?? 0)) {
      worstDrop = { depth, from: peak.date, to: point.date };
    }
  }

  // Calendar-year changes, from each December close to the next.
  const yearEnds = new Map<string, number>();
  for (const point of slice) yearEnds.set(point.date.slice(0, 4), point.close);
  const yearly = [...yearEnds.entries()];
  let bestYear: Backtest["bestYear"] = null;
  let worstYear: Backtest["worstYear"] = null;
  // The final year is skipped while it is still in progress.
  const complete = slice[slice.length - 1].date.endsWith("-12") ? yearly.length : yearly.length - 1;
  for (let i = 1; i < complete; i++) {
    const change = yearly[i][1] / yearly[i - 1][1] - 1;
    if (!bestYear || change > bestYear.change) bestYear = { year: yearly[i][0], change };
    if (!worstYear || change < worstYear.change) worstYear = { year: yearly[i][0], change };
  }

  return {
    points,
    years: months / 12,
    capped: months < inputs.years * 12,
    yearlyGrowth: Math.pow(slice[months].close / slice[0].close, 12 / months) - 1,
    worstDrop,
    bestYear,
    worstYear,
  };
}
