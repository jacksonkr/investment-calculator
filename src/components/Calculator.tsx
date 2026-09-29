"use client";

import {
  useDeferredValue,
  useEffect,
  useMemo,
  useState,
  useSyncExternalStore,
} from "react";
import { FutureResults } from "@/components/FutureResults";
import { HistoryResults } from "@/components/HistoryResults";
import { NumberField } from "@/components/NumberField";
import { Card, Segmented } from "@/components/ui";
import { useHistory } from "@/components/useHistory";
import { INDEXES, formatMonth, historicalStats } from "@/lib/history";
import { DEFAULT_INPUTS, type Inputs } from "@/lib/simulate";

type Mode = "custom" | "index" | "ticker";
type View = "history" | "future";

type Scenario = {
  inputs: Inputs;
  real: boolean;
  mode: Mode;
  indexSymbol: string;
  ticker: string | null;
  view: View;
};

const DEFAULT_SCENARIO: Scenario = {
  inputs: DEFAULT_INPUTS,
  real: false,
  mode: "custom",
  indexSymbol: INDEXES[0].symbol,
  ticker: null,
  view: "history",
};

const PRESETS: { name: string; returnPct: number; volatilityPct: number }[] = [
  { name: "Savings account", returnPct: 3.5, volatilityPct: 0.5 },
  { name: "Bonds", returnPct: 4.5, volatilityPct: 6 },
  { name: "Balanced mix", returnPct: 7, volatilityPct: 10 },
  { name: "Stock index", returnPct: 10, volatilityPct: 16 },
  { name: "Single stock", returnPct: 12, volatilityPct: 40 },
];

// Short keys keep the shareable link compact.
const HASH_KEYS: Record<keyof Inputs, string> = {
  initial: "i",
  monthly: "m",
  years: "y",
  returnPct: "r",
  volatilityPct: "v",
  feePct: "f",
  inflationPct: "n",
  contributionGrowthPct: "g",
};

const LIMITS: Record<keyof Inputs, [number, number]> = {
  initial: [0, 10_000_000],
  monthly: [0, 100_000],
  years: [1, 60],
  returnPct: [0, 25],
  volatilityPct: [0, 60],
  feePct: [0, 3],
  inflationPct: [0, 10],
  contributionGrowthPct: [0, 10],
};

const TICKER = /^\^?[A-Z0-9][A-Z0-9.\-=]{0,11}$/;

