import "server-only";
import type postgres from "postgres";
import { db } from "@/lib/db/client";
import { toOrder, toShop } from "@/lib/db/rows";
import { alertBuyerOrderUpdate, queueAlert } from "@/lib/email/alerts";
import { orderRiskFlags, RISK, DAY_MS, type HistoryOrder } from "./risk";
import { evaluateAutoAccept } from "./auto-accept";
import type { OrderDoc, RiskFlag } from "@/types";

/**
 * Runs once when an order reaches the shop: right after a cash / pay-at-shop
 * order is placed, or when an online order is paid (unpaid ones never reach
 * the shop). First the Step 5.2 warnings, then the Step 5.1 auto-accept —
 * in that order, because an order with warnings always waits for the owner.
 * Never throws: a failure here must not break placing or paying for an order;
 * the order then simply waits for the owner like before.
 */
export async function onOrderReachedShop(orderId: string): Promise<void> {
  try {
    await flagOrderRisk(orderId);
    await tryAutoAccept(orderId);
  } catch (err) {
    console.error("[order reached shop] failed", orderId, err);
  }
}

async function flagOrderRisk(orderId: string): Promise<RiskFlag[]> {
  const [row] = await db()`select * from orders where id = ${orderId}`;
  if (!row) return [];
  const order = toOrder(row);
  const now = Date.now();

  const [historyRows, shopRows, avgRows, stockRows] = await Promise.all([
    db()`
      select id, shop_id, status, payment_method, payment_status, created_at, timeline from orders
      where buyer_id = ${order.buyerId} and id <> ${orderId}
        and created_at >= ${now - RISK.historyDays * DAY_MS}
      order by created_at desc limit 200
    `,
    db()`select location from shops where id = ${order.shopId}`,
    db()`
      select avg(item_total)::float as avg from orders
      where shop_id = ${order.shopId} and status = 'COMPLETED'
        and created_at >= ${now - RISK.historyDays * DAY_MS}
    `,
    order.items.length
      ? db()`select id, stock from products where shop_id = ${order.shopId} and id = any(${order.items.map((i) => i.productId)})`
      : Promise.resolve([]),
  ]);

  const location = shopRows[0]?.location as { lat: number; lng: number } | null | undefined;
  const flags = orderRiskFlags({
    order,
    history: historyRows as unknown as HistoryOrder[],
    shopLocation: location ?? undefined,
    shopAvgOrderValue: (avgRows[0]?.avg as number | null) ?? null,
    stockLeft: Object.fromEntries(stockRows.map((r) => [r.id as string, Number(r.stock) || 0])),
    now,
  });
  if (flags.length) {
    await db()`update orders set risk_flags = ${db().json(flags as unknown as postgres.JSONValue)} where id = ${orderId}`;
  }
  return flags;
}

async function tryAutoAccept(orderId: string): Promise<void> {
  const accepted = await db().begin(async (tx) => {
    const [orderRow] = await tx`select * from orders where id = ${orderId} for update`;
    if (!orderRow) return false;
    const order: OrderDoc = toOrder(orderRow);
    const [shopRow] = await tx`select * from shops where id = ${order.shopId}`;
    if (!shopRow) return false;
    const shop = toShop(shopRow);
    const now = Date.now();
    const decision = evaluateAutoAccept(shop, order, now);
    if (!decision.accept) return false;

    // Same move and timeline shape as the owner tapping Accept (transitionOrder),
    // marked `auto` so the owner and the stats can tell them apart. PLACED ->
    // ACCEPTED keeps the order in the shop's pending counter, as a tap would.
    const entry = { status: "ACCEPTED", at: now, by: "shop", auto: true };
    await tx`
      update orders set status = 'ACCEPTED', updated_at = ${now}, timeline = timeline || ${tx.json([entry])}
      where id = ${orderId} and status = 'PLACED'
    `;
    return true;
  });
  if (accepted) await queueAlert((base) => alertBuyerOrderUpdate(orderId, "ACCEPTED", base));
}
