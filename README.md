# Investment Calculator

An educational sandbox that shows how money could grow in the markets. It is
wholly hypothetical: there are no accounts and nothing can be linked. The only
thing sent to the server is an index or ticker symbol, to fetch its price
history.

## What it does

- Offers three kinds of investment: your own return assumption, a market index
  (S&P 500, Dow Jones, Nasdaq), or any ticker symbol.
- For an index or ticker, looks back (the plan replayed against real monthly
  prices) and looks ahead (a projection based on its historical growth and
  volatility).
- Projects a balance from a starting amount, monthly contributions, a
  timeframe, and an assumed average return.
- Runs 1,000 randomized market histories to show the range of outcomes, not
  just the average.
- Accounts for fees, inflation ("today's dollars"), and yearly contribution
  raises.
- Stores the scenario in the URL hash so it can be shared as a link.

## Development

```bash
npm run dev
```

- `src/lib/simulate.ts` holds all the math (steady projection and Monte Carlo).
- `src/lib/history.ts` holds the historical math (stats and the replay).
- `src/lib/yahoo.ts` is the price data provider, served through
  `src/app/api/history/route.ts`. It uses Yahoo Finance's unofficial chart
  endpoint; swap this one file to change providers.
- `src/components/Calculator.tsx` is the inputs panel and scenario state;
  `FutureResults.tsx` and `HistoryResults.tsx` are the two result views.
- `src/components/ChartFrame.tsx` is the shared SVG chart frame (axes,
  crosshair, tooltip).

## iOS app

The iOS app is this site wrapped with Capacitor (`ios/`).

```bash
npm run build:ios   # static export, synced into the Xcode project
```

Then archive the "Invest Calc" scheme in Xcode (or with `xcodebuild`) and
upload it to App Store Connect.

- In the app there is no server, so `src/lib/lookup.ts` fetches price
  history directly (`NEXT_PUBLIC_NATIVE=1`, see `src/lib/native.ts`).
- `store/listing.json` holds the App Store listing text and screenshot
  list; `store/asc.mjs` pushes it through the App Store Connect API (run it
  with no arguments for usage).
