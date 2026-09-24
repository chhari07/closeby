"use server";

import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db/client";
import { findShop, toOrder } from "@/lib/db/rows";
import type { ActionResult } from "./types";
import type { OrderDoc, OrderStatus } from "@/types";
import { getShopCatalog } from "@/lib/catalog";

/**
 * The shop dashboard's Reports page: sales over time, when each product
 * needs restocking, every order, and every buyer — all worked out from the
 * shop's own orders + products in one read, so the four tabs always agree.
 */

const DAY_MS = 86_400_000;
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
/** Days of daily sales kept for the graph (the page offers 7 / 30 / 90). */
const SALES_DAYS = 90;
/** Sales window the restock forecast is based on. */
const VELOCITY_DAYS = 30;
/** Plan to restock this many days before a product is expected to run out. */
const RESTOCK_LEAD_DAYS = 2;
/** Newest orders read for the report — bounds a single page load. */
const MAX_ORDERS = 1000;

/** Orders whose stock stays taken: everything except rejected/cancelled. */
const COUNTS_AS_SOLD = new Set<OrderStatus>(["PLACED", "ACCEPTED", "PREPARING", "READY", "COMPLETED"]);

function istDayStart(ms: number): number {
  return Math.floor((ms + IST_OFFSET_MS) / DAY_MS) * DAY_MS - IST_OFFSET_MS;
}

function completedAt(order: OrderDoc): number {
  return (
    [...(order.timeline ?? [])].reverse().find((t) => t.status === "COMPLETED")?.at ??
    order.updatedAt ??
    order.createdAt
  );
}

export interface SalesDay {
  /** Start of the day (IST), ms. */
  day: number;
  /** Revenue from orders completed that day, paise. */
  revenue: number;
  orders: number;
}

export interface RestockRow {
  productId: string;
  name: string;
  unit: string;
  stock: number;
  /** Units sold (not rejected/cancelled) in the last VELOCITY_DAYS days. */
  sold30d: number;
  /** Expected days until it runs out at the current sales rate; null = no recent sales. */
  daysLeft: number | null;
  /** Suggested restock date (ms); null when there's no sales rate to go on. */
  restockBy: number | null;
  lastRestockedAt: number | null;
  urgency: "now" | "soon" | "ok" | "idle";
}

export interface ReportOrder {
  id: string;
  createdAt: number;
  buyerId: string;
  buyerName: string;
  buyerPhone: string;
  itemCount: number;
  items: string;
  itemTotal: number;
  status: OrderStatus;
  paymentMethod: string;
}

export interface BuyerRow {
  buyerId: string;
  name: string;
  phone: string;
  orders: number;
  completedOrders: number;
  /** Paise, completed orders only. */
  totalSpent: number;
  firstOrderAt: number;
  lastOrderAt: number;
}

export interface ShopReport {
  generatedAt: number;
  sales: SalesDay[];
  topProducts: { name: string; unit: string; qty: number; revenue: number }[];
  restock: RestockRow[];
  orders: ReportOrder[];
  buyers: BuyerRow[];
  /** True if the shop has more than MAX_ORDERS orders and older ones were left out. */
  truncated: boolean;
}

