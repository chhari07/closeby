"use server";

import { auth } from "@clerk/nextjs/server";
import { z } from "zod";
import { db } from "@/lib/db/client";
import { findShop, toOrder } from "@/lib/db/rows";
import { rateLimit, rateLimitMessage } from "@/lib/rate-limit";
import { buildConversation, buildThread, type Conversation, type ThreadItem, type Viewer } from "@/lib/messages";
import type { ActionResult } from "./types";
import type { OrderChatMessage, OrderDoc } from "@/types";

/**
 * Messages = one conversation per order between its buyer and the shop:
 * the order's alerts (built from its timeline, src/lib/messages.ts) plus
 * chat messages both sides send here. Every read and write checks the
 * caller is that order's buyer or the shop's owner.
 */

/** The buyer's inbox covers their most recent orders. */
const MAX_ORDERS = 100;

function toChat(row: Record<string, unknown>): OrderChatMessage {
  return row as unknown as OrderChatMessage;
}

async function chatsFor(orderIds: string[]): Promise<Map<string, OrderChatMessage[]>> {
  const byOrder = new Map<string, OrderChatMessage[]>();
  if (orderIds.length === 0) return byOrder;
  const rows = await db()`select * from order_messages where order_id = any(${orderIds}) order by created_at`;
  for (const row of rows) {
    const chat = toChat(row);
    byOrder.set(chat.orderId, [...(byOrder.get(chat.orderId) ?? []), chat]);
  }
  return byOrder;
}

/** Loads an order and works out which side of its conversation the caller is on. */
async function openAs(orderId: string): Promise<{ userId: string; order: OrderDoc; viewer: Viewer } | null> {
  const { userId } = await auth();
  if (!userId) return null;
  const [row] = await db()`select * from orders where id = ${orderId}`;
  if (!row) return null;
  const order = toOrder(row);
  if (order.buyerId === userId) return { userId, order, viewer: "buyer" };
  const shop = await findShop(order.shopId);
  if (shop?.ownerId === userId && order.paymentStatus !== "pending" && order.paymentStatus !== "expired") {
    return { userId, order, viewer: "shop" };
  }
  return null;
}

export interface Inbox {
  conversations: Conversation[];
  unreadCount: number;
}

/** The buyer's Messages tab: every order as a conversation, most recent activity first. */
export async function listMyConversations(): Promise<Inbox> {
  const { userId } = await auth();
  if (!userId) return { conversations: [], unreadCount: 0 };
  const orders = (
    await db()`select * from orders where buyer_id = ${userId} order by created_at desc limit ${MAX_ORDERS}`
  ).map(toOrder);
  const chats = await chatsFor(orders.map((o) => o.id));
  const conversations = orders
    .map((o) => buildConversation(o, chats.get(o.id) ?? [], "buyer"))
    .sort((a, b) => b.lastAt - a.lastAt);
  return { conversations, unreadCount: conversations.reduce((n, c) => n + c.unread, 0) };
}

/** Unread count for the buyer's Messages tab badge. */
export async function getUnreadMessageCount(): Promise<number> {
  return (await listMyConversations()).unreadCount;
}

export interface ConversationView {
  viewer: Viewer;
  orderId: string;
  shopName: string;
  buyerName: string;
  status: OrderDoc["status"];
  items: ThreadItem[];
  /** Read marker from BEFORE this open — the page highlights what's new. */
  readAt: number;
}

export async function getConversation(orderId: string): Promise<ConversationView | null> {
  const opened = await openAs(orderId);
  if (!opened) return null;
  const { order, viewer } = opened;
  const chats = await chatsFor([order.id]);
  return {
    viewer,
    orderId: order.id,
    shopName: order.shopName,
    buyerName: order.buyerName,
    status: order.status,
    items: buildThread(order, chats.get(order.id) ?? []),
    readAt: (viewer === "buyer" ? order.buyerReadAt : order.shopReadAt) ?? 0,
  };
}

const bodySchema = z.string().trim().min(1, "Type a message").max(1000, "Message is too long (max 1000 characters)");

export async function sendOrderMessage(orderId: string, body: string): Promise<ActionResult<{ message: OrderChatMessage }>> {
  const opened = await openAs(orderId);
  if (!opened) return { ok: false, error: "Conversation not found" };
  // An unpaid online order never reached the shop, so there's no one to talk to yet.
  if (opened.order.paymentStatus === "pending" || opened.order.paymentStatus === "expired") {
    return { ok: false, error: "You can message the shop once the order is paid" };
  }
  const limited = rateLimit("chatMessage", opened.userId);
  if (!limited.ok) return { ok: false, error: rateLimitMessage(limited.retryAfterSec) };
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message };

  const now = Date.now();
  const [row] = await db()`
    insert into order_messages (order_id, sender, sender_id, body, created_at)
    values (${orderId}, ${opened.viewer}, ${opened.userId}, ${parsed.data}, ${now})
    returning *
  `;
  // Sending counts as having read everything up to now.
  await (opened.viewer === "buyer"
    ? db()`update orders set buyer_read_at = ${now} where id = ${orderId}`
    : db()`update orders set shop_read_at = ${now} where id = ${orderId}`);
  return { ok: true, data: { message: toChat(row!) } };
}

export async function markConversationRead(orderId: string): Promise<void> {
  const opened = await openAs(orderId);
  if (!opened) return;
  const now = Date.now();
  await (opened.viewer === "buyer"
    ? db()`update orders set buyer_read_at = ${now} where id = ${orderId}`
    : db()`update orders set shop_read_at = ${now} where id = ${orderId}`);
}

/** The shop dashboard: unread buyer messages per order (only orders that have some). */
export async function listShopChatUnread(shopId: string): Promise<Record<string, number>> {
  const { userId } = await auth();
  if (!userId) return {};
  const shop = await findShop(shopId);
  if (shop?.ownerId !== userId) return {};
  const rows = await db()`
    select m.order_id, count(*)::int as unread
    from order_messages m join orders o on o.id = m.order_id
    where o.shop_id = ${shopId} and m.sender = 'buyer' and m.created_at > o.shop_read_at
    group by m.order_id
  `;
  return Object.fromEntries(rows.map((r) => [r.orderId as string, r.unread as number]));
}
