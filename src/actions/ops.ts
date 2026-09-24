"use server";

import { db } from "@/lib/db/client";
import { toOrder } from "@/lib/db/rows";
import { requireAdmin } from "@/lib/auth/admin";
import { SHOP_VISIBLE_PAYMENT } from "@/lib/payments/orders";
import { dailyAiCost } from "@/lib/ops-alerts";
import {
  dailySeries,
  detectCostJump,
  istDay,
  orderRates,
  slowestShops,
  COST_BASELINE_DAYS,
  DAY_MS,
  type CostJump,
  type OrderRates,
  type ShopResponse,
} from "@/lib/ops-metrics";

export interface HelperRow {
  helper: string;
  runs: number;
  costUsd: number;
  errors: number;
  refused: number;
  avgMs: number;
  p95Ms: number;
}

export interface SlowRun {
  helper: string;
  model: string;
  latencyMs: number;
  result: string;
  createdAt: number;
}

export interface OpsDashboard {
  days: number;
  ai: {
    runs: number;
    costUsd: number;
    /** AI spend divided by orders that reached shops; null with no orders. */
    costPerOrderUsd: number | null;
    /** Runs that failed or gave an unusable answer (not counting refusals by limits/switches). */
    errorRate: number | null;
    byHelper: HelperRow[];
    slowest: SlowRun[];
    daily: { day: number; usd: number }[];
    jump: CostJump;
  };
  orders: OrderRates & {
    autoAccepted: number;
    flagged: number;
    flagsByCode: { code: string; count: number }[];
    refundFailed: number;
  };
  slowShops: ShopResponse[];
}

const CHART_DAYS = 14;

/** Step 5.6 — everything on /admin, for the last `days` days. Operators only. */
export async function getOpsDashboard(days: 7 | 30): Promise<OpsDashboard> {
  await requireAdmin();
  const now = Date.now();
  const since = now - days * DAY_MS;
  const today = istDay(now);
  const visible = [...SHOP_VISIBLE_PAYMENT];

  const [helperRows, slowRows, daily, statusRows, orderAgg, flagRows, answeredRows] = await Promise.all([
    db()`
      select helper,
        count(*)::int as runs,
        coalesce(sum(cost_usd), 0)::float as cost_usd,
        (count(*) filter (where result in ('error', 'invalid_output')))::int as errors,
        (count(*) filter (where result = 'refused'))::int as refused,
        coalesce(avg(latency_ms), 0)::float as avg_ms,
        coalesce(percentile_cont(0.95) within group (order by latency_ms), 0)::float as p95_ms
      from ai_runs where created_at >= ${since}
      group by helper order by cost_usd desc
    `,
    db()`
      select helper, model, latency_ms, result, created_at from ai_runs
      where created_at >= ${since} order by latency_ms desc limit 8
    `,
    dailyAiCost(today - Math.max(CHART_DAYS, COST_BASELINE_DAYS + 1)),
    db()`
      select status, count(*)::int as n from orders
      where created_at >= ${since} and payment_status = any(${visible})
      group by status
    `,
    db()`
      select
        (count(*) filter (where timeline @> ${db().json([{ status: "ACCEPTED", auto: true }])}))::int as auto_accepted,
        (count(*) filter (where jsonb_array_length(risk_flags) > 0))::int as flagged,
        (count(*) filter (where payment_status = 'refund_failed'))::int as refund_failed
      from orders where created_at >= ${since} and payment_status = any(${visible})
    `,
    db()`
      select f->>'code' as code, count(*)::int as n
      from orders, jsonb_array_elements(risk_flags) f
      where created_at >= ${since}
      group by 1 order by 2 desc
    `,
    db()`
      select shop_id, shop_name, payment_method, paid_at, timeline, created_at from orders
      where created_at >= ${since} and payment_status = any(${visible}) and status <> 'PLACED'
      order by created_at desc limit 3000
    `,
  ]);

  const byHelper = helperRows as unknown as HelperRow[];
  const runs = byHelper.reduce((a, h) => a + h.runs, 0);
  const costUsd = byHelper.reduce((a, h) => a + h.costUsd, 0);
  const counted = byHelper.reduce((a, h) => a + h.runs - h.refused, 0);
  const errors = byHelper.reduce((a, h) => a + h.errors, 0);
  const rates = orderRates(Object.fromEntries(statusRows.map((r) => [r.status as string, r.n as number])));
  const agg = orderAgg[0] ?? {};

  return {
    days,
    ai: {
      runs,
      costUsd,
      costPerOrderUsd: rates.reached ? costUsd / rates.reached : null,
      errorRate: counted ? errors / counted : null,
      byHelper,
      slowest: slowRows as unknown as SlowRun[],
      daily: dailySeries(daily, today, CHART_DAYS),
      jump: detectCostJump(daily, today),
    },
    orders: {
      ...rates,
      autoAccepted: (agg.autoAccepted as number) ?? 0,
      flagged: (agg.flagged as number) ?? 0,
      refundFailed: (agg.refundFailed as number) ?? 0,
      flagsByCode: flagRows.map((r) => ({ code: r.code as string, count: r.n as number })),
    },
    slowShops: slowestShops(answeredRows.map(toOrder)),
  };
}
