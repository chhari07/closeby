import { responseTimeMs } from "@/lib/owner-stats";
import type { OrderDoc } from "@/types";

/**
 * Step 5.6 — numbers for the operator dashboard (/admin): AI cost per order,
 * error / reject rates, slowest responses, and the "cost jumped" alert.
 * Pure, so it's unit-tested; src/actions/ops.ts loads the data.
 */

export const DAY_MS = 86_400_000;
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

/** Day number in IST (same bucketing as the SQL: floor((ms + 5.5 h) / 1 day)). */
export const istDay = (ms: number) => Math.floor((ms + IST_OFFSET_MS) / DAY_MS);
/** Start of an IST day number, in epoch ms. */
export const istDayStart = (day: number) => day * DAY_MS - IST_OFFSET_MS;

// --- Cost jump -------------------------------------------------------------------

/** Alert when today's AI spend is at least this many times the normal day… */
export const COST_JUMP_RATIO = 2;
/** …and at least this much in dollars (ignores tiny amounts like $0.02 → $0.05). */
export const COST_JUMP_MIN_USD = 0.5;
/** "Normal day" = the average of this many days before today (missing days count as $0). */
export const COST_BASELINE_DAYS = 7;

export interface CostJump {
  jumped: boolean;
  todayUsd: number;
  baselineUsd: number;
  /** today / baseline; null when the baseline is $0. */
  ratio: number | null;
}

export function detectCostJump(dailyUsd: Map<number, number>, today: number): CostJump {
  let sum = 0;
  for (let d = today - COST_BASELINE_DAYS; d < today; d++) sum += dailyUsd.get(d) ?? 0;
  const baselineUsd = sum / COST_BASELINE_DAYS;
  const todayUsd = dailyUsd.get(today) ?? 0;
  const ratio = baselineUsd > 0 ? todayUsd / baselineUsd : null;
  const jumped = todayUsd >= COST_JUMP_MIN_USD && todayUsd >= baselineUsd * COST_JUMP_RATIO;
  return { jumped, todayUsd, baselineUsd, ratio };
}

/** The last `days` IST days ending today, with $0 for days without runs — for the chart. */
export function dailySeries(dailyUsd: Map<number, number>, today: number, days: number): { day: number; usd: number }[] {
  return Array.from({ length: days }, (_, i) => {
    const day = today - days + 1 + i;
    return { day, usd: dailyUsd.get(day) ?? 0 };
  });
}

// --- Orders ------------------------------------------------------------------------

export interface OrderRates {
  /** Orders that reached shops (cash orders, and online ones once paid). */
  reached: number;
  rejected: number;
  cancelled: number;
  completed: number;
  /** rejected / reached; null when nothing reached a shop. */
  rejectRate: number | null;
  cancelRate: number | null;
}

export function orderRates(countsByStatus: Record<string, number>): OrderRates {
  const reached = Object.values(countsByStatus).reduce((a, b) => a + b, 0);
  const rejected = countsByStatus.REJECTED ?? 0;
  const cancelled = countsByStatus.CANCELLED ?? 0;
  return {
    reached,
    rejected,
    cancelled,
    completed: countsByStatus.COMPLETED ?? 0,
    rejectRate: reached ? rejected / reached : null,
    cancelRate: reached ? cancelled / reached : null,
  };
}

export interface ShopResponse {
  shopId: string;
  shopName: string;
  avgMs: number;
  orders: number;
}

/** Shops by average time to accept/reject (hand-answered orders only), slowest first. */
export function slowestShops(
  orders: Pick<OrderDoc, "shopId" | "shopName" | "paymentMethod" | "paidAt" | "timeline">[],
  minOrders = 3,
  limit = 5,
): ShopResponse[] {
  const byShop = new Map<string, { name: string; total: number; n: number }>();
  for (const o of orders) {
    const answer = o.timeline.find((t) => t.by === "shop" && (t.status === "ACCEPTED" || t.status === "REJECTED"));
    if (!answer || answer.auto) continue; // auto-accepted orders are instant; they'd hide slow owners
    const ms = responseTimeMs(o as OrderDoc);
    if (ms === null) continue;
    const s = byShop.get(o.shopId) ?? { name: o.shopName, total: 0, n: 0 };
    s.total += ms;
    s.n += 1;
    byShop.set(o.shopId, s);
  }
  return [...byShop.entries()]
    .filter(([, s]) => s.n >= minOrders)
    .map(([shopId, s]) => ({ shopId, shopName: s.name, avgMs: s.total / s.n, orders: s.n }))
    .sort((a, b) => b.avgMs - a.avgMs)
    .slice(0, limit);
}

/** "$0.0123" for small amounts, "$12.40" otherwise. */
export function formatUsd(usd: number): string {
  if (usd === 0) return "$0";
  if (usd < 0.1) return `$${usd.toFixed(4)}`;
  return `$${usd.toFixed(2)}`;
}
