import { formatPaise } from "@/lib/money";
import type { OrderChatMessage, OrderDoc, OrderStatus } from "@/types";

/**
 * The buyer's Messages tab. Every alert a buyer gets (order status changes,
 * payment, refund) becomes a message — built from the order's own timeline
 * and payment fields rather than stored separately, so all past alerts are
 * there automatically and can never drift from the order itself.
 */

export type MessageKind = OrderStatus | "PAID" | "REFUNDED" | "REFUND_PENDING";

export interface BuyerMessage {
  id: string;
  orderId: string;
  shopName: string;
  kind: MessageKind;
  title: string;
  body: string;
  at: number;
  /** Things the buyer did themselves (placing, cancelling) never count as unread. */
  fromBuyer: boolean;
}

const plural = (n: number, word: string) => `${n} ${word}${n === 1 ? "" : "s"}`;

export function messagesForOrder(order: OrderDoc): BuyerMessage[] {
  const shop = order.shopName;
  const units = order.items.reduce((n, i) => n + i.qty, 0);
  const summary = `${plural(units, "item")} · ${formatPaise(order.itemTotal)}`;
  const out: BuyerMessage[] = [];
  const push = (m: Omit<BuyerMessage, "orderId" | "shopName">) => out.push({ ...m, orderId: order.id, shopName: shop });

  for (const [i, t] of (order.timeline ?? []).entries()) {
    const id = `${order.id}:${i}`;
    const reason = t.reason ? ` Reason: ${t.reason}` : "";
    switch (t.status) {
      case "PLACED":
        push({
          id,
          kind: "PLACED",
          at: t.at,
          fromBuyer: true,
          title: "Order placed",
          body:
            order.paymentMethod === "online"
              ? `Your order from ${shop} (${summary}) is created. It goes to the shop once the payment is done.`
              : `Your order from ${shop} (${summary}) has been sent to the shop.`,
        });
        break;
      case "ACCEPTED":
        push({ id, kind: t.status, at: t.at, fromBuyer: false, title: "Order accepted", body: `${shop} accepted your order.` });
        break;
      case "PREPARING":
        push({ id, kind: t.status, at: t.at, fromBuyer: false, title: "Being prepared", body: `${shop} is preparing your order.` });
        break;
      case "READY":
        push({ id, kind: t.status, at: t.at, fromBuyer: false, title: "Ready for pickup", body: `Your order from ${shop} is ready.` });
        break;
      case "COMPLETED":
        push({ id, kind: t.status, at: t.at, fromBuyer: false, title: "Order completed", body: `Your order from ${shop} is complete. Thanks for shopping local!` });
        break;
      case "REJECTED":
        push({ id, kind: t.status, at: t.at, fromBuyer: false, title: "Order rejected", body: `${shop} couldn't take your order.${reason}` });
        break;
      case "CANCELLED": {
        const expired = order.paymentStatus === "expired" && t.reason === "Payment not completed in time";
        push({
          id,
          kind: t.status,
          at: t.at,
          fromBuyer: t.by === "buyer" && !expired,
          title: "Order cancelled",
          body: expired
            ? `Your order from ${shop} was cancelled because the payment wasn't completed in 15 minutes. Any reserved items were released.`
            : t.by === "buyer"
              ? `You cancelled your order from ${shop}.${reason}`
              : `${shop} cancelled your order.${reason}`,
        });
        break;
      }
    }
  }

  if (order.paymentMethod === "online" && order.paidAt) {
    push({
      id: `${order.id}:paid`,
      kind: "PAID",
      at: order.paidAt,
      fromBuyer: false,
      title: "Payment successful",
      body: `${formatPaise(order.itemTotal)} paid${order.paymentDetail ? ` via ${order.paymentDetail}` : ""} for your order from ${shop}.`,
    });
  }
  if (order.paymentStatus === "refunded") {
    push({
      id: `${order.id}:refunded`,
      kind: "REFUNDED",
      at: order.updatedAt,
      fromBuyer: false,
      title: "Refund issued",
      body: `${formatPaise(order.itemTotal)} is being refunded to your original payment method for your order from ${shop}. It usually reaches you in 5–7 working days.`,
    });
  } else if (order.paymentStatus === "refund_pending" || order.paymentStatus === "refund_failed") {
    push({
      id: `${order.id}:refund-pending`,
      kind: "REFUND_PENDING",
      at: order.updatedAt,
      fromBuyer: false,
      title: "Refund in progress",
      body: `We're refunding ${formatPaise(order.itemTotal)} for your order from ${shop}.`,
    });
  }
  return out;
}

/** All messages across orders, newest first. */
export function buildMessages(orders: OrderDoc[]): BuyerMessage[] {
  return orders.flatMap(messagesForOrder).sort((a, b) => b.at - a.at);
}

export function isUnread(message: BuyerMessage, readAt: number): boolean {
  return !message.fromBuyer && message.at > readAt;
}

// --- Chat: each order is one conversation between its buyer and the shop,
// with the order's alerts shown in line as status cards. ---

export type Viewer = "buyer" | "shop";

export type ThreadItem =
  | { type: "alert"; id: string; at: number; alert: BuyerMessage }
  | { type: "chat"; id: string; at: number; chat: OrderChatMessage };

/** An order's alerts and chat messages, oldest first (chat order). */
export function buildThread(order: OrderDoc, chats: OrderChatMessage[]): ThreadItem[] {
  const alerts: ThreadItem[] = messagesForOrder(order).map((alert) => ({ type: "alert", id: alert.id, at: alert.at, alert }));
  const messages: ThreadItem[] = chats.map((chat) => ({ type: "chat", id: chat.id, at: chat.createdAt, chat }));
  return [...alerts, ...messages].sort((a, b) => a.at - b.at || (a.type === "alert" ? -1 : 1));
}

/** Whether a thread item is news to this viewer since they last read the conversation. */
export function isUnreadFor(item: ThreadItem, viewer: Viewer, readAt: number): boolean {
  if (item.at <= readAt) return false;
  if (item.type === "chat") return item.chat.sender !== viewer;
  // Order alerts are the buyer's notifications; the shop caused them.
  return viewer === "buyer" && !item.alert.fromBuyer;
}

export interface Conversation {
  orderId: string;
  shopName: string;
  buyerName: string;
  status: OrderStatus;
  lastText: string;
  lastFrom: "buyer" | "shop" | "update";
  lastAt: number;
  unread: number;
}

export function buildConversation(order: OrderDoc, chats: OrderChatMessage[], viewer: Viewer): Conversation {
  const thread = buildThread(order, chats);
  const last = thread.at(-1);
  const readAt = (viewer === "buyer" ? order.buyerReadAt : order.shopReadAt) ?? 0;
  return {
    orderId: order.id,
    shopName: order.shopName,
    buyerName: order.buyerName,
    status: order.status,
    lastText: !last ? "" : last.type === "chat" ? last.chat.body : last.alert.title,
    lastFrom: !last ? "update" : last.type === "chat" ? last.chat.sender : "update",
    lastAt: last?.at ?? order.createdAt,
    unread: thread.filter((item) => isUnreadFor(item, viewer, readAt)).length,
  };
}
