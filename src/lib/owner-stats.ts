import type { OrderDoc } from "@/types";
import type { ApprovalStatus, ApprovalType } from "@/types/ai";

/**
 * Step 3.4 — the numbers that show whether the AI helpers actually help a
 * shop owner (roadmap goals): how often they accept the AI's suggestions,
 * how fast they answer new orders, and how fast a new shop fills its
 * catalogue. Pure, so it's unit-tested; src/actions/stats.ts loads the data.
 */

export const DAY_MS = 86_400_000;
export const STATS_WINDOW_DAYS = 30;
/** Roadmap target: a new shop lists its first 30 products in under 3 minutes. */
export const FIRST_PRODUCTS = 30;
export const FIRST_PRODUCTS_TARGET_MS = 3 * 60_000;

/** The owner-side AI helpers whose drafts the owner approves or rejects. */
export const OWNER_SUGGESTION_TYPES = ["draftStockList", "draftOrderAdvice", "shopIdea"] as const;
export type OwnerSuggestionType = (typeof OWNER_SUGGESTION_TYPES)[number];

export const SUGGESTION_LABEL: Record<OwnerSuggestionType, string> = {
  draftStockList: "Stock import",
  draftOrderAdvice: "Order advice",
  shopIdea: "Restock & price ideas",
};

export interface SuggestionRow {
  type: ApprovalType;
  status: ApprovalStatus;
  edited?: boolean | null;
  createdAt: number;
}

export interface AcceptStats {
  /** Owner decided: approved + rejected. */
  decided: number;
  accepted: number;
  /** Accepted exactly as the AI suggested. */
  acceptedAsIs: number;
  /** Never answered (expired, or replaced by newer ideas). */
  ignored: number;
  /** accepted / decided, 0-1; null when nothing was decided. */
  rate: number | null;
}

function acceptStats(rows: SuggestionRow[]): AcceptStats {
  const accepted = rows.filter((r) => r.status === "approved");
  const rejected = rows.filter((r) => r.status === "rejected").length;
  const decided = accepted.length + rejected;
  return {
    decided,
    accepted: accepted.length,
    acceptedAsIs: accepted.filter((r) => !r.edited).length,
    ignored: rows.filter((r) => r.status === "expired").length,
    rate: decided ? accepted.length / decided : null,
  };
}

/** Accept rate overall and per helper, for suggestions made in the window. */
export function suggestionStats(
  rows: SuggestionRow[],
  now: number,
): { overall: AcceptStats; byType: { type: OwnerSuggestionType; label: string; stats: AcceptStats }[] } {
  const since = now - STATS_WINDOW_DAYS * DAY_MS;
  const inWindow = rows.filter(
    (r) => r.createdAt >= since && (OWNER_SUGGESTION_TYPES as readonly string[]).includes(r.type),
  );
  return {
    overall: acceptStats(inWindow),
    byType: OWNER_SUGGESTION_TYPES.map((type) => ({
      type,
      label: SUGGESTION_LABEL[type],
      stats: acceptStats(inWindow.filter((r) => r.type === type)),
    })).filter((t) => t.stats.decided + t.stats.ignored > 0),
  };
}

/**
 * How long the shop took to accept or reject an order, from the moment it
 * reached them: placement, or payment for an online order (unpaid ones never
 * reach the shop). Null if the shop hasn't answered it.
 */
export function responseTimeMs(order: OrderDoc): number | null {
  const reached = order.paymentMethod === "online" ? order.paidAt : order.timeline.find((t) => t.status === "PLACED")?.at;
  const answered = order.timeline.find((t) => t.by === "shop" && (t.status === "ACCEPTED" || t.status === "REJECTED"));
  if (reached === undefined || !answered) return null;
  return Math.max(0, answered.at - reached);
}

export interface ResponseStats {
  /** Average over the last 7 days; null if no orders were answered. */
  thisWeekMs: number | null;
  thisWeekCount: number;
  /** The 7 days before that, for the trend. */
  lastWeekMs: number | null;
  lastWeekCount: number;
}

export function responseStats(orders: OrderDoc[], now: number): ResponseStats {
  const week = 7 * DAY_MS;
  const bucket = (from: number, to: number) => {
    const times = orders
      .filter((o) => o.createdAt >= from && o.createdAt < to)
      .map(responseTimeMs)
      .filter((t): t is number => t !== null);
    return { avg: times.length ? times.reduce((a, b) => a + b, 0) / times.length : null, count: times.length };
  };
  const thisWeek = bucket(now - week, now + 1);
  const lastWeek = bucket(now - 2 * week, now - week);
  return { thisWeekMs: thisWeek.avg, thisWeekCount: thisWeek.count, lastWeekMs: lastWeek.avg, lastWeekCount: lastWeek.count };
}

export type CatalogueSpeed =
  | { state: "done"; ms: number; metTarget: boolean }
  | { state: "in_progress"; added: number }
  | { state: "unknown" };

/**
 * Time from the first product added to the 30th. Products added before
 * this was tracked have no timestamp — if those make up the first 30,
 * the number can't be known.
 */
export function catalogueSpeed(createdAts: (number | null | undefined)[], totalProducts: number): CatalogueSpeed {
  if (totalProducts < FIRST_PRODUCTS) return { state: "in_progress", added: totalProducts };
  const known = createdAts.filter((t): t is number => typeof t === "number").sort((a, b) => a - b);
  if (known.length < totalProducts) return { state: "unknown" };
  const ms = known[FIRST_PRODUCTS - 1]! - known[0]!;
  return { state: "done", ms, metTarget: ms <= FIRST_PRODUCTS_TARGET_MS };
}

/** "2 min 40 s", "45 s", "1 h 5 min". */
export function formatDuration(ms: number): string {
  const s = Math.round(ms / 1000);
  if (s < 60) return `${s} s`;
  const m = Math.floor(s / 60);
  if (m < 60) return s % 60 ? `${m} min ${s % 60} s` : `${m} min`;
  const h = Math.floor(m / 60);
  return m % 60 ? `${h} h ${m % 60} min` : `${h} h`;
}
