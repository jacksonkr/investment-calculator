import { Calculator } from "@/components/Calculator";

export default function Home() {
  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-5 sm:px-6 sm:py-12">
      <header className="mb-4 max-w-2xl sm:mb-8">
        <h1 className="text-xl font-semibold tracking-tight text-ink sm:text-4xl">
          See how an investment idea could play out
        </h1>
        <p className="mt-3 hidden text-base text-ink-2 sm:block">
          Pick an amount, a timeframe and a kind of investment, then watch how the money could
          grow. Nothing here connects to a real account. It is a sandbox for building intuition.
        </p>
      </header>

      <Calculator />

      <footer className="mt-10 border-t border-hairline pt-6 text-xs text-ink-2">
        <p className="max-w-3xl">
          This tool is for education only and is not financial advice. Every figure is
          hypothetical, based on the assumptions you enter, and does not predict or guarantee any
          real result. Past performance does not predict future results. Real investments can
          lose value. Taxes are not included. Price history comes from Yahoo Finance and may be
          delayed or incomplete. Your amounts stay on your device; only the index or ticker
          symbol you look up is sent, to fetch its price history.
        </p>
      </footer>
    </main>
  );
}