function readHash(hash: string): Scenario | null {
  const params = new URLSearchParams(hash.replace(/^#/, ""));
  if ([...params.keys()].length === 0) return null;
  const inputs = { ...DEFAULT_INPUTS };
  for (const key of Object.keys(HASH_KEYS) as (keyof Inputs)[]) {
    const raw = params.get(HASH_KEYS[key]);
    const parsed = raw === null ? NaN : Number(raw);
    if (!Number.isFinite(parsed)) continue;
    const [min, max] = LIMITS[key];
    inputs[key] = Math.min(max, Math.max(min, parsed));
  }
  inputs.years = Math.round(inputs.years);

  const scenario: Scenario = { ...DEFAULT_SCENARIO, inputs, real: params.get("real") === "1" };
  const symbol = (params.get("s") ?? "").toUpperCase();
  if (INDEXES.some((index) => index.symbol === symbol)) {
    scenario.mode = "index";
    scenario.indexSymbol = symbol;
  } else if (TICKER.test(symbol)) {
    scenario.mode = "ticker";
    scenario.ticker = symbol;
  }
  if (params.get("w") === "f") scenario.view = "future";
  return scenario;
}

function activeSymbol(scenario: Scenario) {
  if (scenario.mode === "index") return scenario.indexSymbol;
  if (scenario.mode === "ticker") return scenario.ticker;
  return null;
}

function writeHash(scenario: Scenario) {
  const params = new URLSearchParams();
  for (const key of Object.keys(HASH_KEYS) as (keyof Inputs)[]) {
    params.set(HASH_KEYS[key], String(scenario.inputs[key]));
  }
  if (scenario.real) params.set("real", "1");
  const symbol = activeSymbol(scenario);
  if (symbol) {
    params.set("s", symbol);
    if (scenario.view === "future") params.set("w", "f");
  }
  return `#${params.toString()}`;
}

// The hash the page was opened with. Read once so our own later updates to
// the URL don't reset the calculator.
let openingHash: string | undefined;
const subscribeToNothing = () => () => {};
const getOpeningHash = () => (openingHash ??= window.location.hash);
const getServerHash = () => "";

export function Calculator() {
  // The server renders the defaults; a shared scenario in the link is
  // applied on the client by remounting with it as the starting state.
  const hash = useSyncExternalStore(subscribeToNothing, getOpeningHash, getServerHash);
  const restored = useMemo(() => readHash(hash), [hash]);
  return <Workspace key={hash} start={restored ?? DEFAULT_SCENARIO} />;
}

function Workspace({ start }: { start: Scenario }) {
  const [scenario, setScenario] = useState(start);
  const [draft, setDraft] = useState(start.ticker ?? "");
  const [copied, setCopied] = useState(false);
  const { inputs, real, mode, view } = scenario;

  useEffect(() => {
    // Leave the URL alone until something has actually been changed.
    if (scenario === start) return;
    const timer = setTimeout(() => {
      window.history.replaceState(null, "", writeHash(scenario));
    }, 400);
    return () => clearTimeout(timer);
  }, [scenario, start]);

  const update = (changes: Partial<Scenario>) =>
    setScenario((current) => ({ ...current, ...changes }));
  const set = <K extends keyof Inputs>(key: K) => (value: Inputs[K]) =>
    setScenario((current) => ({ ...current, inputs: { ...current.inputs, [key]: value } }));

  const symbol = activeSymbol(scenario);
  const loaded = useHistory(symbol);
  const stats = useMemo(
    () => (loaded.status === "ready" ? historicalStats(loaded.history.prices) : null),
    [loaded],
  );

  // Sliders stay responsive while the heavier simulation catches up.
  const deferred = useDeferredValue(inputs);
  const futureInputs = useMemo(
    () =>
      stats
        ? { ...deferred, returnPct: stats.returnPct, volatilityPct: stats.volatilityPct }
        : deferred,
    [deferred, stats],
  );

  const activePreset = PRESETS.find(
    (p) => p.returnPct === inputs.returnPct && p.volatilityPct === inputs.volatilityPct,
  );
  const draftSymbol = draft.trim().toUpperCase();

  const historical = mode !== "custom" && view === "history";
  // Looking back, the timeframe counts backward from today, as far as the
  // price history allows.
  const period = useMemo(() => {
    if (loaded.status !== "ready") return null;
    const prices = loaded.history.prices;
    const months = Math.min(deferred.years * 12, prices.length - 1);
    const slice = prices.slice(-(months + 1));
    return { start: slice[0].date, end: slice[months].date, stats: historicalStats(slice) };
  }, [loaded, deferred.years]);
  const shown = historical ? period?.stats : stats;

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-[340px_minmax(0,1fr)] lg:items-start">
      <form
        className="space-y-6 rounded-2xl border border-hairline bg-surface p-5 lg:sticky lg:top-6"
        onSubmit={(e) => {
          e.preventDefault();
          if (mode === "ticker" && TICKER.test(draftSymbol)) update({ ticker: draftSymbol });
        }}
      >
        <fieldset className="space-y-4">
          <legend className="mb-3 text-sm font-semibold text-ink">Your plan</legend>
          <NumberField
            label="Starting amount"
            value={inputs.initial}
            onChange={set("initial")}
            min={0}
            max={LIMITS.initial[1]}
            sliderMax={100_000}
            step={500}
            prefix="$"
          />
          <NumberField
            label="Added every month"
            value={inputs.monthly}
            onChange={set("monthly")}
            min={0}
            max={LIMITS.monthly[1]}
            sliderMax={3000}
            step={25}
            prefix="$"
          />
          <NumberField
            label="Time invested"
            value={inputs.years}
            onChange={(value) => set("years")(Math.round(value))}
            min={1}
            max={60}
            step={1}
            suffix="yrs"
            hint={
              historical
                ? `Counts backward: the investment starts ${inputs.years} year${inputs.years === 1 ? "" : "s"} ago and runs until today.`
                : undefined
            }
          />
        </fieldset>

        <fieldset className="space-y-4">
          <legend className="mb-3 text-sm font-semibold text-ink">The investment</legend>
          <Segmented
            label="Kind of investment"
            value={mode}
            onChange={(next) => update({ mode: next })}
            options={[
              { value: "custom", label: "My own numbers" },
              { value: "index", label: "Market index" },
              { value: "ticker", label: "Ticker" },
            ]}
          />

          {mode === "custom" && (
            <>
              <div>
                <div className="flex flex-wrap gap-1.5">
                  {PRESETS.map((preset) => (
                    <button
                      key={preset.name}
                      type="button"
                      aria-pressed={preset === activePreset}
                      onClick={() => {
                        set("returnPct")(preset.returnPct);
                        set("volatilityPct")(preset.volatilityPct);
                      }}
                      className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                        preset === activePreset
                          ? "border-growth bg-growth text-white"
                          : "border-hairline text-ink-2 hover:border-growth hover:text-ink"
                      }`}
                    >
                      {preset.name}
                    </button>
                  ))}
                </div>
                <p className="mt-2 text-xs text-ink-2">
                  Rough ballparks for illustration, not predictions.
                </p>
              </div>
              <NumberField
                label="Average yearly return"
                value={inputs.returnPct}
                onChange={set("returnPct")}
                min={0}
                max={LIMITS.returnPct[1]}
                sliderMax={15}
                step={0.5}
                suffix="%"
              />
              <NumberField
                label="Ups and downs"
                hint="How far a typical year lands from the average. Higher means a bumpier ride."
                value={inputs.volatilityPct}
                onChange={set("volatilityPct")}
                min={0}
                max={LIMITS.volatilityPct[1]}
                step={0.5}
                suffix="%"
              />
            </>
          )}

          {mode === "index" && (
            <div className="flex flex-wrap gap-1.5">
              {INDEXES.map((index) => (
                <button
                  key={index.symbol}
                  type="button"
                  aria-pressed={index.symbol === scenario.indexSymbol}
                  onClick={() => update({ indexSymbol: index.symbol })}
                  className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                    index.symbol === scenario.indexSymbol
                      ? "border-growth bg-growth text-white"
                      : "border-hairline text-ink-2 hover:border-growth hover:text-ink"
                  }`}
                >
                  {index.name}
                </button>
              ))}
            </div>
          )}

          {mode === "ticker" && (
            <div>
              <label htmlFor="ticker" className="text-sm font-medium text-ink">
                Ticker symbol
              </label>
              <div className="mt-1.5 flex gap-2">
                <input
                  id="ticker"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder="AAPL, VTI, MSFT"
                  autoCapitalize="characters"
                  autoComplete="off"
                  spellCheck={false}
                  maxLength={12}
                  className="min-w-0 flex-1 rounded-md border border-hairline bg-page px-2.5 py-1.5 text-sm uppercase text-ink outline-none placeholder:normal-case placeholder:text-muted focus:border-growth"
                />
                <button
                  type="submit"
                  disabled={!TICKER.test(draftSymbol)}
                  className="rounded-md bg-growth px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40"
                >
                  Look up
                </button>
              </div>
              <p className="mt-1.5 text-xs text-ink-2">Stocks, ETFs and funds all work.</p>
            </div>
          )}

          {mode !== "custom" && (
            <div>
              <label className="flex cursor-pointer items-center gap-2 text-sm font-medium text-ink">
                <input
                  type="checkbox"
                  checked={view === "history"}
                  onChange={(e) => update({ view: e.target.checked ? "history" : "future" })}
                  className="h-4 w-4 accent-(--series-growth)"
                />
                Historical
              </label>
              <p className="mt-1 text-xs text-ink-2">
                {historical
                  ? "Showing what really happened over the time invested, ending today."
                  : "Showing what could happen from today, based on past growth."}
              </p>
            </div>
          )}

          {mode !== "custom" && loaded.status === "ready" && period && shown && (
            <dl className="space-y-1.5 rounded-lg border border-hairline bg-page p-3 text-xs">
              <div className="text-sm font-medium text-ink">{loaded.history.name}</div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink-2">{historical ? "Period" : "Based on prices"}</dt>
                <dd className="text-ink">
                  {historical
                    ? `${formatMonth(period.start)} to ${formatMonth(period.end)}`
                    : `since ${formatMonth(loaded.history.prices[0].date)}`}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink-2">Average yearly growth</dt>
                <dd className="tabular-nums text-ink">{shown.returnPct}%</dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink-2">Ups and downs</dt>
                <dd className="tabular-nums text-ink">{shown.volatilityPct}%</dd>
              </div>
            </dl>
          )}
        </fieldset>

        <details className="group">
          <summary className="cursor-pointer text-sm font-semibold text-ink">
            Fees, inflation and raises
          </summary>
          <div className="mt-4 space-y-4">
            <NumberField
              label="Yearly fee"
              hint="Fund expense ratios and advisor fees, taken from the balance."
              value={inputs.feePct}
              onChange={set("feePct")}
              min={0}
              max={3}
              step={0.05}
              suffix="%"
            />
            <NumberField
              label="Inflation"
              hint="Used when looking ahead in today's dollars."
              value={inputs.inflationPct}
              onChange={set("inflationPct")}
              min={0}
              max={10}
              step={0.1}
              suffix="%"
            />
            <NumberField
              label="Raise contributions yearly"
              hint="Increase the monthly amount each year, for example as your pay rises."
              value={inputs.contributionGrowthPct}
              onChange={set("contributionGrowthPct")}
              min={0}
              max={10}
              step={0.5}
              suffix="%"
            />
          </div>
        </details>

        <div className="flex gap-2 border-t border-hairline pt-4">
          <button
            type="button"
            className="flex-1 rounded-md border border-hairline px-3 py-1.5 text-xs text-ink-2 hover:text-ink"
            onClick={() => {
              setScenario(DEFAULT_SCENARIO);
              setDraft("");
            }}
          >
            Reset
          </button>
          <button
            type="button"
            className="flex-1 rounded-md border border-hairline px-3 py-1.5 text-xs text-ink-2 hover:text-ink"
            onClick={async () => {
              const url = `${window.location.origin}${window.location.pathname}${writeHash(scenario)}`;
              try {
                await navigator.clipboard.writeText(url);
                setCopied(true);
                setTimeout(() => setCopied(false), 2000);
              } catch {
                window.history.replaceState(null, "", url);
              }
            }}
          >
            {copied ? "Link copied" : "Copy link to this scenario"}
          </button>
        </div>
      </form>

      {/* On small screens the results join the page's own grid, so the chart
          can be lifted above the inputs. */}
      <div className="min-w-0 max-lg:contents lg:space-y-6">
        {mode === "custom" && (
          <FutureResults
            inputs={futureInputs}
            real={real}
            onRealChange={(next) => update({ real: next })}
          />
        )}

        {mode !== "custom" && loaded.status === "idle" && (
          <Card className="text-sm text-ink-2">
            Enter a ticker symbol to see how it has done and how it could do.
          </Card>
        )}
        {mode !== "custom" && loaded.status === "loading" && (
          <Card className="text-sm text-ink-2">Loading price history for {symbol}…</Card>
        )}
        {mode !== "custom" && loaded.status === "error" && (
          <Card className="text-sm text-ink" >
            <p role="alert">{loaded.message}</p>
          </Card>
        )}

        {mode !== "custom" && loaded.status === "ready" && stats && (
          <>
            {view === "history" ? (
              <HistoryResults history={loaded.history} inputs={deferred} />
            ) : (
              <FutureResults
                inputs={futureInputs}
                real={real}
                onRealChange={(next) => update({ real: next })}
                basis={{
                  name: loaded.history.name,
                  years: stats.years,
                  simulationReturnPct: stats.simulationReturnPct,
                }}
              />
            )}
          </>
        )}
      </div>
    </div>
  );
}
