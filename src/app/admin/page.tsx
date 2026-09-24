import type { Metadata } from "next";
import Link from "next/link";
import { AlertTriangle, CheckCircle2 } from "lucide-react";
import { getOpsDashboard } from "@/actions/ops";
import { formatDuration } from "@/lib/owner-stats";
import { COST_BASELINE_DAYS, COST_JUMP_RATIO, formatUsd } from "@/lib/ops-metrics";
import { CostChart } from "./cost-chart";

export const metadata: Metadata = { title: "Operator dashboard · CloseBy" };
export const dynamic = "force-dynamic";

const pct = (r: number | null) => (r === null ? "—" : `${(r * 100).toFixed(r < 0.1 && r > 0 ? 1 : 0)}%`);

/** AI answers take seconds: "1.4 s" rather than formatDuration's whole seconds. */
const aiTime = (ms: number) => (ms < 60_000 ? `${(ms / 1000).toFixed(1)} s` : formatDuration(ms));

const FLAG_LABEL: Record<string, string> = {
  burst: "Many orders in an hour",
  cancels: "Cancels most orders",
  rejected: "Often rejected by shops",
  unpaid: "Leaves online payments unpaid",
  big_cash: "Big cash order, new buyer",
  hoard: "Buys up a shop's stock",
  huge_qty: "Unusually large quantity",
  far: "Address far from shop",
  no_phone: "No phone number",
};

/**
 * Step 5.6 — the operator dashboard: AI cost per order, error / reject
 * rates, slowest responses, and the cost-jump alert. Only for the Clerk
 * users in ADMIN_USER_IDS; everyone else gets a 404.
 */
export default async function AdminPage({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  const days = (await searchParams).days === "30" ? 30 : 7;
  const d = await getOpsDashboard(days);
  const { ai, orders } = d;

  return (
    <div className="mx-auto max-w-5xl p-4 pb-24 sm:p-6">
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold">Operator dashboard</h1>
          <p className="text-muted-foreground text-sm">AI cost, errors and order health across all shops.</p>
        </div>
        <div className="flex rounded-lg border p-0.5 text-sm">
          {([7, 30] as const).map((n) => (
            <Link
              key={n}
              href={`/admin?days=${n}`}
              className={`rounded-md px-3 py-1.5 ${n === days ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}
            >
              {n} days
            </Link>
          ))}
        </div>
      </div>

      {/* Cost jump alert */}
      {ai.jump.jumped ? (
        <div className="mb-4 flex items-start gap-2 rounded-xl border border-red-300 bg-red-50 p-3 text-sm text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-200">
          <AlertTriangle className="mt-0.5 size-4 shrink-0" />
          <p>
            <b>AI spend jumped today:</b> {formatUsd(ai.jump.todayUsd)} so far, against a normal day of{" "}
            {formatUsd(ai.jump.baselineUsd)}
            {ai.jump.ratio ? ` (${ai.jump.ratio.toFixed(1)}×)` : ""}. Check the helpers below; set{" "}
            <code>AI_DISABLED=true</code> to stop all AI at once.
          </p>
        </div>
      ) : (
        <p className="text-muted-foreground mb-4 flex items-center gap-1.5 text-xs">
          <CheckCircle2 className="text-status-ready size-3.5" /> AI spend is normal today ({formatUsd(ai.jump.todayUsd)}; alert at{" "}
          {COST_JUMP_RATIO}× the {COST_BASELINE_DAYS}-day average of {formatUsd(ai.jump.baselineUsd)}).
        </p>
      )}

      {/* Headline numbers */}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Tile label="AI cost per order" value={ai.costPerOrderUsd === null ? "—" : formatUsd(ai.costPerOrderUsd)} note={`${formatUsd(ai.costUsd)} over ${orders.reached} orders`} />
        <Tile label="AI error rate" value={pct(ai.errorRate)} note={`${ai.runs} AI runs`} />
        <Tile label="Order reject rate" value={pct(orders.rejectRate)} note={`${orders.rejected} rejected · ${orders.cancelled} cancelled`} />
        <Tile
          label="Orders with warnings"
          value={String(orders.flagged)}
          note={`${orders.autoAccepted} auto-accepted${orders.refundFailed ? ` · ${orders.refundFailed} refunds failed` : ""}`}
        />
      </div>

      <Section title="AI spend per day" note="Last 14 days, India time. Today is so far.">
        <CostChart days={ai.daily} />
      </Section>

      <Section title="AI helpers" note={`Last ${days} days. Errors exclude runs refused by limits or switches.`}>
        <Table
          head={["Helper", "Runs", "Cost", "Per run", "Errors", "Refused", "Avg time", "Slowest 5%"]}
          rows={ai.byHelper.map((h) => [
            h.helper,
            h.runs,
            formatUsd(h.costUsd),
            formatUsd(h.runs ? h.costUsd / h.runs : 0),
            pct(h.runs - h.refused ? h.errors / (h.runs - h.refused) : null),
            h.refused,
            aiTime(h.avgMs),
            aiTime(h.p95Ms),
          ])}
          empty="No AI runs in this period."
        />
      </Section>

      <div className="grid gap-6 lg:grid-cols-2">
        <Section title="Slowest AI answers" note={`Last ${days} days.`}>
          <Table
            head={["Helper", "Time", "Result", "When"]}
            rows={ai.slowest.map((r) => [r.helper, aiTime(r.latencyMs), r.result, new Date(r.createdAt).toLocaleString("en-IN", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Kolkata" })])}
            empty="No AI runs in this period."
          />
        </Section>
        <Section title="Slowest shops to answer orders" note="Average time to accept/reject by hand; shops with 3+ orders.">
          <Table
            head={["Shop", "Avg time", "Orders"]}
            rows={d.slowShops.map((s) => [s.shopName || s.shopId.slice(0, 8), formatDuration(s.avgMs), s.orders])}
            empty="Not enough answered orders yet."
          />
        </Section>
      </div>

      <Section title="Order warnings" note={`Step 5.2 flags on orders from the last ${days} days. Nobody is blocked automatically.`}>
        <Table
          head={["Warning", "Orders"]}
          rows={orders.flagsByCode.map((f) => [FLAG_LABEL[f.code] ?? f.code, f.count])}
          empty="No warnings in this period."
        />
      </Section>
    </div>
  );
}

function Tile({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="bg-card rounded-2xl border p-4">
      <p className="text-muted-foreground text-xs">{label}</p>
      <p className="mt-1 text-2xl font-bold tabular-nums">{value}</p>
      <p className="text-muted-foreground mt-0.5 text-xs">{note}</p>
    </div>
  );
}

function Section({ title, note, children }: { title: string; note: string; children: React.ReactNode }) {
  return (
    <section className="bg-card mb-6 rounded-2xl border p-4">
      <p className="font-semibold">{title}</p>
      <p className="text-muted-foreground mb-3 text-xs">{note}</p>
      {children}
    </section>
  );
}

function Table({ head, rows, empty }: { head: string[]; rows: (string | number)[][]; empty: string }) {
  if (rows.length === 0) return <p className="text-muted-foreground text-sm">{empty}</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-muted-foreground border-b text-left text-xs">
            {head.map((h, i) => (
              <th key={h} className={`py-2 pr-3 font-medium ${i > 0 ? "text-right" : ""}`}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b last:border-0">
              {r.map((c, j) => (
                <td key={j} className={`py-2 pr-3 ${j > 0 ? "text-right tabular-nums" : ""}`}>
                  {c}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
