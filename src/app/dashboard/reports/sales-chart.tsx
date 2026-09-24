"use client";

import { useState } from "react";
import { format } from "date-fns";
import { formatPaise } from "@/lib/money";

export interface ChartBar {
  /** Start of the period, ms. */
  start: number;
  /** End of the period (inclusive day start), ms — same as start for daily bars. */
  end: number;
  revenue: number; // paise
  orders: number;
}

/** "₹1.2k" style axis labels — the tooltip shows exact amounts. */
function compactRupees(paise: number): string {
  const r = paise / 100;
  if (r >= 100_000) return `₹${(r / 100_000).toFixed(r >= 1_000_000 ? 0 : 1)}L`;
  if (r >= 1000) return `₹${(r / 1000).toFixed(r >= 10_000 ? 0 : 1)}k`;
  return `₹${Math.round(r)}`;
}

/** Round the axis top up to 1 / 2 / 2.5 / 5 × 10^n so gridlines land on clean values. */
function niceMax(v: number): number {
  if (v <= 0) return 100_00; // ₹100 so an empty chart still has an axis
  const pow = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (v <= m * pow) return m * pow;
  return 10 * pow;
}

function periodLabel(b: ChartBar): string {
  return b.start === b.end
    ? format(b.start, "EEE, d MMM")
    : `${format(b.start, "d MMM")} – ${format(b.end, "d MMM")}`;
}

/**
 * Single-series revenue bars. Plain HTML/CSS rather than a chart library:
 * one series, one hue (--primary-ink, which already has a dark-mode step),
 * rounded data-ends on the baseline, a recessive grid, and a tooltip on
 * hover/tap with the full-height column as the hit target.
 */
export function SalesChart({ bars }: { bars: ChartBar[] }) {
  const [active, setActive] = useState<number | null>(null);
  const max = niceMax(Math.max(...bars.map((b) => b.revenue)));
  const ticks = [max, max / 2, 0];
  const hovered = active !== null ? bars[active] : null;
  const labelIdx = new Set([0, Math.floor((bars.length - 1) / 2), bars.length - 1]);

  return (
    <div className="flex gap-2 select-none">
      {/* y axis */}
      <div className="text-muted-foreground relative w-10 shrink-0 text-right text-[11px] tabular-nums">
        <div className="relative h-48">
          {ticks.map((t, i) => (
            <span
              key={t}
              className="absolute right-0 -translate-y-1/2"
              style={{ top: `${(i / (ticks.length - 1)) * 100}%` }}
            >
              {compactRupees(t)}
            </span>
          ))}
        </div>
      </div>

      <div className="min-w-0 flex-1">
        <div className="relative h-48" onMouseLeave={() => setActive(null)}>
          {/* gridlines */}
          {ticks.map((t, i) => (
            <div
              key={t}
              className={`absolute inset-x-0 border-t ${i === ticks.length - 1 ? "border-border" : "border-border/50 border-dashed"}`}
              style={{ top: `${(i / (ticks.length - 1)) * 100}%` }}
            />
          ))}

          {/* bars — full-height columns are the hit targets */}
          <div className="absolute inset-0 flex items-end gap-[2px]">
            {bars.map((b, i) => (
              <button
                key={b.start}
                type="button"
                aria-label={`${periodLabel(b)}: ${formatPaise(b.revenue)}, ${b.orders} orders`}
                onMouseEnter={() => setActive(i)}
                onFocus={() => setActive(i)}
                onClick={() => setActive(i)}
                className="flex h-full min-w-0 flex-1 items-end outline-none"
              >
                <span
                  className={`bg-primary-ink block w-full rounded-t-[4px] transition-opacity ${
                    active !== null && active !== i ? "opacity-40" : ""
                  }`}
                  style={{ height: b.revenue > 0 ? `max(2px, ${(b.revenue / max) * 100}%)` : 0 }}
                />
              </button>
            ))}
          </div>

          {/* tooltip */}
          {hovered && active !== null && (
            <div
              className="bg-popover text-popover-foreground pointer-events-none absolute top-1 z-10 w-max -translate-x-1/2 rounded-lg border px-2.5 py-1.5 text-xs shadow-md"
              style={{
                left: `clamp(4.5rem, ${((active + 0.5) / bars.length) * 100}%, calc(100% - 4.5rem))`,
              }}
            >
              <p className="text-muted-foreground">{periodLabel(hovered)}</p>
              <p className="font-semibold tabular-nums">{formatPaise(hovered.revenue)}</p>
              <p className="text-muted-foreground tabular-nums">
                {hovered.orders} order{hovered.orders === 1 ? "" : "s"}
              </p>
            </div>
          )}
        </div>

        {/* x labels: first, middle, last */}
        <div className="text-muted-foreground relative mt-1 h-4 text-[11px]">
          {bars.map((b, i) =>
            labelIdx.has(i) ? (
              <span
                key={b.start}
                className={`absolute ${i === 0 ? "left-0" : i === bars.length - 1 ? "right-0" : "-translate-x-1/2"}`}
                style={i !== 0 && i !== bars.length - 1 ? { left: `${((i + 0.5) / bars.length) * 100}%` } : undefined}
              >
                {format(b.start, "d MMM")}
              </span>
            ) : null,
          )}
        </div>
      </div>
    </div>
  );
}
