"use server";

import { auth } from "@clerk/nextjs/server";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { placeOrderSchema, type PlaceOrderInput } from "@/lib/validation/order";
import { isValidTransition, isTerminal, type Actor } from "@/lib/orders/transitions";
import { rateLimit, rateLimitMessage } from "@/lib/rate-limit";
import type { ActionResult } from "./types";
import type { OrderDoc, OrderItem, OrderStatus } from "@/types";

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

export async function placeOrder(
  input: PlaceOrderInput,
): Promise<
  ActionResult<{ orderId: string }> & { rejection?: PlaceOrderRejection }
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

  const shopRef = adminDb().collection("shops").doc(shopId);
  const userRef = adminDb().collection("users").doc(userId);
  const productRefs = items.map((i) =>
    shopRef.collection("products").doc(i.productId),
  );
  const orderRef = adminDb().collection("orders").doc();

  // Read, validate and write inside one transaction — without this, a shop
  // closing or a product being re-priced/deleted in the gap between "check"
  // and "write" (e.g. two buyers checking out at once, or the owner editing
  // inventory mid-checkout) can silently slip through a plain read-then-write.
  try {
    await adminDb().runTransaction(async (tx) => {
      const [shopSnap, userSnap, ...productSnaps] = await Promise.all([
        tx.get(shopRef),
        tx.get(userRef),
        ...productRefs.map((ref) => tx.get(ref)),
      ]);

      if (!shopSnap.exists) {
        throw new PlaceOrderAbort({
          error: "This shop no longer exists",
          detail: { reason: "shop_gone" },
        });
      }
      const shop = shopSnap.data()!;
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
        ref: FirebaseFirestore.DocumentReference;
        stock: number;
        qty: number;
      }[] = [];

      for (let i = 0; i < productSnaps.length; i++) {
        const doc = productSnaps[i]!;
        const wanted = items[i]!;
        if (!doc.exists) {
          removedProductIds.push(wanted.productId);
          continue;
        }
        const p = doc.data()!;
        if (p.inStock === false || (p.stock ?? 0) <= 0) {
          removedProductIds.push(wanted.productId);
          continue;
        }
        if (p.price !== wanted.price) {
          priceChanges.push({
            productId: doc.id,
            name: p.name,
            newPrice: p.price,
          });
          continue;
        }
        if (p.stock < wanted.qty) {
          stockLimits.push({
            productId: doc.id,
            name: p.name,
            available: p.stock,
          });
          continue;
        }
        stockUpdates.push({ ref: doc.ref, stock: p.stock, qty: wanted.qty });
        orderItems.push({
          productId: doc.id,
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
      const userData = userSnap.data();

      const order: Omit<OrderDoc, "id"> = {
        buyerId: userId,
        shopId,
        shopName: shop.name,
        buyerName: userData?.name ?? "",
        buyerPhone: userData?.phone ?? "",
        items: orderItems,
        itemTotal,
        status: "PLACED",
        timeline: [{ status: "PLACED", at: now, by: "buyer" }],
        deliveryAddress: {
          line1: deliveryAddress.line1,
          landmark: deliveryAddress.landmark ?? "",
          lat: deliveryAddress.lat,
          lng: deliveryAddress.lng,
        },
        paymentMethod,
        stockReserved: true,
        createdAt: now,
        updatedAt: now,
      };

      // Reserve the stock: reject/cancel returns it (see transitionOrder).
      for (const u of stockUpdates) {
        const left = u.stock - u.qty;
        tx.update(u.ref, { stock: left, inStock: left > 0, updatedAt: now });
      }
      tx.set(orderRef, order);
      // Step 1.3 running counters — read on the dashboard instead of
      // scanning the orders collection.
      tx.update(shopRef, {
        orderCount: FieldValue.increment(1),
        pendingOrderCount: FieldValue.increment(1),
      });
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

  return { ok: true, data: { orderId: orderRef.id } };
}

export async function getOrder(orderId: string): Promise<OrderDoc | null> {
  const { userId } = await auth();
  if (!userId) return null;
  const doc = await adminDb().collection("orders").doc(orderId).get();
  if (!doc.exists) return null;
  const data = doc.data()!;
  if (data.buyerId !== userId) {
    const shopDoc = await adminDb().collection("shops").doc(data.shopId).get();
    if (shopDoc.data()?.ownerId !== userId) return null;
  }
  return { id: doc.id, ...(data as Omit<OrderDoc, "id">) };
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

  const orderRef = adminDb().collection("orders").doc(orderId);

  // Read the current status, check it against the transition map, and write
  // the new status atomically — otherwise two concurrent transitions (a
  // rapid double-click, or the buyer cancelling the instant the shop
  // accepts) can both pass validation against the same stale read.
  try {
    await adminDb().runTransaction(async (tx) => {
      const orderDoc = await tx.get(orderRef);
      if (!orderDoc.exists) throw new TransitionAbort("Order not found");
      const order = orderDoc.data() as OrderDoc;

      let by: Actor;
      if (order.buyerId === userId) {
        by = "buyer";
      } else {
        const shopDoc = await tx.get(
          adminDb().collection("shops").doc(order.shopId),
        );
        if (shopDoc.data()?.ownerId !== userId) {
          throw new TransitionAbort("You do not have access to this order");
        }
        by = "shop";
      }

      const check = isValidTransition(order.status, toParsed.data, by);
      if (!check.ok) {
        throw new TransitionAbort(
          `Cannot move an order from ${order.status} to ${toParsed.data}`,
        );
      }
      if (check.reasonRequired && !reasonParsed.data) {
        throw new TransitionAbort("A reason is required for this action");
      }

      // Reads must precede writes in a transaction, so load the products
      // before touching anything when stock has to be handed back.
      const releasesStock =
        (toParsed.data === "REJECTED" || toParsed.data === "CANCELLED") &&
        order.stockReserved;
      const productDocs = releasesStock
        ? await Promise.all(
            order.items.map((item) =>
              tx.get(
                adminDb()
                  .collection("shops")
                  .doc(order.shopId)
                  .collection("products")
                  .doc(item.productId),
              ),
            ),
          )
        : [];

      const now = Date.now();
      productDocs.forEach((doc, i) => {
        if (!doc.exists) return; // product was deleted since the order
        const stock = (doc.data()?.stock as number | undefined) ?? 0;
        tx.update(doc.ref, {
          stock: stock + order.items[i]!.qty,
          inStock: true,
          updatedAt: now,
        });
      });

      const update: Record<string, unknown> = {
        status: toParsed.data,
        updatedAt: now,
        timeline: FieldValue.arrayUnion({
          status: toParsed.data,
          at: now,
          by,
          ...(reasonParsed.data ? { reason: reasonParsed.data } : {}),
        }),
      };
      if (reasonParsed.data) update.rejectionReason = reasonParsed.data;

      tx.update(orderRef, update);
      // Step 1.3: the order just left the "pending" bucket for good.
      if (!isTerminal(order.status) && isTerminal(toParsed.data)) {
        tx.update(adminDb().collection("shops").doc(order.shopId), {
          pendingOrderCount: FieldValue.increment(-1),
        });
      }
    });
  } catch (err) {
    if (err instanceof TransitionAbort) {
      return { ok: false, error: err.error };
    }
    throw err;
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
  const shopDoc = await adminDb().collection("shops").doc(shopId).get();
  if (!shopDoc.exists || shopDoc.data()?.ownerId !== userId) {
    throw new Error("You do not own this shop");
  }

  const dayStart = startOfTodayIST();
  const snap = await adminDb()
    .collection("orders")
    .where("shopId", "==", shopId)
    .orderBy("createdAt", "desc")
    .limit(500)
    .get();

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

  for (const doc of snap.docs) {
    const order = doc.data() as OrderDoc;
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

  let q = adminDb()
    .collection("orders")
    .where("buyerId", "==", userId)
    .orderBy("createdAt", "desc")
    .limit(ORDERS_PAGE_SIZE);
  if (cursor) q = q.startAfter(cursor);

  const snap = await q.get();
  const orders = snap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<OrderDoc, "id">),
  }));
  const nextCursor =
    orders.length === ORDERS_PAGE_SIZE ? orders[orders.length - 1]!.createdAt : null;
  return { orders, nextCursor };
}

/**
 * The shop owner's orders, newest first, 20 at a time. Read through the
 * server so the dashboard works without a client-side Firebase session
 * (the live dashboard view uses a direct Firestore listener instead — see
 * src/app/dashboard/orders/page.tsx — and calls this only as a fallback).
 */
export async function listShopOrders(
  shopId: string,
  cursor?: number,
): Promise<ActionResult<OrdersPage>> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "Not signed in" };

  const shopDoc = await adminDb().collection("shops").doc(shopId).get();
  if (!shopDoc.exists || shopDoc.data()?.ownerId !== userId) {
    return { ok: false, error: "You do not own this shop" };
  }

  let q = adminDb()
    .collection("orders")
    .where("shopId", "==", shopId)
    .orderBy("createdAt", "desc")
    .limit(ORDERS_PAGE_SIZE);
  if (cursor) q = q.startAfter(cursor);

  const snap = await q.get();
  const orders = snap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<OrderDoc, "id">),
  }));
  const nextCursor =
    orders.length === ORDERS_PAGE_SIZE ? orders[orders.length - 1]!.createdAt : null;
  return { ok: true, data: { orders, nextCursor } };
}
