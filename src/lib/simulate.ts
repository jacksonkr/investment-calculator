export type Inputs = {
  /** Starting lump sum, in dollars. */
  initial: number;
  /** Amount added every month, in dollars. */
  monthly: number;
  years: number;
  /** Expected average annual return, in percent. */
  returnPct: number;
  /** Annual volatility (standard deviation of yearly returns), in percent. */
  volatilityPct: number;
  /** Annual fee charged on the balance, in percent. */
  feePct: number;
  inflationPct: number;
  /** How much the monthly contribution rises each year, in percent. */
  contributionGrowthPct: number;
};

export const DEFAULT_INPUTS: Inputs = {
  initial: 5000,
  monthly: 300,
  years: 30,
  returnPct: 8,
  volatilityPct: 15,
  feePct: 0.2,
  inflationPct: 2.5,
  contributionGrowthPct: 0,
};

export type YearPoint = {
  year: number;
  contributed: number;
  balance: number;
  balanceNoFees: number;
};

export type OutcomePoint = {
  year: number;
  p10: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
};

export type Simulation = {
  outcomes: OutcomePoint[];
  /** Share of simulated paths that end with less than was put in (0..1). */
  lossChance: number;
  paths: number;
};

/**
 * The "steady" projection: the market returns exactly the expected rate every
 * single month. Contributions land at the start of each month.
 */
export function project(inputs: Inputs): YearPoint[] {
  const growth = Math.pow(1 + inputs.returnPct / 100, 1 / 12);
  const feeDrag = Math.pow(1 - inputs.feePct / 100, 1 / 12);

  let monthly = inputs.monthly;
  let contributed = inputs.initial;
  let balance = inputs.initial;
  let balanceNoFees = inputs.initial;

  const points: YearPoint[] = [{ year: 0, contributed, balance, balanceNoFees }];
  for (let year = 1; year <= inputs.years; year++) {
    for (let m = 0; m < 12; m++) {
      contributed += monthly;
      balance = (balance + monthly) * growth * feeDrag;
      balanceNoFees = (balanceNoFees + monthly) * growth;
    }
    points.push({ year, contributed, balance, balanceNoFees });
    monthly *= 1 + inputs.contributionGrowthPct / 100;
  }
  return points;
}

// Small seeded PRNG so a given seed always produces the same simulation.
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function percentile(sorted: Float64Array, p: number) {
  const pos = (sorted.length - 1) * p;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

/**
 * Monte Carlo simulation: many possible market histories, each with random
 * monthly returns. Yearly returns are log-normal, calibrated so their average
 * is `returnPct` and their standard deviation is `volatilityPct`.
 */
export function simulate(inputs: Inputs, seed: number, paths = 1000): Simulation {
  const mean = 1 + inputs.returnPct / 100;
  const sd = inputs.volatilityPct / 100;
  const logVar = Math.log(1 + (sd * sd) / (mean * mean));
  const monthlyMu = (Math.log(mean) - logVar / 2) / 12;
  const monthlySigma = Math.sqrt(logVar / 12);
  const feeDrag = Math.pow(1 - inputs.feePct / 100, 1 / 12);

  const random = mulberry32(seed);
  const gaussian = () => {
    const u = 1 - random();
    const v = random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
  };

  const years = inputs.years;
  // byYear[year] holds every path's balance at the end of that year.
  const byYear = Array.from({ length: years + 1 }, () => new Float64Array(paths));
  let contributed = inputs.initial;

  for (let p = 0; p < paths; p++) {
    let balance = inputs.initial;
    let monthly = inputs.monthly;
    contributed = inputs.initial;
    byYear[0][p] = balance;
    for (let year = 1; year <= years; year++) {
      for (let m = 0; m < 12; m++) {
        contributed += monthly;
        const growth = Math.exp(monthlyMu + monthlySigma * gaussian());
        balance = (balance + monthly) * growth * feeDrag;
      }
      byYear[year][p] = balance;
      monthly *= 1 + inputs.contributionGrowthPct / 100;
    }
  }

  let losses = 0;
  for (let p = 0; p < paths; p++) {
    if (byYear[years][p] < contributed) losses++;
  }

  const outcomes = byYear.map((balances, year) => {
    const sorted = balances.slice().sort();
    return {
      year,
      p10: percentile(sorted, 0.1),
      p25: percentile(sorted, 0.25),
      p50: percentile(sorted, 0.5),
      p75: percentile(sorted, 0.75),
      p90: percentile(sorted, 0.9),
    };
  });

  return { outcomes, lossChance: losses / paths, paths };
}

/** Converts a future dollar amount into today's purchasing power. */
export function deflator(inflationPct: number, year: number) {
  return Math.pow(1 + inflationPct / 100, -year);
}
