import type { PriceHistory, PricePoint } from "@/lib/history";

// The price data provider. Everything that knows about Yahoo lives in this
// file, so switching providers means replacing only `fetchHistory`.

type ChartResponse = {
  chart: {
    result:
      | {
          meta: { symbol: string; instrumentType?: string; longName?: string; shortName?: string };
          timestamp?: number[];
          indicators: {
            quote: { close: (number | null)[] }[];
            adjclose?: { adjclose: (number | null)[] }[];
          };
        }[]
      | null;
  };
};

/** Monthly prices for as far back as they go, or null for an unknown symbol. */
export async function fetchHistory(symbol: string): Promise<PriceHistory | null> {
  // An explicit date range (1900 to 2100) is used instead of `range=max`,
  // which thins older years out to one price per quarter.
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?period1=-2208988800&period2=4102444800&interval=1mo&events=div%2Csplit`;
  const response = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0" },
    next: { revalidate: 60 * 60 * 12 },
  });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`Price provider responded ${response.status}`);

  const body = (await response.json()) as ChartResponse;
  const result = body.chart.result?.[0];
  if (!result?.timestamp) return null;

  // Adjusted closes fold dividends and splits into the price.
  const closes = result.indicators.adjclose?.[0]?.adjclose ?? result.indicators.quote[0].close;
  const byMonth = new Map<string, number>();
  result.timestamp.forEach((seconds, i) => {
    const close = closes[i];
    if (close === null || close === undefined || !(close > 0)) return;
    // Later entries win, so a live quote replaces the month's opening bar.
    byMonth.set(new Date(seconds * 1000).toISOString().slice(0, 7), close);
  });
  const prices: PricePoint[] = [...byMonth.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, close]) => ({ date, close }));

  return {
    symbol: result.meta.symbol,
    name: result.meta.longName ?? result.meta.shortName ?? result.meta.symbol,
    includesDividends: result.meta.instrumentType !== "INDEX",
    prices,
  };
}
