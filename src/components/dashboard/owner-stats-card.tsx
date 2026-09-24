import { Bot, Clock, PackageCheck, TrendingDown, TrendingUp } from "lucide-react";
import { FIRST_PRODUCTS, formatDuration } from "@/lib/owner-stats";
import type { OwnerStats } from "@/actions/stats";

const pct = (rate: number) => `${Math.round(rate * 100)}%`;

/**
 * Step 3.4 — do the AI helpers actually help? Accept rate of the AI's
 * suggestions, how fast the shop answers orders, and how fast it filled
 * its catalogue (roadmap goal: 30 products in under 3 minutes).
 */
export function OwnerStatsCard({ stats }: { stats: OwnerStats }) {
  const { suggestions, response, catalogue } = stats;
  const s = suggestions.overall;

  let trend: { text: string; better: boolean } | null = null;
  if (response.thisWeekMs !== null && response.lastWeekMs !== null && response.lastWeekMs > 0) {
    const change = (response.thisWeekMs - response.lastWeekMs) / response.lastWeekMs;
    if (Math.abs(change) >= 0.05) {
      trend = {
        text: `${Math.round(Math.abs(change) * 100)}% ${change < 0 ? "faster" : "slower"} than last week (${formatDuration(response.lastWeekMs)})`,
        better: change < 0,
      };
    }
  }

  return (
    <div className="bg-card rounded-2xl border p-4">
      <div className="mb-3 flex items-center gap-2">
        <Bot className="text-primary size-4" />
        <p className="font-semibold">AI &amp; speed</p>
        <span className="text-muted-foreground text-xs">how the AI helpers are working for you</span>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        {/* Accept rate */}
        <div className="rounded-xl border p-3">
          <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <Bot className="size-3.5" /> AI suggestions accepted · 30 days
          </p>
          {s.rate === null ? (
            <p className="text-muted-foreground mt-1 text-sm">
              No decisions yet{s.ignored ? ` · ${s.ignored} not answered` : ""}. Use Get ideas, AI stock import or order
              advice.
            </p>
          ) : (
            <>
              <p className="mt-1 text-2xl font-bold">
                {pct(s.rate)} <span className="text-muted-foreground text-sm font-normal">({s.accepted} of {s.decided})</span>
              </p>
              <p className="text-muted-foreground text-xs">
                {s.acceptedAsIs} accepted without changes{s.ignored ? ` · ${s.ignored} not answered` : ""}
              </p>
              <ul className="mt-2 flex flex-col gap-0.5 text-xs">
                {suggestions.byType.map((t) => (
                  <li key={t.type} className="flex justify-between gap-2">
                    <span className="text-muted-foreground">{t.label}</span>
                    <span>{t.stats.rate === null ? "—" : `${pct(t.stats.rate)} (${t.stats.accepted}/${t.stats.decided})`}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>

        {/* Response time */}
        <div className="rounded-xl border p-3">
          <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <Clock className="size-3.5" /> Avg. time to accept/reject an order · 7 days
          </p>
          {response.thisWeekMs === null ? (
            <p className="text-muted-foreground mt-1 text-sm">No orders answered this week yet.</p>
          ) : (
            <>
              <p className="mt-1 text-2xl font-bold">{formatDuration(response.thisWeekMs)}</p>
              <p className="text-muted-foreground text-xs">
                over {response.thisWeekCount} order{response.thisWeekCount === 1 ? "" : "s"}
              </p>
              {trend && (
                <p className={`mt-1 flex items-center gap-1 text-xs font-medium ${trend.better ? "text-status-ready" : "text-status-stopped"}`}>
                  {trend.better ? <TrendingDown className="size-3.5" /> : <TrendingUp className="size-3.5" />}
                  {trend.text}
                </p>
              )}
            </>
          )}
        </div>

        {/* Catalogue speed */}
        <div className="rounded-xl border p-3">
          <p className="text-muted-foreground flex items-center gap-1.5 text-xs">
            <PackageCheck className="size-3.5" /> Time to add your first {FIRST_PRODUCTS} products
          </p>
          {catalogue.state === "done" ? (
            <>
              <p className="mt-1 text-2xl font-bold">{formatDuration(catalogue.ms)}</p>
              <p className={`text-xs font-medium ${catalogue.metTarget ? "text-status-ready" : "text-muted-foreground"}`}>
                {catalogue.metTarget ? "✓ Under the 3-minute goal" : "Goal: under 3 minutes"}
              </p>
            </>
          ) : catalogue.state === "in_progress" ? (
            <p className="text-muted-foreground mt-1 text-sm">
              {catalogue.added} of {FIRST_PRODUCTS} added so far.
            </p>
          ) : (
            <p className="text-muted-foreground mt-1 text-sm">
              Not measured — your first products were added before this was tracked.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
