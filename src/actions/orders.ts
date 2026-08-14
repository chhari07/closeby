"use server";

import { auth } from "@clerk/nextjs/server";
import { FieldValue } from "firebase-admin/firestore";
import { z } from "zod";
import { adminDb } from "@/lib/firebase/admin";
import { placeOrderSchema, type PlaceOrderInput } from "@/lib/validation/order";
import { isValidTransition, type Actor } from "@/lib/orders/transitions";
import type { ActionResult } from "./types";
import type { OrderDoc, OrderItem, OrderStatus } from "@/types";

export interface PlaceOrderRejection {
  reason: string;
  priceChanges?: { productId: string; name: string; newPrice: number }[];
  removedProductIds?: string[];
}

/** Thrown inside the transaction to carry a specific rejection out without a retry. */
class PlaceOrderAbort extends Error {
  constructor(public rejection: { error: string; detail: PlaceOrderRejection }) {
    super("PLACE_ORDER_ABORT");
  }
}

export async function placeOrder(
  input: PlaceOrderInput
): Promise<ActionResult<{ orderId: string }> & { rejection?: PlaceOrderRejection }> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "Not signed in" };

  const parsed = placeOrderSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid order" };
  }
  const { shopId, items, deliveryAddress, paymentMethod } = parsed.data;

  const shopRef = adminDb().collection("shops").doc(shopId);
  const userRef = adminDb().collection("users").doc(userId);
  const productRefs = items.map((i) => shopRef.collection("products").doc(i.productId));
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
          error: "This shop is no longer accepting orders. Please refresh your cart.",
          detail: { reason: "shop_unavailable" },
        });
      }

      const removedProductIds: string[] = [];
      const priceChanges: { productId: string; name: string; newPrice: number }[] = [];
      const orderItems: OrderItem[] = [];

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
          priceChanges.push({ productId: doc.id, name: p.name, newPrice: p.price });
          continue;
        }
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
          error: "Some items in your cart are no longer available. Your cart has been refreshed.",
          detail: { reason: "items_unavailable", removedProductIds },
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
        createdAt: now,
        updatedAt: now,
      };

      tx.set(orderRef, order);
    });
  } catch (err) {
    if (err instanceof PlaceOrderAbort) {
      return { ok: false, error: err.rejection.error, rejection: err.rejection.detail };
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
  reason?: string
): Promise<ActionResult> {
  const { userId } = await auth();
  if (!userId) return { ok: false, error: "Not signed in" };

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
        const shopDoc = await tx.get(adminDb().collection("shops").doc(order.shopId));
        if (shopDoc.data()?.ownerId !== userId) {
          throw new TransitionAbort("You do not have access to this order");
        }
        by = "shop";
      }

      const check = isValidTransition(order.status, toParsed.data, by);
      if (!check.ok) {
        throw new TransitionAbort(`Cannot move an order from ${order.status} to ${toParsed.data}`);
      }
      if (check.reasonRequired && !reasonParsed.data) {
        throw new TransitionAbort("A reason is required for this action");
      }

      const now = Date.now();
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
    });
  } catch (err) {
    if (err instanceof TransitionAbort) {
      return { ok: false, error: err.error };
    }
    throw err;
  }

  return { ok: true };
}

export async function getTodayOrderCounts(shopId: string): Promise<Record<OrderStatus, number>> {
  const startOfDay = new Date();
  startOfDay.setHours(0, 0, 0, 0);

  const snap = await adminDb()
    .collection("orders")
    .where("shopId", "==", shopId)
    .where("createdAt", ">=", startOfDay.getTime())
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
  for (const doc of snap.docs) {
    const status = doc.data().status as OrderStatus;
    counts[status] = (counts[status] ?? 0) + 1;
  }
  return counts;
}

export async function listMyOrders(): Promise<OrderDoc[]> {
  const { userId } = await auth();
  if (!userId) return [];
  const snap = await adminDb()
    .collection("orders")
    .where("buyerId", "==", userId)
    .orderBy("createdAt", "desc")
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<OrderDoc, "id">) }));
}
