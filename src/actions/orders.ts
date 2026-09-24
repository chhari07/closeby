"use server";

import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import type postgres from "postgres";
import { db } from "@/lib/db/client";
import { findOrder, findShop, toOrder, toProduct, toShop, toUser } from "@/lib/db/rows";
import { placeOrderSchema, type PlaceOrderInput } from "@/lib/validation/order";
import { isValidTransition, isTerminal, type Actor } from "@/lib/orders/transitions";
import { rateLimit, rateLimitMessage } from "@/lib/rate-limit";
import type { ActionResult } from "./types";
import type { OrderDoc, OrderItem, OrderStatus } from "@/types";
import { invalidateCatalog } from "@/lib/catalog";
import { createOrder as createRazorpayOrder, razorpayKeyId, verifyCheckoutSignature } from "@/lib/payments/razorpay";
import { activePaymentProvider } from "@/lib/payments/provider";
import { decideDemoPayment, demoOrderId, demoPaymentId, type DemoMethod } from "@/lib/payments/demo";
import {
  cancelUnpaidOrder,
  expireUnpaidOrders,
  markRazorpayOrderPaid,
  recordPayment,
  refundOrder,
  PAYMENT_WINDOW_MS,
  SHOP_VISIBLE_PAYMENT,
} from "@/lib/payments/orders";
import type { PaymentProvider } from "@/types";
import { alertBuyerOrderUpdate, alertShopNewOrder, queueAlert } from "@/lib/email/alerts";

export interface PlaceOrderRejection {
  reason: string;
  priceChanges?: { productId: string; name: string; newPrice: number }[];
  removedProductIds?: string[];
  /** Items whose requested qty exceeds what the shop has left. */
  stockLimits?: { productId: string; name: string; available: number }[];
}

/** Thrown inside the transaction to carry a specific rejection out without a retry. */
class PlaceOrderAbort extends Error {
  constructor(
    public rejection: { error: string; detail: PlaceOrderRejection },
  ) {
    super("PLACE_ORDER_ABORT");
  }
}

/** What the browser needs to open the payment screen for one order. */
export interface OrderPaymentSession {
  provider: PaymentProvider;
  /** Razorpay key id; empty for the demo gateway. */
  keyId: string;
  gatewayOrderId: string;
  amount: number; // paise
  /** When the order is auto-cancelled if still unpaid (epoch ms). */
  expiresAt: number;
  shopName: string;
  buyerName: string;
  buyerPhone: string;
}

export async function placeOrder(
  input: PlaceOrderInput,
): Promise<
  ActionResult<{ orderId: string; payment?: OrderPaymentSession }> & { rejection?: PlaceOrderRejection }
> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "Not signed in" };

  const limited = rateLimit("placeOrder", userId);
  if (!limited.ok) return { ok: false, error: rateLimitMessage(limited.retryAfterSec) };

  const parsed = placeOrderSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      error: parsed.error.issues[0]?.message ?? "Invalid order",
    };
  }
  const { shopId, deliveryAddress, paymentMethod } = parsed.data;
  const online = paymentMethod === "online";
  const provider = online ? activePaymentProvider() : null;
  if (online && !provider) {
    return { ok: false, error: "Online payment isn't available right now. Please choose another payment method." };
  }
  // Frees stock held by this buyer's own abandoned online checkouts first.
  if (online) await expireUnpaidOrders({ buyerId: userId });

  // Merge duplicate lines for the same product so stock is checked (and
  // deducted) once against the combined quantity.
  const merged = new Map<
    string,
    { productId: string; qty: number; price: number }
  >();
  for (const line of parsed.data.items) {
    const prev = merged.get(line.productId);
    if (prev) prev.qty = Math.min(50, prev.qty + line.qty);
    else merged.set(line.productId, { ...line });
  }
  const items = [...merged.values()];

  let orderId = "";

  // Read, validate and write inside one transaction, with the shop and
  // product rows locked (FOR UPDATE) — without this, a shop closing or a
  // product being re-priced/deleted in the gap between "check" and "write"
  // (e.g. two buyers checking out at once, or the owner editing inventory
  // mid-checkout) can silently slip through a plain read-then-write.
  try {
    await db().begin(async (tx) => {
      const [shopRow] = await tx`select * from shops where id = ${shopId} for update`;
      const [userRow] = await tx`select * from users where id = ${userId}`;
      const productRows = await tx`
        select * from products
        where shop_id = ${shopId} and id = any(${items.map((i) => i.productId)})
        for update
      `;
      const productsById = new Map(productRows.map((r) => [r.id as string, toProduct(r)]));

      if (!shopRow) {
        throw new PlaceOrderAbort({
          error: "This shop no longer exists",
          detail: { reason: "shop_gone" },
        });
      }
      const shop = toShop(shopRow);
      if (shop.status !== "live" || shop.isOpen !== true) {
        throw new PlaceOrderAbort({
          error:
            "This shop is no longer accepting orders. Please refresh your cart.",
          detail: { reason: "shop_unavailable" },
        });
      }

      const removedProductIds: string[] = [];
      const priceChanges: {
        productId: string;
        name: string;
        newPrice: number;
      }[] = [];
      const stockLimits: {
        productId: string;
        name: string;
        available: number;
      }[] = [];
      const orderItems: OrderItem[] = [];
      const stockUpdates: {
        productId: string;
        stock: number;
        qty: number;
      }[] = [];

      for (const wanted of items) {
        const p = productsById.get(wanted.productId);
        if (!p) {
          removedProductIds.push(wanted.productId);
          continue;
        }
        if (p.inStock === false || (p.stock ?? 0) <= 0) {
          removedProductIds.push(wanted.productId);
          continue;
        }
        if (p.price !== wanted.price) {
          priceChanges.push({
            productId: p.id,
            name: p.name,
            newPrice: p.price,
          });
          continue;
        }
        if (p.stock < wanted.qty) {
          stockLimits.push({
            productId: p.id,
            name: p.name,
            available: p.stock,
          });
          continue;
        }
        stockUpdates.push({ productId: p.id, stock: p.stock, qty: wanted.qty });
        orderItems.push({
          productId: p.id,
          name: p.name,
          unit: p.unit,
          price: p.price,
          qty: wanted.qty,
        });
      }

      if (removedProductIds.length > 0) {
        throw new PlaceOrderAbort({
          error:
            "Some items in your cart are no longer available. Your cart has been refreshed.",
          detail: { reason: "items_unavailable", removedProductIds },
        });
      }
      if (stockLimits.length > 0) {
        const first = stockLimits[0]!;
        throw new PlaceOrderAbort({
          error: `Only ${first.available} of ${first.name} left. Your cart has been updated.`,
          detail: { reason: "insufficient_stock", stockLimits },
        });
      }
      if (priceChanges.length > 0) {
        throw new PlaceOrderAbort({
          error: `The price of ${priceChanges[0]!.name} has changed. Please review your cart before placing the order.`,
          detail: { reason: "price_changed", priceChanges },
        });
      }

      const itemTotal = orderItems.reduce((sum, i) => sum + i.price * i.qty, 0);
      const now = Date.now();
      const user = userRow ? toUser(userRow) : null;

      // Reserve the stock: reject/cancel returns it (see transitionOrder).
      for (const u of stockUpdates) {
        const left = u.stock - u.qty;
        await tx`
          update products set stock = ${left}, in_stock = ${left > 0}, updated_at = ${now}
          where id = ${u.productId} and shop_id = ${shopId}
        `;
      }
      const [orderRow] = await tx`
        insert into orders ${tx({
          buyerId: userId,
          shopId,
          shopName: shop.name,
          buyerName: user?.name ?? "",
          buyerPhone: user?.phone ?? "",
          items: tx.json(orderItems as unknown as postgres.JSONValue),
          itemTotal,
          status: "PLACED",
          timeline: tx.json([{ status: "PLACED", at: now, by: "buyer" }]),
          deliveryAddress: tx.json({
            line1: deliveryAddress.line1,
            landmark: deliveryAddress.landmark ?? "",
            lat: deliveryAddress.lat,
            lng: deliveryAddress.lng,
          }),
          paymentMethod,
          // Online orders wait, hidden from the shop, until Razorpay confirms payment.
          paymentStatus: online ? "pending" : "none",
          paymentProvider: provider,
          stockReserved: true,
          createdAt: now,
          updatedAt: now,
        })}
        returning id
      `;
      orderId = orderRow!.id as string;
      // Step 1.3 running counters — read on the dashboard instead of
      // scanning the orders table. Online orders are counted once paid
      // (recordPayment), since an unpaid one may never reach the shop.
      if (!online) {
        await tx`
          update shops set order_count = order_count + 1, pending_order_count = pending_order_count + 1
          where id = ${shopId}
        `;
      }
    });
  } catch (err) {
    if (err instanceof PlaceOrderAbort) {
      return {
        ok: false,
        error: err.rejection.error,
        rejection: err.rejection.detail,
      };
    }
    throw err;
  }

  invalidateCatalog(shopId); // stock was reserved
  if (!online) {
    // Email the owner if they're not on the site (online orders: once paid).
    await queueAlert((base) => alertShopNewOrder(orderId, base));
    return { ok: true, data: { orderId } };
  }

  const payment = await openPaymentSession(orderId);
  if (!payment) {
    // Couldn't reach Razorpay: don't leave stock locked behind a dead checkout.
    await cancelUnpaidOrder(orderId, "Online payment could not be started");
    return { ok: false, error: "Could not start online payment. Please try again or choose another payment method." };
  }
  return { ok: true, data: { orderId, payment } };
}

