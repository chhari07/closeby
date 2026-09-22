"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { toast } from "sonner";
import { getDb } from "@/lib/firebase/client";
import { useFirebaseReady } from "@/lib/hooks/use-firebase-ready";
import { playNewOrderPing } from "@/lib/audio/ping";
import { ensureNotificationPermission, showBrowserNotification } from "@/lib/notify/browser-notify";
import { formatPaise } from "@/lib/money";
import type { OrderDoc } from "@/types";

/**
 * Dashboard-wide "a new order arrived" alert (sound + toast + OS
 * notification), independent of which page the owner is currently on.
 *
 * Old behaviour polled every 5s but only while the tab was visible, so
 * switching away to check something else meant the alert never fired.
 * This uses a live Firestore listener instead: it keeps receiving pushes
 * in the background, and the OS notification (visible even minimized /
 * on another app) covers the moments sound + toast can't reach.
 */
export function OrderAlerts({ shopId }: { shopId: string }) {
  const router = useRouter();
  const firebaseReady = useFirebaseReady();
  const isFirstSnapshot = useRef(true);

  useEffect(() => {
    ensureNotificationPermission();
  }, []);

  useEffect(() => {
    if (!firebaseReady) return;
    isFirstSnapshot.current = true;

    const q = query(collection(getDb(), "orders"), where("shopId", "==", shopId));
    const unsub = onSnapshot(
      q,
      (snap) => {
        // The first snapshot is the whole existing order history hydrating
        // locally — every doc arrives as "added" then, so it must not alert.
        if (isFirstSnapshot.current) {
          isFirstSnapshot.current = false;
          return;
        }
        for (const change of snap.docChanges()) {
          if (change.type !== "added") continue;
          const order = { id: change.doc.id, ...(change.doc.data() as Omit<OrderDoc, "id">) };
          if (order.status !== "PLACED") continue;

          playNewOrderPing();
          const itemCount = order.items.reduce((n, it) => n + it.qty, 0);
          const body = `${order.buyerName} · ${itemCount} item${itemCount === 1 ? "" : "s"} · ${formatPaise(order.itemTotal)}`;
          toast.success("New order!", {
            description: body,
            action: { label: "View", onClick: () => router.push("/dashboard/orders") },
          });
          showBrowserNotification("New order — CloseBy", body, {
            tag: `order-${order.id}`,
            onClick: () => router.push("/dashboard/orders"),
          });
        }
      },
      (err) => console.error("Order alert listener failed", err),
    );
    return unsub;
  }, [shopId, firebaseReady, router]);

  return null;
}
