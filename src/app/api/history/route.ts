import { fetchHistory } from "@/lib/yahoo";

const SYMBOL = /^\^?[A-Z0-9][A-Z0-9.\-=]{0,11}$/;

export async function GET(request: Request) {
  const symbol = (new URL(request.url).searchParams.get("symbol") ?? "").trim().toUpperCase();
  if (!SYMBOL.test(symbol)) {
    return Response.json({ error: "That doesn't look like a ticker symbol." }, { status: 400 });
  }

  try {
    const history = await fetchHistory(symbol);
    if (!history) {
      return Response.json({ error: `Couldn't find "${symbol}". Check the symbol and try again.` }, { status: 404 });
    }
    if (history.prices.length < 13) {
      return Response.json(
        { error: `${history.name} has less than a year of price history, which is too little to work with.` },
        { status: 422 },
      );
    }
    return Response.json(history, {
      headers: { "Cache-Control": "public, max-age=3600, s-maxage=43200" },
    });
  } catch {
    return Response.json(
      { error: "Price history is unavailable right now. Please try again shortly." },
      { status: 502 },
    );
  }
}
