import "server-only";
import { db, type Tx } from "@/lib/db/client";
import { toOrder } from "@/lib/db/rows";
import { invalidateCatalog } from "@/lib/catalog";
import {
  capturePayment,
  fetchPayment,
  listOrderPayments,
  refundPayment,
  type RazorpayPayment,
} from "./razorpay";
import { demoRefundId } from "./demo";
import type { OrderDoc } from "@/types";
import { alertBuyerRefund, alertShopNewOrder, queueAlert } from "@/lib/email/alerts";

/**
 * Online payment lifecycle for an order, shared by the checkout server
 * actions (src/actions/orders.ts), the Razorpay webhook and both gateways
 * (Razorpay, or the built-in demo gateway — see ./provider.ts):
 *
 *   placeOrder(online) -> payment_status "pending", stock reserved, hidden
 *   from the shop -> recordPayment -> "paid", shop sees it and gets the alert
 *   ...or nobody pays within PAYMENT_WINDOW_MS -> expireUnpaidOrders cancels
 *   it and returns the stock.
 *   A paid order that's rejected/cancelled -> refundOrder (full refund).
 */

export const PAYMENT_WINDOW_MS = 15 * 60 * 1000;

/** Orders the shop should see: everything except unpaid/abandoned online orders. */
export const SHOP_VISIBLE_PAYMENT = ["none", "paid", "refund_pending", "refunded", "refund_failed"] as const;

async function lockOrder(tx: Tx, orderId: string): Promise<OrderDoc | null> {
  const [row] = await tx`select * from orders where id = ${orderId} for update`;
  return row ? toOrder(row) : null;
}

/** Puts an order's reserved stock back. Products deleted since simply don't match. */
async function returnStock(tx: Tx, order: OrderDoc, now: number): Promise<void> {
  if (!order.stockReserved) return;
  for (const item of order.items) {
    await tx`
      update products set stock = stock + ${item.qty}, in_stock = true, updated_at = ${now}
      where id = ${item.productId} and shop_id = ${order.shopId}
    `;
  }
}

/**
 * Flips an order to "paid" once a gateway has confirmed the money — once;
 * repeat calls (checkout callback + webhook both arriving) are no-ops. If
 * the order was already cancelled (paid after the 15-minute window), the
 * money is refunded instead.
 */
export async function recordPayment(
  orderId: string,
  paymentId: string,
  detail: string,
): Promise<"paid" | "refunded" | "ignored"> {
  const now = Date.now();
  const outcome = await db().begin(async (tx) => {
    const current = await lockOrder(tx, orderId);
    if (!current) return "ignored" as const;
    if (current.paymentStatus === "pending" && current.status === "PLACED") {
      await tx`
        update orders set
          payment_status = 'paid', gateway_payment_id = ${paymentId}, payment_detail = ${detail},
          paid_at = ${now}, updated_at = ${now}
        where id = ${orderId}
      `;
      // Online orders only count toward the shop once paid (see placeOrder).
      await tx`
        update shops set order_count = order_count + 1, pending_order_count = pending_order_count + 1
        where id = ${current.shopId}
      `;
      return "paid" as const;
    }
    if (current.paymentStatus === "expired" || (current.paymentStatus === "pending" && current.status !== "PLACED")) {
      // Paid too late: the order is already cancelled. Give the money back.
      await tx`
        update orders set
          payment_status = 'refund_pending', gateway_payment_id = ${paymentId}, payment_detail = ${detail},
          paid_at = ${now}, updated_at = ${now}
        where id = ${orderId}
      `;
      return "refund" as const;
    }
    return "ignored" as const; // already paid / refunded
  });

  if (outcome === "refund") {
    await refundOrder(orderId);
    return "refunded";
  }
  // The order only now reaches the shop — email the owner if they're away.
  if (outcome === "paid") await queueAlert((base) => alertShopNewOrder(orderId, base));
  return outcome;
}

/**
 * Razorpay only: checks the payment really belongs to this order and covers
 * the full amount (asking Razorpay, not trusting the browser), captures it
 * if it was only authorized, then records it.
 */
