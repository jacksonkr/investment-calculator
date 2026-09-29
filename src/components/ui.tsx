import type { ReactNode } from "react";

export const GROWTH = "var(--series-growth)";
export const CONTRIB = "var(--series-contrib)";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-hairline bg-surface p-5 ${className}`}>
      {children}
    </section>
  );
}

export function StatTile({ label, value, note }: { label: string; value: string; note?: string }) {
  return (
    <div className="rounded-xl border border-hairline bg-surface p-4">
      <div className="text-xs text-ink-2">{label}</div>
      <div className="mt-1 text-xl font-semibold text-ink">{value}</div>
      {note && <div className="mt-0.5 text-xs text-ink-2">{note}</div>}
    </div>
  );
}

export function Legend({
  items,
}: {
  items: { label: string; color: string; swatch: "line" | "band" }[];
}) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
      {items.map((item) => (
        <li key={item.label} className="flex items-center gap-1.5">
          <span
            className={item.swatch === "band" ? "h-3 w-3 rounded-sm" : "h-0.5 w-3 rounded-full"}
            style={{ background: item.color, opacity: item.swatch === "band" ? 0.3 : 1 }}
          />
          {item.label}
        </li>
      ))}
    </ul>
  );
}

export function Insights({ items }: { items: (string | null)[] }) {
  return (
    <Card>
      <h2 className="text-base font-semibold text-ink">What this shows</h2>
      <ul className="mt-3 space-y-2 text-sm text-ink-2">
        {items
          .filter((text): text is string => text !== null)
          .map((text) => (
            <li key={text} className="flex gap-2">
              <span aria-hidden className="mt-2 h-1 w-1 shrink-0 rounded-full bg-muted" />
              <span>{text}</span>
            </li>
          ))}
      </ul>
    </Card>
  );
}

export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: T;
  options: { value: T; label: string }[];
  onChange: (value: T) => void;
}) {
  return (
    <div role="group" aria-label={label} className="flex rounded-lg border border-hairline bg-page p-0.5">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          aria-pressed={option.value === value}
          onClick={() => onChange(option.value)}
          className={`flex-1 rounded-md px-2.5 py-1.5 text-xs transition-colors ${
            option.value === value
              ? "bg-surface font-medium text-ink shadow-sm ring-1 ring-hairline"
              : "text-ink-2 hover:text-ink"
          }`}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
