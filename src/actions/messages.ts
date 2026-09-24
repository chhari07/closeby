"use server";

import { auth } from "@clerk/nextjs/server";
import { db } from "@/lib/db/client";
import { toOrder } from "@/lib/db/rows";
import { buildMessages, isUnread, type BuyerMessage } from "@/lib/messages";

/** Messages come from the buyer's most recent orders — plenty for an inbox. */
const MAX_ORDERS = 100;

async function loadMessages(userId: string): Promise<{ messages: BuyerMessage[]; readAt: number }> {
  const [orderRows, [user]] = await Promise.all([
    db()`select * from orders where buyer_id = ${userId} order by created_at desc limit ${MAX_ORDERS}`,
    db()`select messages_read_at from users where id = ${userId}`,
  ]);
  return { messages: buildMessages(orderRows.map(toOrder)), readAt: (user?.messagesReadAt as number | undefined) ?? 0 };
}

export interface MessagesPage {
  messages: (BuyerMessage & { unread: boolean })[];
  unreadCount: number;
}

export async function listMyMessages(): Promise<MessagesPage> {
  const { userId } = await auth();
  if (!userId) return { messages: [], unreadCount: 0 };
  const { messages, readAt } = await loadMessages(userId);
  const withUnread = messages.map((m) => ({ ...m, unread: isUnread(m, readAt) }));
  return { messages: withUnread, unreadCount: withUnread.filter((m) => m.unread).length };
}

export async function getUnreadMessageCount(): Promise<number> {
  const { userId } = await auth();
  if (!userId) return 0;
  const { messages, readAt } = await loadMessages(userId);
  return messages.filter((m) => isUnread(m, readAt)).length;
}

/** Opening the Messages tab marks everything up to now as read. */
export async function markMessagesRead(): Promise<void> {
  const { userId } = await auth();
  if (!userId) return;
  await db()`update users set messages_read_at = ${Date.now()} where id = ${userId}`;
}