export async function markRazorpayOrderPaid(orderId: string, paymentId: string): Promise<"paid" | "refunded" | "ignored"> {
  const [row] = await db()`select * from orders where id = ${orderId}`;
  if (!row) return "ignored";
  const order = toOrder(row);
  if (order.paymentProvider !== "razorpay" || !order.gatewayOrderId) return "ignored";

  let payment: RazorpayPayment = await fetchPayment(paymentId);
  if (payment.order_id !== order.gatewayOrderId || payment.amount !== order.itemTotal) {
    console.error("[payments] payment does not match order", { orderId, paymentId });
    return "ignored";
  }
  if (payment.status === "authorized") payment = await capturePayment(paymentId, order.itemTotal);
  if (payment.status !== "captured") return "ignored";
  return recordPayment(orderId, paymentId, "Razorpay");
}

/** Full refund of an order in "refund_pending". Failures are recorded, not thrown. */
export async function refundOrder(orderId: string): Promise<void> {
  const [row] = await db()`select * from orders where id = ${orderId}`;
  if (!row) return;
  const order = toOrder(row);
  if (order.paymentStatus !== "refund_pending" || !order.gatewayPaymentId) return;
  try {
    const refundId =
      order.paymentProvider === "demo"
        ? demoRefundId()
        : (await refundPayment(order.gatewayPaymentId, { closebyOrderId: orderId })).id;
    await db()`
      update orders set payment_status = 'refunded', gateway_refund_id = ${refundId}, updated_at = ${Date.now()}
      where id = ${orderId} and payment_status = 'refund_pending'
    `;
    await queueAlert((base) => alertBuyerRefund(orderId, base));
  } catch (err) {
    console.error("[payments] refund failed", orderId, err);
    await db()`
      update orders set payment_status = 'refund_failed', updated_at = ${Date.now()}
      where id = ${orderId} and payment_status = 'refund_pending'
    `;
  }
}

/** Cancels one unpaid online order and returns its stock (buyer gave up / window passed). */
export async function cancelUnpaidOrder(orderId: string, reason: string): Promise<boolean> {
  const shopId = await db().begin(async (tx) => {
    const order = await lockOrder(tx, orderId);
    if (!order || order.paymentStatus !== "pending" || order.status !== "PLACED") return null;
    const now = Date.now();
    await returnStock(tx, order, now);
    const entry = { status: "CANCELLED", at: now, by: "buyer", reason };
    await tx`
      update orders set
        status = 'CANCELLED',
        payment_status = 'expired',
        rejection_reason = ${reason},
        timeline = timeline || ${tx.json([entry])},
        updated_at = ${now}
      where id = ${orderId}
    `;
    return order.shopId;
  });
  if (shopId) invalidateCatalog(shopId);
  return shopId !== null;
}

/**
 * Sweeps online orders still unpaid after PAYMENT_WINDOW_MS. For Razorpay
 * orders it first asks Razorpay whether a payment did arrive (the browser
 * may have closed before telling us, and webhooks can't reach a local dev
 * machine) and records it as paid if so. Cheap and bounded, so it runs
 * opportunistically from the order lists and checkout.
 */
export async function expireUnpaidOrders(scope: { shopId?: string; buyerId?: string } = {}): Promise<void> {
  const cutoff = Date.now() - PAYMENT_WINDOW_MS;
  const rows = await db()`
    select id, gateway_order_id, payment_provider from orders
    where payment_status = 'pending' and created_at < ${cutoff}
      ${scope.shopId ? db()`and shop_id = ${scope.shopId}` : db()``}
      ${scope.buyerId ? db()`and buyer_id = ${scope.buyerId}` : db()``}
    order by created_at
    limit 20
  `;
  for (const row of rows) {
    const orderId = row.id as string;
    try {
      if (row.paymentProvider === "razorpay" && row.gatewayOrderId) {
        const payments = await listOrderPayments(row.gatewayOrderId as string);
        const paid = payments.find((p) => p.status === "captured" || p.status === "authorized");
        if (paid) {
          await markRazorpayOrderPaid(orderId, paid.id);
          continue;
        }
      }
      await cancelUnpaidOrder(orderId, "Payment not completed in time");
    } catch (err) {
      console.error("[payments] could not expire order", orderId, err);
    }
  }
}
