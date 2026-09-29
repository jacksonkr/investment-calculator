"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { formatCompact } from "@/lib/format";

export type TooltipRow = {
  label: string;
  value: string;
  /** CSS color for the key; omit for rows that aren't a plotted series. */
  color?: string;
  /** "line" keys a stroke, "band" keys a shaded range. */
  swatch?: "line" | "band";
};

export type Scales = {
  x: (index: number) => number;
  y: (value: number) => number;
  innerWidth: number;
  innerHeight: number;
};

type EndLabel = { value: number; color: string };

type Props = {
  ariaLabel: string;
  /** Index of the last point on the x axis; points run from 0 to `steps`. */
  steps: number;
  /** Allowed spacings between x-axis ticks, smallest first. */
  tickSteps: number[];
  tickLabel: (index: number) => string;
  /** Heading of the tooltip for the point at `index`. */
  title: (index: number) => string;
  yMax: number;
  height?: number;
  tooltip: (index: number) => TooltipRow[];
  /** Stats for the stretch between two points, shown once one is selected. */
  region: (from: number, to: number) => { heading: string; rows: TooltipRow[] };
  /** Series values at `index`, each marked with a dot while it is selected. */
  markers: (index: number) => EndLabel[];
  /** Series values at the final point, marked with a dot and a value label. */
  endLabels: EndLabel[];
  children: (scales: Scales) => ReactNode;
};

const MARGIN = { top: 16, right: 68, bottom: 28, left: 52 };

// Below this width a floating tooltip would cover the chart, so the values
// are shown in a panel underneath instead.
const PANEL_BELOW = 520;

function Readout({ heading, rows }: { heading: string; rows: TooltipRow[] }) {
  return (
    <>
      <div className="mb-1 font-medium text-ink-2">{heading}</div>
      {rows.map((row) => (
        <div key={row.label} className="flex items-center gap-2 py-0.5">
          <span className="flex w-3 shrink-0 justify-center">
            {row.color && (
              <span
                className={row.swatch === "band" ? "h-3 w-3 rounded-sm" : "h-0.5 w-3 rounded-full"}
                style={{ background: row.color, opacity: row.swatch === "band" ? 0.3 : 1 }}
              />
            )}
          </span>
          <span className="font-semibold tabular-nums text-ink">{row.value}</span>
          <span className="text-ink-2">{row.label}</span>
        </div>
      ))}
    </>
  );
}

function niceStep(max: number, targetTicks: number) {
  const rough = max / targetTicks;
  const magnitude = Math.pow(10, Math.floor(Math.log10(rough)));
  const normalized = rough / magnitude;
  const nice = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return nice * magnitude;
}

function tickStep(steps: number, candidates: number[], maxTicks: number) {
  return candidates.find((step) => steps / step <= maxTicks) ?? candidates[candidates.length - 1];
}