/** Creates (once) the gateway's order for an unpaid online order and returns the checkout details. */
async function openPaymentSession(orderId: string): Promise<OrderPaymentSession | null> {
  const order = await findOrder(orderId);
  if (!order || order.paymentStatus !== "pending" || order.status !== "PLACED" || !order.paymentProvider) return null;
  let gatewayOrderId = order.gatewayOrderId;
  if (!gatewayOrderId) {
    try {
      gatewayOrderId =
        order.paymentProvider === "demo"
          ? demoOrderId()
          : (
              await createRazorpayOrder(order.itemTotal, orderId, {
                closebyOrderId: orderId,
                shopId: order.shopId,
                shopName: order.shopName.slice(0, 250),
              })
            ).id;
      await db()`update orders set gateway_order_id = ${gatewayOrderId} where id = ${orderId}`;
    } catch (err) {
      console.error("[payments] could not create gateway order", orderId, err);
      return null;
    }
  }
  return {
    provider: order.paymentProvider,
    keyId: order.paymentProvider === "razorpay" ? razorpayKeyId() : "",
    gatewayOrderId,
    amount: order.itemTotal,
    expiresAt: order.createdAt + PAYMENT_WINDOW_MS,
    shopName: order.shopName,
    buyerName: order.buyerName,
    buyerPhone: order.buyerPhone,
  };
}

/** "Pay now" on an order page: re-opens checkout for the buyer's own unpaid online order. */
export async function startOrderPayment(orderId: string): Promise<ActionResult<OrderPaymentSession>> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "Not signed in" };
  const order = await findOrder(orderId);
  if (!order || order.buyerId !== userId) return { ok: false, error: "Order not found" };
  if (order.paymentStatus !== "pending" || order.status !== "PLACED") {
    return { ok: false, error: "This order doesn't need a payment" };
  }
  const payment = await openPaymentSession(orderId);
  if (!payment) return { ok: false, error: "Could not start online payment. Please try again." };
  return { ok: true, data: payment };
}

/**
 * Called by the browser right after Razorpay Checkout succeeds. The
 * signature proves the payment came from Razorpay for this Razorpay order;
 * markRazorpayOrderPaid then double-checks amount + status with Razorpay itself.
 */
export async function confirmOrderPayment(
  orderId: string,
  response: { razorpayPaymentId: string; razorpayOrderId: string; razorpaySignature: string },
): Promise<ActionResult> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "Not signed in" };
  const order = await findOrder(orderId);
  if (!order || order.buyerId !== userId) return { ok: false, error: "Order not found" };
  if (order.paymentProvider !== "razorpay" || order.gatewayOrderId !== response.razorpayOrderId) {
    return { ok: false, error: "Payment does not match this order" };
  }
  if (!verifyCheckoutSignature(response.razorpayOrderId, response.razorpayPaymentId, response.razorpaySignature)) {
    return { ok: false, error: "Payment could not be verified" };
  }
  const outcome = await markRazorpayOrderPaid(orderId, response.razorpayPaymentId);
  if (outcome === "refunded") {
    return { ok: false, error: "This order had already been cancelled, so your payment is being refunded." };
  }
  return { ok: true };
}

/**
 * The demo gateway's "bank": decides the payment exactly like a real
 * gateway's test mode (success@demo, test card 4111..., OTP 123456 — see
 * src/lib/payments/demo.ts) and records it through the same path as a real
 * payment. Only available while the demo gateway is the active one, so it
 * can never mark an order paid on a site that takes real payments.
 */
