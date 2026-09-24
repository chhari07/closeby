"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "@clerk/nextjs";
import { format, formatDistanceToNow, isToday, isYesterday } from "date-fns";
import {
  Ban,
  BadgeCheck,
  Bell,
  ChefHat,
  CircleCheck,
  CircleX,
  CreditCard,
  PackageCheck,
  ShoppingBag,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import { listMyMessages, markMessagesRead, type MessagesPage } from "@/actions/messages";
import { useOrderSignals } from "@/lib/hooks/use-order-signals";
import { MESSAGES_READ_EVENT } from "@/lib/hooks/use-unread-messages";
import { cn } from "@/lib/utils";
import type { MessageKind } from "@/lib/messages";

const KIND_STYLE: Record<MessageKind, { icon: LucideIcon; tone: string }> = {
  PLACED: { icon: ShoppingBag, tone: "bg-muted text-foreground" },
  ACCEPTED: { icon: CircleCheck, tone: "bg-status-progress/15 text-status-progress" },
  PREPARING: { icon: ChefHat, tone: "bg-status-progress/15 text-status-progress" },
  READY: { icon: PackageCheck, tone: "bg-status-ready/15 text-status-ready" },
  COMPLETED: { icon: BadgeCheck, tone: "bg-status-ready/15 text-status-ready" },
  REJECTED: { icon: CircleX, tone: "bg-status-stopped/15 text-status-stopped" },
  CANCELLED: { icon: Ban, tone: "bg-status-stopped/15 text-status-stopped" },
  PAID: { icon: CreditCard, tone: "bg-status-ready/15 text-status-ready" },
  REFUNDED: { icon: Undo2, tone: "bg-amber-500/15 text-amber-600" },
  REFUND_PENDING: { icon: Undo2, tone: "bg-amber-500/15 text-amber-600" },
};

function dayLabel(ms: number): string {
  const d = new Date(ms);
  if (isToday(d)) return "Today";
  if (isYesterday(d)) return "Yesterday";
  return format(d, "d MMM yyyy");
}

export function MessagesList({ initial }: { initial: MessagesPage }) {
  const { userId } = useAuth();
  const [page, setPage] = useState(initial);

  // Opening the tab reads everything; the highlights stay for this visit so
  // the buyer can still see what was new.
  useEffect(() => {
    void markMessagesRead().then(() => window.dispatchEvent(new Event(MESSAGES_READ_EVENT)));
  }, []);

  // New alerts land here live, already marked as new.
  useOrderSignals(userId ? `buyer-orders:${userId}` : null, async () => {
    const fresh = await listMyMessages().catch(() => null);
    if (!fresh) return;
    // Keep this visit's highlights on top of whatever is newly unread.
    setPage((prev) => {
      const wasNew = new Set(prev.messages.filter((m) => m.unread).map((m) => m.id));
      return { ...fresh, messages: fresh.messages.map((m) => ({ ...m, unread: m.unread || wasNew.has(m.id) })) };
    });
    void markMessagesRead().then(() => window.dispatchEvent(new Event(MESSAGES_READ_EVENT)));
  });

  if (page.messages.length === 0) {
    return (
      <div className="text-muted-foreground flex flex-col items-center gap-2 py-16 text-center text-sm">
        <Bell className="size-8" />
        <p>No messages yet. Updates about your orders will show up here.</p>
        <Link href="/shops" className="text-primary-ink underline">
          Browse nearby shops
        </Link>
      </div>
    );
  }

  let lastDay = "";
  return (
    <ol className="flex flex-col gap-2">
      {page.messages.map((m) => {
        const day = dayLabel(m.at);
        const header = day !== lastDay ? day : null;
        lastDay = day;
        const { icon: Icon, tone } = KIND_STYLE[m.kind];
        return (
          <li key={m.id}>
            {header && <p className="text-muted-foreground mt-3 mb-1 text-xs font-semibold first:mt-0">{header}</p>}
            <Link
              href={`/orders/${m.orderId}`}
              className={cn(
                "hover:bg-accent flex gap-3 rounded-xl border p-3 transition-colors",
                m.unread && "border-primary/40 bg-primary/5",
              )}
            >
              <span className={cn("flex size-9 shrink-0 items-center justify-center rounded-full", tone)}>
                <Icon className="size-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-sm font-semibold">{m.title}</span>
                  <span className="text-muted-foreground shrink-0 text-[11px]" title={format(new Date(m.at), "d MMM yyyy, h:mm a")}>
                    {formatDistanceToNow(new Date(m.at), { addSuffix: true })}
                  </span>
                </span>
                <span className="text-muted-foreground mt-0.5 block text-sm">{m.body}</span>
                <span className="text-muted-foreground mt-1 block text-[11px]">
                  {m.shopName} · Order #{m.orderId.slice(0, 8).toUpperCase()}
                </span>
              </span>
              {m.unread && <span className="bg-primary mt-1.5 size-2 shrink-0 rounded-full" aria-label="New" />}
            </Link>
          </li>
        );
      })}
    </ol>
  );
}
