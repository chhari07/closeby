import { metersBetween } from "@/lib/geo/geohash";
import type { GeoPoint, OrderDoc, RiskFlag } from "@/types";

/**
 * Step 5.2 — spot orders that may be fake or abusive, as WARNINGS for the
 * owner to review. Nothing here blocks, cancels or bans anyone: the order
 * reaches the shop like any other, the owner reads the warnings and decides.
 * (An order with warnings is never auto-accepted — see auto-accept.ts.)
 * Pure, so it's unit-tested; src/lib/orders/reached-shop.ts loads the data.
 */

export const HOUR_MS = 3_600_000;
export const DAY_MS = 86_400_000;

/** Thresholds, in one place so they're easy to tune. */
export const RISK = {
  burstWindowMs: HOUR_MS,
  burstWarn: 3, // other orders by the same buyer in the last hour
  burstHigh: 6,
  historyDays: 30,
  cancelMin: 3, // buyer-cancelled orders in 30 days…
  cancelShare: 0.5, // …making up at least half of their orders
  rejectedMin: 3, // orders shops rejected in 30 days
  unpaidMin: 3, // online checkouts left unpaid in the last 24 h
  bigCashMin: 2000_00, // ₹2,000
  bigCashTimesAvg: 4,
  bigCashHigh: 10_000_00, // ₹10,000
  hoardShare: 0.8, // one line takes 80%+ of the shop's stock…
  hoardMinQty: 10, // …and at least this many units
  hugeQty: 25,
  farWarnM: 15_000,
  farHighM: 50_000,
} as const;

/** The buyer's other orders (any shop) from the last RISK.historyDays days. */
export type HistoryOrder = Pick<
  OrderDoc,
  "id" | "shopId" | "status" | "paymentMethod" | "paymentStatus" | "createdAt" | "timeline"
>;

export interface RiskContext {
  order: Pick<
    OrderDoc,
    "id" | "shopId" | "items" | "itemTotal" | "paymentMethod" | "deliveryAddress" | "buyerPhone" | "createdAt"
  >;
  history: HistoryOrder[];
  shopLocation?: GeoPoint;
  /** Average value (paise) of this shop's completed orders lately; null if none. */
  shopAvgOrderValue: number | null;
  /** Stock left per product AFTER this order reserved its share. */
  stockLeft: Record<string, number>;
  now: number;
}

const rupees = (paise: number) => `₹${Math.round(paise / 100).toLocaleString("en-IN")}`;
const km = (m: number) => `${Math.round(m / 1000)} km`;

export function orderRiskFlags(ctx: RiskContext): RiskFlag[] {
  const { order, now } = ctx;
  const flags: RiskFlag[] = [];
  const others = ctx.history.filter((o) => o.id !== order.id && o.createdAt >= now - RISK.historyDays * DAY_MS);

  // 1. Many orders in a short time.
  const lastHour = others.filter((o) => o.createdAt >= now - RISK.burstWindowMs).length;
  if (lastHour >= RISK.burstWarn) {
    flags.push({
      code: "burst",
      level: lastHour >= RISK.burstHigh ? "high" : "warn",
      text: `Placed ${lastHour} other orders in the last hour`,
    });
  }

  // 2. Cancels most of what they order.
  const cancelledByBuyer = others.filter(
    (o) => o.status === "CANCELLED" && o.paymentStatus !== "expired" && o.timeline.some((t) => t.status === "CANCELLED" && t.by === "buyer"),
  ).length;
  if (cancelledByBuyer >= RISK.cancelMin && cancelledByBuyer / others.length >= RISK.cancelShare) {
    flags.push({
      code: "cancels",
      level: "warn",
      text: `Cancelled ${cancelledByBuyer} of their ${others.length} orders in the last ${RISK.historyDays} days`,
    });
  }

  // 3. Other shops keep rejecting them.
  const rejected = others.filter((o) => o.status === "REJECTED").length;
  if (rejected >= RISK.rejectedMin) {
    flags.push({
      code: "rejected",
      level: "warn",
      text: `Shops rejected ${rejected} of their orders in the last ${RISK.historyDays} days`,
    });
  }

  // 4. Starts online checkouts and never pays (holds stock for 15 minutes each time).
  const unpaid = others.filter((o) => o.paymentStatus === "expired" && o.createdAt >= now - DAY_MS).length;
  if (unpaid >= RISK.unpaidMin) {
    flags.push({ code: "unpaid", level: "warn", text: `Left ${unpaid} online payments unpaid in the last 24 hours` });
  }

  // 5. A big cash order from someone who has never completed an order here.
  const cash = order.paymentMethod !== "online";
  const knownHere = others.some((o) => o.shopId === order.shopId && o.status === "COMPLETED");
  const bigLine = Math.max(RISK.bigCashMin, (ctx.shopAvgOrderValue ?? 0) * RISK.bigCashTimesAvg);
  if (cash && !knownHere && order.itemTotal >= bigLine) {
    flags.push({
      code: "big_cash",
      level: order.itemTotal >= RISK.bigCashHigh ? "high" : "warn",
      text: `${rupees(order.itemTotal)} to pay in cash, from a buyer with no completed orders at your shop` +
        (ctx.shopAvgOrderValue ? ` (your usual order is about ${rupees(ctx.shopAvgOrderValue)})` : ""),
    });
  }

  // 6. Buys up (almost) all of an item, or an unusual quantity.
  for (const item of order.items) {
    const before = (ctx.stockLeft[item.productId] ?? 0) + item.qty;
    if (item.qty >= RISK.hoardMinQty && item.qty / before >= RISK.hoardShare) {
      flags.push({
        code: "hoard",
        level: "warn",
        text: `Takes ${item.qty} of your ${before} ${item.name} — ${item.qty === before ? "all" : "almost all"} your stock`,
      });
    } else if (item.qty >= RISK.hugeQty) {
      flags.push({ code: "huge_qty", level: "warn", text: `Unusually large quantity: ${item.qty} × ${item.name}` });
    }
  }

  // 7. Delivery address far from the shop.
  const addr = order.deliveryAddress;
  if (ctx.shopLocation && (addr.lat !== 0 || addr.lng !== 0)) {
    const d = metersBetween(ctx.shopLocation, addr);
    if (d >= RISK.farWarnM) {
      flags.push({
        code: "far",
        level: d >= RISK.farHighM ? "high" : "warn",
        text: `Delivery address is ${km(d)} from your shop`,
      });
    }
  }

  // 8. No way to call them.
  if (!order.buyerPhone.trim()) flags.push({ code: "no_phone", level: "warn", text: "No phone number on the buyer's account" });

  return flags;
}