export async function getShopReport(shopId: string): Promise<ActionResult<ShopReport>> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "Not signed in" };
  const shop = await findShop(shopId);
  if (!shop || shop.ownerId !== userId) {
    return { ok: false, error: "You do not own this shop" };
  }

  const [orderRows, products] = await Promise.all([
    db()`select * from orders where shop_id = ${shopId} order by created_at desc limit ${MAX_ORDERS}`,
    getShopCatalog(shopId),
  ]);
  const orders = orderRows.map(toOrder);

  const now = Date.now();
  const today = istDayStart(now);

  // Sales graph: one bucket per day, revenue counted on the day it completed.
  const firstDay = today - (SALES_DAYS - 1) * DAY_MS;
  const sales: SalesDay[] = Array.from({ length: SALES_DAYS }, (_, i) => ({
    day: firstDay + i * DAY_MS,
    revenue: 0,
    orders: 0,
  }));
  const top = new Map<string, { name: string; unit: string; qty: number; revenue: number }>();
  const soldRecent = new Map<string, number>();
  const velocityStart = now - VELOCITY_DAYS * DAY_MS;
  const buyers = new Map<string, BuyerRow>();

  for (const o of orders) {
    if (o.status === "COMPLETED") {
      const at = completedAt(o);
      const idx = Math.floor((istDayStart(at) - firstDay) / DAY_MS);
      if (idx >= 0 && idx < SALES_DAYS) {
        sales[idx]!.revenue += o.itemTotal;
        sales[idx]!.orders += 1;
        if (at >= velocityStart) {
          for (const item of o.items) {
            const t = top.get(item.productId) ?? { name: item.name, unit: item.unit, qty: 0, revenue: 0 };
            t.qty += item.qty;
            t.revenue += item.price * item.qty;
            top.set(item.productId, t);
          }
        }
      }
    }

    if (COUNTS_AS_SOLD.has(o.status) && o.createdAt >= velocityStart) {
      for (const item of o.items) soldRecent.set(item.productId, (soldRecent.get(item.productId) ?? 0) + item.qty);
    }

    const b = buyers.get(o.buyerId) ?? {
      buyerId: o.buyerId,
      name: o.buyerName,
      phone: o.buyerPhone,
      orders: 0,
      completedOrders: 0,
      totalSpent: 0,
      firstOrderAt: o.createdAt,
      lastOrderAt: o.createdAt,
    };
    b.orders += 1;
    if (o.status === "COMPLETED") {
      b.completedOrders += 1;
      b.totalSpent += o.itemTotal;
    }
    // Orders are newest-first, so the first one seen already set the latest
    // name/phone and lastOrderAt; later ones only push firstOrderAt back.
    b.firstOrderAt = Math.min(b.firstOrderAt, o.createdAt);
    buyers.set(o.buyerId, b);
  }

  // Restock forecast: current stock ÷ average daily sales over the last 30
  // days (or since the oldest order, if the shop is newer than that).
  const oldestOrderAt = orders.length ? orders[orders.length - 1]!.createdAt : now;
  const windowDays = Math.max(7, Math.min(VELOCITY_DAYS, (now - oldestOrderAt) / DAY_MS));
  const restock: RestockRow[] = products.map((p) => {
    const sold = soldRecent.get(p.id) ?? 0;
    const perDay = sold / windowDays;
    const stock = Math.max(0, p.stock ?? 0);
    const daysLeft = perDay > 0 ? stock / perDay : null;
    const restockBy =
      stock === 0 ? today : daysLeft !== null ? istDayStart(now + Math.max(0, daysLeft - RESTOCK_LEAD_DAYS) * DAY_MS) : null;
    const urgency: RestockRow["urgency"] =
      stock === 0 ? "now" : daysLeft === null ? "idle" : daysLeft <= RESTOCK_LEAD_DAYS ? "now" : daysLeft <= 7 ? "soon" : "ok";
    return {
      productId: p.id,
      name: p.name,
      unit: p.unit,
      stock,
      sold30d: sold,
      daysLeft: daysLeft === null ? null : Math.round(daysLeft * 10) / 10,
      restockBy,
      lastRestockedAt: p.lastRestockedAt ?? null,
      urgency,
    };
  });
  const urgencyRank = { now: 0, soon: 1, ok: 2, idle: 3 } as const;
  restock.sort(
    (a, b) =>
      urgencyRank[a.urgency] - urgencyRank[b.urgency] ||
      (a.restockBy ?? Infinity) - (b.restockBy ?? Infinity) ||
      a.name.localeCompare(b.name),
  );

  return {
    ok: true,
    data: {
      generatedAt: now,
      sales,
      topProducts: [...top.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 5),
      restock,
      orders: orders.map((o) => ({
        id: o.id,
        createdAt: o.createdAt,
        buyerId: o.buyerId,
        buyerName: o.buyerName,
        buyerPhone: o.buyerPhone,
        itemCount: o.items.reduce((s, i) => s + i.qty, 0),
        items: o.items.map((i) => `${i.name} × ${i.qty}`).join(", "),
        itemTotal: o.itemTotal,
        status: o.status,
        paymentMethod: o.paymentMethod,
      })),
      buyers: [...buyers.values()].sort((a, b) => b.totalSpent - a.totalSpent || b.orders - a.orders),
      truncated: orders.length === MAX_ORDERS,
    },
  };
}
