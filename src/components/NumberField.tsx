"use client";

import { useId, useState } from "react";

type Props = {
  label: string;
  hint?: string;
  value: number;
  onChange: (value: number) => void;
  min: number;
  /** Largest value that can be typed. */
  max: number;
  /** Largest value the slider reaches; defaults to `max`. */
  sliderMax?: number;
  step: number;
  prefix?: string;
  suffix?: string;
};

export function NumberField({
  label,
  hint,
  value,
  onChange,
  min,
  max,
  sliderMax = max,
  step,
  prefix,
  suffix,
}: Props) {
  const id = useId();
  // While the user is typing we keep their raw text so partial entries
  // like "" or "1." aren't overwritten by the parsed number.
  const [draft, setDraft] = useState<string | null>(null);

  const commit = (raw: string) => {
    const parsed = Number(raw);
    if (raw.trim() === "" || !Number.isFinite(parsed)) return;
    onChange(Math.min(max, Math.max(min, parsed)));
  };

  return (
    <div>
      <div className="flex items-center justify-between gap-3">
        <label htmlFor={id} className="text-sm font-medium text-ink">
          {label}
        </label>
        <div className="flex items-center gap-1 rounded-md border border-hairline bg-page px-2 py-1 text-sm focus-within:border-growth">
          {prefix && <span className="text-muted">{prefix}</span>}
          <input
            id={id}
            type="number"
            inputMode="decimal"
            className="w-20 bg-transparent text-right tabular-nums text-ink outline-none [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
            value={draft ?? String(value)}
            min={min}
            max={max}
            step={step}
            onChange={(e) => {
              setDraft(e.target.value);
              commit(e.target.value);
            }}
            onBlur={() => setDraft(null)}
          />
          {suffix && <span className="text-muted">{suffix}</span>}
        </div>
      </div>
      <input
        type="range"
        aria-label={label}
        className="mt-2 w-full"
        value={Math.min(value, sliderMax)}
        min={min}
        max={sliderMax}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {hint && <p className="mt-0.5 text-xs text-ink-2">{hint}</p>}
    </div>
  );
}