export function ChartFrame({
  ariaLabel,
  steps,
  tickSteps,
  tickLabel,
  title,
  yMax,
  height = 320,
  tooltip,
  region,
  markers,
  endLabels,
  children,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(640);
  const [measured, setMeasured] = useState(false);
  const [active, setActive] = useState<number | null>(null);
  // A selected stretch runs from where the drag began to where it is now.
  const [selection, setSelection] = useState<{ anchor: number; head: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const drag = useRef<{ anchor: number; moved: boolean } | null>(null);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver(([entry]) => {
      setWidth(Math.max(280, Math.round(entry.contentRect.width)));
      setMeasured(true);
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const innerWidth = width - MARGIN.left - MARGIN.right;
  const innerHeight = height - MARGIN.top - MARGIN.bottom;

  const step = niceStep(Math.max(yMax, 1), 5);
  const top = Math.ceil(Math.max(yMax, 1) / step) * step;
  const yTicks: number[] = [];
  for (let v = 0; v <= top + step / 2; v += step) yTicks.push(v);

  const xStep = tickStep(steps, tickSteps, innerWidth < 360 ? 5 : 8);
  const xTicks: number[] = [];
  for (let v = 0; v <= steps; v += xStep) xTicks.push(v);

  // Rounded so the server and the browser, whose floating point math can
  // differ in the last digit, render identical markup.
  const round = (v: number) => Math.round(v * 100) / 100;
  const x = (index: number) => round(MARGIN.left + (index / steps) * innerWidth);
  const y = (value: number) =>
    round(MARGIN.top + innerHeight - (Math.max(value, 0) / top) * innerHeight);

  const clamp = (index: number) => Math.min(steps, Math.max(0, index));
  const activeIndex = active === null ? null : clamp(active);

  // The chart can get shorter under a selection (a shorter timeframe), so
  // the selection is fitted to what is currently plotted.
  const from = selection ? clamp(Math.min(selection.anchor, selection.head)) : 0;
  const to = selection ? clamp(Math.max(selection.anchor, selection.head)) : 0;
  const selected = selection !== null && to > from;

  const indexFromPointer = (clientX: number) => {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return 0;
    const ratio = (clientX - rect.left - MARGIN.left) / innerWidth;
    return clamp(Math.round(ratio * steps));
  };

  // Keep end labels from overlapping: lower-valued labels are dropped when
  // they'd sit within a line-height of one already placed.
  const placed: EndLabel[] = [];
  for (const label of [...endLabels].sort((a, b) => b.value - a.value)) {
    if (placed.every((other) => Math.abs(y(other.value) - y(label.value)) >= 16)) {
      placed.push(label);
    }
  }

  const tooltipOnLeft = activeIndex !== null && x(activeIndex) > width / 2;
  const panelBelow = measured && width < PANEL_BELOW;
  const stats = selected ? region(from, to) : null;

  const dots = (index: number) =>
    markers(index).map((marker, i) => (
      <circle
        key={`${index}-${i}`}
        cx={x(index)}
        cy={y(marker.value)}
        r={4}
        fill={marker.color}
        stroke="var(--surface)"
        strokeWidth={2}
      />
    ));

  return (
    <div ref={containerRef} className="relative w-full">
      <svg
        width={width}
        height={height}
        role="img"
        aria-label={ariaLabel}
        tabIndex={0}
        className="block cursor-crosshair touch-pan-y select-none rounded-md outline-none focus-visible:ring-2 focus-visible:ring-growth"
        onPointerDown={(e) => {
          if (e.pointerType === "mouse" && e.button !== 0) return;
          const index = indexFromPointer(e.clientX);
          drag.current = { anchor: index, moved: false };
          // Keeps the drag alive when the pointer strays outside the chart.
          e.currentTarget.setPointerCapture(e.pointerId);
          setActive(index);
        }}
        onPointerMove={(e) => {
          const index = indexFromPointer(e.clientX);
          if (!drag.current) {
            setActive(index);
            return;
          }
          if (index === drag.current.anchor && !drag.current.moved) return;
          drag.current.moved = true;
          setDragging(true);
          setSelection({ anchor: drag.current.anchor, head: index });
        }}
        onPointerUp={(e) => {
          // A press that never moved is a plain click, which clears the selection.
          if (drag.current && !drag.current.moved) setSelection(null);
          if (drag.current?.moved) setActive(null);
          drag.current = null;
          setDragging(false);
          if (e.currentTarget.hasPointerCapture(e.pointerId)) {
            e.currentTarget.releasePointerCapture(e.pointerId);
          }
        }}
        onPointerCancel={() => {
          // The browser took over the gesture, usually to scroll the page.
          if (drag.current?.moved) setSelection(null);
          drag.current = null;
          setDragging(false);
        }}
        onPointerLeave={(e) => {
          // A finger lifting off leaves the point selected so it can be read.
          if (e.pointerType === "mouse" && !drag.current) setActive(null);
        }}
        onFocus={() => setActive((current) => current ?? steps)}
        onBlur={() => setActive(null)}
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            setSelection(null);
            return;
          }
          if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
          e.preventDefault();
          const delta = e.key === "ArrowLeft" ? -1 : 1;
          if (e.shiftKey) {
            // Shift and an arrow key grow the selection from the current point.
            const anchor = selection?.anchor ?? activeIndex ?? steps;
            const head = clamp((selection?.head ?? anchor) + delta);
            setSelection({ anchor, head });
            setActive(head);
            return;
          }
          setSelection(null);
          setActive((current) => clamp((current ?? steps) + delta));
        }}
      >
        {yTicks.map((tick) => (
          <g key={tick}>
            <line
              x1={MARGIN.left}
              x2={MARGIN.left + innerWidth}
              y1={y(tick)}
              y2={y(tick)}
              stroke={tick === 0 ? "var(--axis)" : "var(--grid)"}
              strokeWidth={1}
            />
            <text
              x={MARGIN.left - 8}
              y={y(tick)}
              dy="0.32em"
              textAnchor="end"
              fontSize={11}
              fill="var(--muted)"
              className="tabular-nums"
            >
              {formatCompact(tick)}
            </text>
          </g>
        ))}
        {xTicks.map((tick) => (
          <text
            key={tick}
            x={x(tick)}
            y={MARGIN.top + innerHeight + 18}
            textAnchor="middle"
            fontSize={11}
            fill="var(--muted)"
            className="tabular-nums"
          >
            {tickLabel(tick)}
          </text>
        ))}

        {selected && (
          <rect
            x={x(from)}
            y={MARGIN.top}
            width={x(to) - x(from)}
            height={innerHeight}
            fill="var(--ink)"
            opacity={0.08}
          />
        )}

        {children({ x, y, innerWidth, innerHeight })}

        {placed.map((label) => (
          <g key={label.color}>
            <circle
              cx={x(steps)}
              cy={y(label.value)}
              r={4}
              fill={label.color}
              stroke="var(--surface)"
              strokeWidth={2}
            />
            <text
              x={x(steps) + 10}
              y={y(label.value)}
              dy="0.32em"
              fontSize={12}
              fontWeight={600}
              fill="var(--ink)"
            >
              {formatCompact(label.value)}
            </text>
          </g>
        ))}

        {selected &&
          [from, to].map((edge) => (
            <g key={edge}>
              <line
                x1={x(edge)}
                x2={x(edge)}
                y1={MARGIN.top}
                y2={MARGIN.top + innerHeight}
                stroke="var(--ink-2)"
                strokeWidth={1}
              />
              {dots(edge)}
            </g>
          ))}

        {activeIndex !== null && !dragging && (
          <>
            <line
              x1={x(activeIndex)}
              x2={x(activeIndex)}
              y1={MARGIN.top}
              y2={MARGIN.top + innerHeight}
              stroke="var(--muted)"
              strokeWidth={1}
            />
            {dots(activeIndex)}
          </>
        )}
      </svg>

      {!panelBelow && !dragging && activeIndex !== null && (
        <div
          role="status"
          className="pointer-events-none absolute top-2 z-10 min-w-44 rounded-lg border border-hairline bg-surface px-3 py-2 text-xs shadow-lg"
          style={{
            left: x(activeIndex),
            transform: tooltipOnLeft ? "translateX(calc(-100% - 12px))" : "translateX(12px)",
          }}
        >
          <Readout heading={title(activeIndex)} rows={tooltip(activeIndex)} />
        </div>
      )}

      {stats && (
        <div
          role="status"
          data-readout="region"
          className="mt-2 rounded-lg border border-hairline bg-page px-3 py-2 text-xs"
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <Readout heading={stats.heading} rows={stats.rows} />
            </div>
            <button
              type="button"
              onClick={() => setSelection(null)}
              className="shrink-0 rounded-md border border-hairline px-2 py-1 text-ink-2 hover:text-ink"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      {panelBelow && !stats && (
        <div
          role="status"
          data-readout="point"
          className="mt-2 rounded-lg border border-hairline bg-page px-3 py-2 text-xs"
        >
          <Readout heading={title(activeIndex ?? steps)} rows={tooltip(activeIndex ?? steps)} />
        </div>
      )}

      {!stats && (
        <p className="mt-2 text-xs text-ink-2">
          {panelBelow
            ? "Touch the chart to see a point in time, or drag across it to select a period."
            : "Hover to see a point in time, or drag across the chart to select a period."}
        </p>
      )}
    </div>
  );
}

/** Builds an SVG path through the given points. */
export function linePath(points: [number, number][]) {
  return points.map(([px, py], i) => `${i === 0 ? "M" : "L"}${px.toFixed(1)},${py.toFixed(1)}`).join("");
}

/** Builds a closed SVG path between an upper and a lower edge. */
export function bandPath(upper: [number, number][], lower: [number, number][]) {
  return `${linePath(upper)}${linePath([...lower].reverse()).replace("M", "L")}Z`;
}
