"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { toast } from "sonner";
import { getDb } from "@/lib/firebase/client";
import { useFirebaseReady } from "@/lib/hooks/use-firebase-ready";
import { playOrderUpdatePing } from "@/lib/audio/ping";
import { ensureNotificationPermission, showBrowserNotification } from "@/lib/notify/browser-notify";
import type { OrderDoc, OrderStatus } from "@/types";

const STATUS_MESSAGE: Partial<Record<OrderStatus, string>> = {
  ACCEPTED: "was accepted",
  PREPARING: "is being prepared",
  READY: "is ready for pickup",
  COMPLETED: "is complete",
  REJECTED: "was rejected",
};

/**
 * Site-wide "your order status changed" alert for buyers (sound + toast +
 * OS notification) — previously the only place a buyer could see a status
 * change was the live timeline on that one order's own page. Mounted for
 * every signed-in user; it's simply empty for someone with no orders.
 */
export function BuyerOrderAlerts() {
  const router = useRouter();
  const { userId } = useAuth();
  const firebaseReady = useFirebaseReady();
  const isFirstSnapshot = useRef(true);
  const lastStatus = useRef<Map<string, OrderStatus>>(new Map());

  useEffect(() => {
    if (userId) ensureNotificationPermission();
  }, [userId]);

  useEffect(() => {
    if (!firebaseReady || !userId) return;
    isFirstSnapshot.current = true;
    lastStatus.current = new Map();

    const q = query(collection(getDb(), "orders"), where("buyerId", "==", userId));
    const unsub = onSnapshot(
      q,
      (snap) => {
        if (isFirstSnapshot.current) {
          isFirstSnapshot.current = false;
          for (const d of snap.docs) {
            lastStatus.current.set(d.id, (d.data() as OrderDoc).status);
          }
          return;
        }
        for (const change of snap.docChanges()) {
          if (change.type !== "added" && change.type !== "modified") continue;
          const order = { id: change.doc.id, ...(change.doc.data() as Omit<OrderDoc, "id">) };
          const previous = lastStatus.current.get(order.id);
          lastStatus.current.set(order.id, order.status);
          if (previous === order.status) continue;

          const message = STATUS_MESSAGE[order.status];
          if (!message) continue; // CANCELLED is buyer-initiated — no alert needed.

          playOrderUpdatePing();
          const body = `Your order from ${order.shopName} ${message}.`;
          toast.info("Order update", {
            description: body,
            action: { label: "View", onClick: () => router.push(`/orders/${order.id}`) },
          });
          showBrowserNotification("Order update — CloseBy", body, {
            tag: `order-${order.id}`,
            onClick: () => router.push(`/orders/${order.id}`),
          });
        }
      },
      (err) => console.error("Buyer order alert listener failed", err),
    );
    return unsub;
  }, [userId, firebaseReady, router]);

  return null;
}
