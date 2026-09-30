import type { PriceHistory } from "@/lib/history";
import { fetchHistory } from "@/lib/yahoo";

const SYMBOL = /^\^?[A-Z0-9][A-Z0-9.\-=]{0,11}$/;

export type Lookup =
  | { status: 200; body: PriceHistory }
  | { status: 400 | 404 | 422 | 502; body: { error: string } };

/**
 * Validates a symbol and loads its price history. The web app calls this
 * from the API route; the iOS app, which has no server, calls it directly.
 */
export async function lookupHistory(raw: string): Promise<Lookup> {
  const symbol = raw.trim().toUpperCase();
  if (!SYMBOL.test(symbol)) {
    return { status: 400, body: { error: "That doesn't look like a ticker symbol." } };
  }

  try {
    const history = await fetchHistory(symbol);
    if (!history) {
      return {
        status: 404,
        body: { error: `Couldn't find "${symbol}". Check the symbol and try again.` },
      };
    }
    if (history.prices.length < 13) {
      return {
        status: 422,
        body: {
          error: `${history.name} has less than a year of price history, which is too little to work with.`,
        },
      };
    }
    return { status: 200, body: history };
  } catch {
    return {
      status: 502,
      body: { error: "Price history is unavailable right now. Please try again shortly." },
    };
  }
}
