"use client";

import { useEffect, useRef } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "@clerk/nextjs";
import { toast } from "sonner";
import { getOrder } from "@/actions/orders";
import { useChatSignals, useOrderSignals } from "@/lib/hooks/use-order-signals";
import { playOrderUpdatePing } from "@/lib/audio/ping";
import { ensureNotificationPermission, showBrowserNotification } from "@/lib/notify/browser-notify";
import type { OrderStatus } from "@/types";

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
  const pathname = usePathname();
  const { userId } = useAuth();
  const alerted = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (userId) ensureNotificationPermission();
  }, [userId]);

  useOrderSignals(userId ? `buyer-orders:${userId}` : null, async (signal) => {
    if (signal.op !== "UPDATE" || signal.previousStatus === signal.status) return;
    if (!STATUS_MESSAGE[signal.status]) return; // CANCELLED is buyer-initiated — no alert needed.
    const key = `${signal.id}:${signal.status}`;
    if (alerted.current.has(key)) return;
    alerted.current.add(key);

    // Re-read through the server: the signal carries no order details, and
    // getOrder only returns this buyer's own orders.
    const order = await getOrder(signal.id);
    if (!order || order.buyerId !== userId || order.status !== signal.status) return;
    const message = STATUS_MESSAGE[order.status];
    if (!message) return;

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
  });

  // The shop replied in an order's chat (not shown while that chat is open).
  useChatSignals(userId ? `buyer-orders:${userId}` : null, async (signal) => {
    if (signal.sender !== "shop" || pathname === `/messages/${signal.orderId}`) return;
    const order = await getOrder(signal.orderId);
    if (!order || order.buyerId !== userId) return;
    playOrderUpdatePing();
    toast.info(`New message from ${order.shopName}`, {
      description: "Tap to read and reply.",
      action: { label: "Open", onClick: () => router.push(`/messages/${order.id}`) },
    });
    showBrowserNotification(`Message from ${order.shopName} — CloseBy`, "Tap to read and reply.", {
      tag: `chat-${order.id}`,
      onClick: () => router.push(`/messages/${order.id}`),
    });
  });

  return null;
}
