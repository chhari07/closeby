"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { getOrder } from "@/actions/orders";
import { useOrderSignals } from "@/lib/hooks/use-order-signals";
import { playNewOrderPing } from "@/lib/audio/ping";
import { ensureNotificationPermission, showBrowserNotification } from "@/lib/notify/browser-notify";
import { formatPaise } from "@/lib/money";

/**
 * Dashboard-wide "a new order arrived" alert (sound + toast + OS
 * notification), independent of which page the owner is currently on.
 *
 * Old behaviour polled every 5s but only while the tab was visible, so
 * switching away to check something else meant the alert never fired.
 * This listens for live order signals instead: they keep arriving in the
 * background, and the OS notification (visible even minimized / on another
 * app) covers the moments sound + toast can't reach.
 */
export function OrderAlerts({ shopId }: { shopId: string }) {
  const router = useRouter();
  const alerted = useRef<Set<string>>(new Set());

  useEffect(() => {
    ensureNotificationPermission();
  }, []);

  useOrderSignals(`shop-orders:${shopId}`, async (signal) => {
    // A new order reaches the shop when it's placed (cash / pay at shop) or,
    // for an online order, when its payment goes through.
    const arrived =
      (signal.op === "INSERT" && (signal.paymentStatus ?? "none") === "none") ||
      (signal.op === "UPDATE" && signal.previousPaymentStatus === "pending" && signal.paymentStatus === "paid");
    if (!arrived || signal.status !== "PLACED") return;
    if (alerted.current.has(signal.id)) return;
    alerted.current.add(signal.id);

    // Re-read through the server: the signal carries no order details, and
    // getOrder only returns orders this owner's shop actually received.
    const order = await getOrder(signal.id);
    if (!order || order.shopId !== shopId || order.status !== "PLACED" || order.paymentStatus === "pending") return;

    playNewOrderPing();
    const itemCount = order.items.reduce((n, it) => n + it.qty, 0);
    const paid = order.paymentMethod === "online" ? " · paid online" : "";
    const body = `${order.buyerName} · ${itemCount} item${itemCount === 1 ? "" : "s"} · ${formatPaise(order.itemTotal)}${paid}`;
    toast.success("New order!", {
      description: body,
      action: { label: "View", onClick: () => router.push("/dashboard/orders") },
    });
    showBrowserNotification("New order — CloseBy", body, {
      tag: `order-${order.id}`,
      onClick: () => router.push("/dashboard/orders"),
    });
  });

  return null;
}