export async function payDemoOrder(orderId: string, method: DemoMethod): Promise<ActionResult<{ paymentId: string }>> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "Not signed in" };
  if (activePaymentProvider() !== "demo") return { ok: false, error: "Demo payments are turned off" };
  const order = await findOrder(orderId);
  if (!order || order.buyerId !== userId) return { ok: false, error: "Order not found" };
  if (order.paymentProvider !== "demo" || order.paymentStatus !== "pending" || order.status !== "PLACED") {
    return { ok: false, error: "This order doesn't need a payment" };
  }

  const decision = decideDemoPayment(method);
  if (!decision.ok) return { ok: false, error: decision.error };
  const paymentId = demoPaymentId();
  const outcome = await recordPayment(orderId, paymentId, decision.detail);
  if (outcome === "refunded") {
    return { ok: false, error: "This order had already been cancelled, so your payment is being refunded." };
  }
  return { ok: true, data: { paymentId } };
}

export async function getOrder(orderId: string): Promise<OrderDoc | null> {
  const { userId } = await auth();
  if (!userId) return null;
  const order = await findOrder(orderId);
  if (!order) return null;
  if (order.buyerId !== userId) {
    const shop = await findShop(order.shopId);
    if (shop?.ownerId !== userId) return null;
  }
  return order;
}

export interface ReorderResult {
  shopId: string;
  shopName: string;
  items: { productId: string; name: string; unit: string; price: number; qty: number }[];
  unavailable: { productId: string; name: string }[];
}

/**
 * Step 4.3 ("reorder my usual" — the roadmap's own note: "no AI needed for
 * the base version"). Re-checks every line against the shop's CURRENT
 * status and CURRENT product stock/price — never trusts the frozen prices
 * on the old order doc — and returns cart-ready items instead of placing
 * an order directly; the buyer still reviews and confirms through the
 * normal cart -> placeOrder flow, which re-checks everything again anyway.
 */
export async function reorderFromOrder(orderId: string): Promise<ActionResult<ReorderResult>> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "Not signed in" };

  const limited = rateLimit("reorder", userId);
  if (!limited.ok) return { ok: false, error: rateLimitMessage(limited.retryAfterSec) };

  const order = await findOrder(orderId);
  if (!order) return { ok: false, error: "Order not found" };
  if (order.buyerId !== userId) return { ok: false, error: "Not your order" };

  const shop = await findShop(order.shopId);
  const shopName = shop?.name;
  if (!shop || shop.status !== "live" || !shopName) {
    return { ok: false, error: "This shop isn't available right now" };
  }

  const productRows = await db()`
    select * from products where shop_id = ${order.shopId} and id = any(${order.items.map((i) => i.productId)})
  `;
  const productsById = new Map(productRows.map((r) => [r.id as string, toProduct(r)]));

  const items: ReorderResult["items"] = [];
  const unavailable: ReorderResult["unavailable"] = [];
  for (const line of order.items) {
    const p = productsById.get(line.productId);
    if (!p || !p.inStock || p.stock < 1) {
      unavailable.push({ productId: line.productId, name: line.name });
      continue;
    }
    items.push({
      productId: line.productId,
      name: p.name,
      unit: p.unit,
      price: p.price, // current price, not the order's frozen price
      qty: Math.min(line.qty, p.stock),
    });
  }

  if (items.length === 0) {
    return { ok: false, error: "None of these items are available right now" };
  }

  return { ok: true, data: { shopId: order.shopId, shopName, items, unavailable } };
}

const orderStatusSchema = z.enum([
  "PLACED",
  "ACCEPTED",
  "PREPARING",
  "READY",
  "COMPLETED",
  "REJECTED",
  "CANCELLED",
]);
const reasonSchema = z.string().trim().min(1).max(300).optional();

/** Thrown inside the transaction to carry a specific rejection out without a retry. */
class TransitionAbort extends Error {
  constructor(public error: string) {
    super("TRANSITION_ABORT");
  }
}

