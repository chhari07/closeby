"use client";

import { useState } from "react";
import { format } from "date-fns";
import { formatUsd, istDayStart } from "@/lib/ops-metrics";

/** Round the axis top up to 1 / 2 / 2.5 / 5 × 10^n so gridlines land on clean values. */
function niceMax(v: number): number {
  if (v <= 0) return 1; // $1 so an empty chart still has an axis
  const pow = 10 ** Math.floor(Math.log10(v));
  for (const m of [1, 2, 2.5, 5, 10]) if (v <= m * pow) return m * pow;
  return 10 * pow;
}

/** Noon IST of that day, so the label shows the IST date wherever the browser is. */
const labelTime = (day: number) => istDayStart(day) + 12 * 3_600_000;

/**
 * Step 5.6 — AI spend per day, single series. Same build as the owner's
 * sales chart (src/app/dashboard/reports/sales-chart.tsx): one hue, rounded
 * data-ends on the baseline, recessive grid, tooltip on hover/tap.
 */
export function CostChart({ days }: { days: { day: number; usd: number }[] }) {
  const [active, setActive] = useState<number | null>(null);
  const max = niceMax(Math.max(...days.map((d) => d.usd)));
  const ticks = [max, max / 2, 0];
  const hovered = active !== null ? days[active] : null;
  const labelIdx = new Set([0, Math.floor((days.length - 1) / 2), days.length - 1]);

  return (
    <div className="flex gap-2 select-none">
      <div className="text-muted-foreground relative w-12 shrink-0 text-right text-[11px] tabular-nums">
        <div className="relative h-40">
          {ticks.map((t, i) => (
            <span key={t} className="absolute right-0 -translate-y-1/2" style={{ top: `${(i / (ticks.length - 1)) * 100}%` }}>
              {formatUsd(t)}
            </span>
          ))}
        </div>
      </div>

      <div className="min-w-0 flex-1">
        <div className="relative h-40" onMouseLeave={() => setActive(null)}>
          {ticks.map((t, i) => (
            <div
              key={t}
              className={`absolute inset-x-0 border-t ${i === ticks.length - 1 ? "border-border" : "border-border/50 border-dashed"}`}
              style={{ top: `${(i / (ticks.length - 1)) * 100}%` }}
            />
          ))}
          <div className="absolute inset-0 flex items-end gap-[2px]">
            {days.map((d, i) => (
              <button
                key={d.day}
                type="button"
                aria-label={`${format(labelTime(d.day), "EEE, d MMM")}: ${formatUsd(d.usd)}`}
                onMouseEnter={() => setActive(i)}
                onFocus={() => setActive(i)}
                onClick={() => setActive(i)}
                className="flex h-full min-w-0 flex-1 items-end outline-none"
              >
                <span
                  className={`bg-primary-ink block w-full rounded-t-[4px] transition-opacity ${
                    active !== null && active !== i ? "opacity-40" : ""
                  }`}
                  style={{ height: d.usd > 0 ? `max(2px, ${(d.usd / max) * 100}%)` : 0 }}
                />
              </button>
            ))}
          </div>
          {hovered && active !== null && (
            <div
              className="bg-popover text-popover-foreground pointer-events-none absolute top-1 z-10 w-max -translate-x-1/2 rounded-lg border px-2.5 py-1.5 text-xs shadow-md"
              style={{ left: `clamp(4rem, ${((active + 0.5) / days.length) * 100}%, calc(100% - 4rem))` }}
            >
              <p className="text-muted-foreground">
                {format(labelTime(hovered.day), "EEE, d MMM")}
                {active === days.length - 1 ? " (so far)" : ""}
              </p>
              <p className="font-semibold tabular-nums">{formatUsd(hovered.usd)}</p>
            </div>
          )}
        </div>
        <div className="text-muted-foreground relative mt-1 h-4 text-[11px]">
          {days.map((d, i) =>
            labelIdx.has(i) ? (
              <span
                key={d.day}
                className={`absolute ${i === 0 ? "left-0" : i === days.length - 1 ? "right-0" : "-translate-x-1/2"}`}
                style={i !== 0 && i !== days.length - 1 ? { left: `${((i + 0.5) / days.length) * 100}%` } : undefined}
              >
                {i === days.length - 1 ? "Today" : format(labelTime(d.day), "d MMM")}
              </span>
            ) : null,
          )}
        </div>
      </div>
    </div>
  );
}
