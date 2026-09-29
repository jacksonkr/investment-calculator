const full = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

const compact = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  notation: "compact",
  maximumFractionDigits: 1,
});

export const formatMoney = (value: number) => full.format(Math.round(value));

export const formatCompact = (value: number) =>
  Math.abs(value) < 10_000 ? formatMoney(value) : compact.format(value);

export const formatPercent = (value: number, digits = 0) =>
  `${(value * 100).toFixed(digits)}%`;

/** A percentage that always carries its sign, for gains and losses. */
export const formatChange = (value: number, digits = 0) =>
  `${value < 0 ? "−" : "+"}${Math.abs(value * 100).toFixed(digits)}%`;