export async function transitionOrder(
  orderId: string,
  to: OrderStatus,
  reason?: string,
): Promise<ActionResult> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "Not signed in" };

  const limited = rateLimit("transitionOrder", userId);
  if (!limited.ok) return { ok: false, error: rateLimitMessage(limited.retryAfterSec) };

  const toParsed = orderStatusSchema.safeParse(to);
  const reasonParsed = reasonSchema.safeParse(reason);
  if (!toParsed.success) return { ok: false, error: "Invalid order status" };
  if (!reasonParsed.success) return { ok: false, error: "Reason is too long" };

  /** Set inside the transaction when a reject/cancel puts stock back, so the cached catalog is refreshed. */
  let stockReturnedTo: string | null = null;
  /** Set when a paid online order is rejected/cancelled: refunded after the transaction commits. */
  let refundFor: string | null = null;
  /** Who made the change — the buyer gets an email only for the shop's moves. */
  let actor: Actor | null = null;

  // Read the current status (row locked FOR UPDATE), check it against the
  // transition map, and write the new status atomically — otherwise two
  // concurrent transitions (a rapid double-click, or the buyer cancelling
  // the instant the shop accepts) can both pass validation against the same
  // stale read.
  try {
    await db().begin(async (tx) => {
      const [orderRow] = await tx`select * from orders where id = ${orderId} for update`;
      if (!orderRow) throw new TransitionAbort("Order not found");
      const order = toOrder(orderRow);

      let by: Actor;
      if (order.buyerId === userId) {
        by = "buyer";
      } else {
        const [shopRow] = await tx`select owner_id from shops where id = ${order.shopId}`;
        if (shopRow?.ownerId !== userId) {
          throw new TransitionAbort("You do not have access to this order");
        }
        by = "shop";
      }

      // An unpaid online order isn't the shop's yet — only the buyer can act
      // on it (cancel), and that just abandons the payment.
      const awaitingPayment = order.paymentStatus === "pending";
      if (awaitingPayment && by === "shop") {
        throw new TransitionAbort("This order is waiting for the buyer's payment");
      }

      actor = by;
      const check = isValidTransition(order.status, toParsed.data, by);
      if (!check.ok) {
        throw new TransitionAbort(
          `Cannot move an order from ${order.status} to ${toParsed.data}`,
        );
      }
      if (check.reasonRequired && !reasonParsed.data) {
        throw new TransitionAbort("A reason is required for this action");
      }

      const now = Date.now();

      // Hand reserved stock back on reject/cancel. Products deleted since the
      // order simply don't match the update.
      const releasesStock =
        (toParsed.data === "REJECTED" || toParsed.data === "CANCELLED") &&
        order.stockReserved;
      if (releasesStock) {
        stockReturnedTo = order.shopId;
        for (const item of order.items) {
          await tx`
            update products set stock = stock + ${item.qty}, in_stock = true, updated_at = ${now}
            where id = ${item.productId} and shop_id = ${order.shopId}
          `;
        }
      }

      const entry = {
        status: toParsed.data,
        at: now,
        by,
        ...(reasonParsed.data ? { reason: reasonParsed.data } : {}),
      };
      const endsOrder = toParsed.data === "REJECTED" || toParsed.data === "CANCELLED";
      const nextPayment =
        endsOrder && order.paymentStatus === "paid"
          ? "refund_pending"
          : endsOrder && awaitingPayment
            ? "expired"
            : (order.paymentStatus ?? "none");
      if (nextPayment === "refund_pending") refundFor = orderId;
      await tx`
        update orders set
          status = ${toParsed.data},
          updated_at = ${now},
          timeline = timeline || ${tx.json([entry])},
          rejection_reason = coalesce(${reasonParsed.data ?? null}, rejection_reason),
          payment_status = ${nextPayment}
        where id = ${orderId}
      `;
      // Step 1.3: the order just left the "pending" bucket for good. (An
      // unpaid online order was never counted — see placeOrder.)
      if (!awaitingPayment && !isTerminal(order.status) && isTerminal(toParsed.data)) {
        await tx`
          update shops set pending_order_count = greatest(pending_order_count - 1, 0)
          where id = ${order.shopId}
        `;
      }
    });
  } catch (err) {
    if (err instanceof TransitionAbort) {
      return { ok: false, error: err.error };
    }
    throw err;
  }

  if (stockReturnedTo) invalidateCatalog(stockReturnedTo);
  // Outside the transaction: a network call to Razorpay. A failure is
  // recorded as "refund_failed" for a manual refund, never lost.
  if (refundFor) await refundOrder(refundFor);
  if (actor === "shop") {
    const status = toParsed.data;
    await queueAlert((base) => alertBuyerOrderUpdate(orderId, status, base));
  }
  return { ok: true };
}

export interface TodayStats {
  counts: Record<OrderStatus, number>;
  /** Sum of item totals (paise) for orders completed today. */
  revenueToday: number;
}

