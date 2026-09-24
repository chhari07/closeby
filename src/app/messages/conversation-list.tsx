"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { format, isToday, isYesterday } from "date-fns";
import { MessageSquare } from "lucide-react";
import { listMyConversations, type Inbox } from "@/actions/messages";
import { useChatSignals, useOrderSignals } from "@/lib/hooks/use-order-signals";
import { MESSAGES_READ_EVENT } from "@/lib/hooks/use-unread-messages";
import { OrderStatusBadge } from "@/components/orders/order-status-badge";
import { cn } from "@/lib/utils";

function when(ms: number): string {
  const d = new Date(ms);
  if (isToday(d)) return format(d, "h:mm a");
  if (isYesterday(d)) return "Yesterday";
  return format(d, "d MMM");
}

/** The buyer's inbox: one conversation per order, most recent activity first. */
export function ConversationList({ initial }: { initial: Inbox }) {
  const { userId } = useAuth();
  const [inbox, setInbox] = useState(initial);

  const refresh = useCallback(() => {
    void listMyConversations()
      .then(setInbox)
      .catch(() => {});
  }, []);

  // Live: new alerts and replies re-sort the list and bump unread counts.
  useOrderSignals(userId ? `buyer-orders:${userId}` : null, refresh);
  useChatSignals(userId ? `buyer-orders:${userId}` : null, refresh);
  useEffect(() => {
    window.addEventListener(MESSAGES_READ_EVENT, refresh);
    return () => window.removeEventListener(MESSAGES_READ_EVENT, refresh);
  }, [refresh]);

  if (inbox.conversations.length === 0) {
    return (
      <div className="text-muted-foreground flex flex-col items-center gap-2 py-16 text-center text-sm">
        <MessageSquare className="size-8" />
        <p>No messages yet. Order updates and chats with shops will show up here.</p>
        <Link href="/shops" className="text-primary-ink underline">
          Browse nearby shops
        </Link>
      </div>
    );
  }

  return (
    <ul className="flex flex-col gap-2">
      {inbox.conversations.map((c) => (
        <li key={c.orderId}>
          <Link
            href={`/messages/${c.orderId}`}
            className={cn(
              "hover:bg-accent flex items-center gap-3 rounded-xl border p-3 transition-colors",
              c.unread > 0 && "border-primary/40 bg-primary/5",
            )}
          >
            <span className="bg-primary/15 text-primary-ink flex size-11 shrink-0 items-center justify-center rounded-full text-base font-bold">
              {c.shopName.trim().charAt(0).toUpperCase() || "S"}
            </span>
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between gap-2">
                <span className="truncate font-semibold">{c.shopName}</span>
                <span className={cn("shrink-0 text-[11px]", c.unread > 0 ? "text-primary-ink font-semibold" : "text-muted-foreground")}>
                  {when(c.lastAt)}
                </span>
              </span>
              <span className="mt-0.5 flex items-center justify-between gap-2">
                <span className={cn("truncate text-sm", c.unread > 0 ? "text-foreground font-medium" : "text-muted-foreground")}>
                  {c.lastFrom === "buyer" ? "You: " : ""}
                  {c.lastText}
                </span>
                {c.unread > 0 && (
                  <span className="bg-primary text-primary-foreground flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full px-1.5 text-[11px] font-semibold">
                    {c.unread}
                  </span>
                )}
              </span>
              <span className="mt-1 flex items-center gap-2 text-[11px]">
                <OrderStatusBadge status={c.status} />
                <span className="text-muted-foreground">Order #{c.orderId.slice(0, 8).toUpperCase()}</span>
              </span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}