// Shops are in India, so "today" runs midnight-to-midnight IST regardless of
// where the server happens to run.
const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

function startOfTodayIST(now = Date.now()): number {
  return (
    Math.floor((now + IST_OFFSET_MS) / 86_400_000) * 86_400_000 - IST_OFFSET_MS
  );
}

/**
 * Dashboard numbers. Open work (PLACED / in progress) is counted whenever the
 * order was placed — it doesn't vanish at midnight. Finished orders are counted
 * by when they finished (their timeline entry), not when they were placed, so
 * "Completed today" includes an order placed last night and completed this morning.
 */
export async function getTodayOrderCounts(shopId: string): Promise<TodayStats> {
  const { userId } = await auth();
  if (!userId) throw new Error("Not signed in");
  const shop = await findShop(shopId);
  if (!shop || shop.ownerId !== userId) {
    throw new Error("You do not own this shop");
  }

  await expireUnpaidOrders({ shopId });
  const dayStart = startOfTodayIST();
  const rows = await db()`
    select * from orders
    where shop_id = ${shopId} and payment_status = any(${[...SHOP_VISIBLE_PAYMENT]})
    order by created_at desc limit 500
  `;

  const counts: Record<OrderStatus, number> = {
    PLACED: 0,
    ACCEPTED: 0,
    PREPARING: 0,
    READY: 0,
    COMPLETED: 0,
    REJECTED: 0,
    CANCELLED: 0,
  };
  let revenueToday = 0;

  for (const row of rows) {
    const order = toOrder(row);
    const isOpen = !["COMPLETED", "REJECTED", "CANCELLED"].includes(
      order.status,
    );
    if (isOpen) {
      counts[order.status] += 1;
      continue;
    }
    const finishedAt =
      [...(order.timeline ?? [])]
        .reverse()
        .find((t) => t.status === order.status)?.at ??
      order.updatedAt ??
      order.createdAt;
    if (finishedAt < dayStart) continue;
    counts[order.status] += 1;
    if (order.status === "COMPLETED") revenueToday += order.itemTotal;
  }
  return { counts, revenueToday };
}

/** Step 1.2: cursor pagination instead of one big fixed-size list. Page
 *  size 20, cursor is the previous page's last `createdAt` (matching the
 *  `orderBy` field) — pass the returned `nextCursor` back in to get the
 *  next page, or `null` when there isn't one. */
const ORDERS_PAGE_SIZE = 20;
export interface OrdersPage {
  orders: OrderDoc[];
  nextCursor: number | null;
}

export async function listMyOrders(cursor?: number): Promise<OrdersPage> {
  const { userId } = await auth();
  if (!userId) return { orders: [], nextCursor: null };

  if (!cursor) await expireUnpaidOrders({ buyerId: userId });
  const rows = await db()`
    select * from orders
    where buyer_id = ${userId} ${cursor ? db()`and created_at < ${cursor}` : db()``}
    order by created_at desc
    limit ${ORDERS_PAGE_SIZE}
  `;
  const orders = rows.map(toOrder);
  const nextCursor =
    orders.length === ORDERS_PAGE_SIZE ? orders[orders.length - 1]!.createdAt : null;
  return { orders, nextCursor };
}

/**
 * The shop owner's orders, newest first, `pageSize` (default 20) at a time.
 * The live dashboard (src/app/dashboard/orders/page.tsx) re-reads its list
 * through this whenever a live order signal arrives.
 */
export async function listShopOrders(
  shopId: string,
  cursor?: number,
  pageSize: number = ORDERS_PAGE_SIZE,
): Promise<ActionResult<OrdersPage>> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "Not signed in" };

  const shop = await findShop(shopId);
  if (!shop || shop.ownerId !== userId) {
    return { ok: false, error: "You do not own this shop" };
  }

  await expireUnpaidOrders({ shopId });
  const limit = Math.min(Math.max(1, Math.floor(pageSize)), 200);
  const rows = await db()`
    select * from orders
    where shop_id = ${shopId} and payment_status = any(${[...SHOP_VISIBLE_PAYMENT]})
      ${cursor ? db()`and created_at < ${cursor}` : db()``}
    order by created_at desc
    limit ${limit}
  `;
  const orders = rows.map(toOrder);
  const nextCursor =
    orders.length === limit ? orders[orders.length - 1]!.createdAt : null;
  return { ok: true, data: { orders, nextCursor } };
}
