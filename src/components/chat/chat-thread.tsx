"use client";

import { Fragment, useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { format, isToday, isYesterday } from "date-fns";
import { toast } from "sonner";
import {
  Ban,
  BadgeCheck,
  ChefHat,
  CircleCheck,
  CircleX,
  CreditCard,
  Loader2,
  PackageCheck,
  SendHorizontal,
  ShoppingBag,
  Undo2,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { getConversation, markConversationRead, sendOrderMessage, type ConversationView } from "@/actions/messages";
import { useChatSignals, useOrderSignals } from "@/lib/hooks/use-order-signals";
import { MESSAGES_READ_EVENT } from "@/lib/hooks/use-unread-messages";
import { isUnreadFor, type MessageKind, type ThreadItem } from "@/lib/messages";
import { cn } from "@/lib/utils";

const ALERT_ICON: Record<MessageKind, LucideIcon> = {
  PLACED: ShoppingBag,
  ACCEPTED: CircleCheck,
  PREPARING: ChefHat,
  READY: PackageCheck,
  COMPLETED: BadgeCheck,
  REJECTED: CircleX,
  CANCELLED: Ban,
  PAID: CreditCard,
  REFUNDED: Undo2,
  REFUND_PENDING: Undo2,
};

function dayLabel(ms: number): string {
  const d = new Date(ms);
  if (isToday(d)) return "Today";
  if (isYesterday(d)) return "Yesterday";
  return format(d, "d MMM yyyy");
}

/**
 * One order's conversation between its buyer and the shop: the order's
 * alerts as small status cards, chat messages as bubbles, and a reply box.
 * Used on the buyer's /messages/[orderId] page and in the shop dashboard's
 * chat dialog; `initial.viewer` says which side is "me".
 */
export function ChatThread({ initial, className }: { initial: ConversationView; className?: string }) {
  const [view, setView] = useState(initial);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const scroller = useRef<HTMLDivElement>(null);
  const me = view.viewer;
  const other = me === "buyer" ? view.shopName : view.buyerName || "Buyer";
  // Unread highlights are worked out against the marker from before this visit.
  const [readAt] = useState(initial.readAt);

  const markRead = useCallback(() => {
    void markConversationRead(view.orderId).then(() => window.dispatchEvent(new Event(MESSAGES_READ_EVENT)));
  }, [view.orderId]);

  useEffect(() => {
    markRead();
  }, [markRead]);

  const refresh = useCallback(async () => {
    const fresh = await getConversation(view.orderId).catch(() => null);
    if (fresh) {
      setView(fresh);
      markRead();
    }
  }, [view.orderId, markRead]);

  useChatSignals(`order:${view.orderId}`, () => void refresh());
  useOrderSignals(`order:${view.orderId}`, () => void refresh());

  // Stay pinned to the newest message.
  useLayoutEffect(() => {
    const el = scroller.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [view.items.length]);

  async function send() {
    const body = draft.trim();
    if (!body || sending) return;
    setSending(true);
    const result = await sendOrderMessage(view.orderId, body);
    setSending(false);
    if (!result.ok || !result.data) {
      toast.error(result.error ?? "Could not send");
      return;
    }
    const chat = result.data.message;
    setDraft("");
    setView((v) =>
      v.items.some((i) => i.id === chat.id)
        ? v
        : { ...v, items: [...v.items, { type: "chat", id: chat.id, at: chat.createdAt, chat }] },
    );
  }

  const firstUnread = view.items.find((item) => isUnreadFor(item, me, readAt))?.id;
  let lastDay = "";

  return (
    <div className={cn("flex min-h-0 flex-col", className)}>
      <div ref={scroller} className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-1 py-3">
        {view.items.length === 0 && (
          <p className="text-muted-foreground py-10 text-center text-sm">No messages yet. Say hello!</p>
        )}
        {view.items.map((item: ThreadItem) => {
          const day = dayLabel(item.at);
          const showDay = day !== lastDay;
          lastDay = day;
          return (
            <Fragment key={item.id}>
              {showDay && (
                <p className="text-muted-foreground my-1 self-center rounded-full bg-muted px-3 py-0.5 text-[11px]">{day}</p>
              )}
              {item.id === firstUnread && (
                <p className="text-primary-ink my-1 flex items-center gap-2 text-[11px] font-semibold before:h-px before:flex-1 before:bg-current/30 after:h-px after:flex-1 after:bg-current/30">
                  New
                </p>
              )}
              {item.type === "alert" ? (
                <AlertCard item={item} viewer={me} />
              ) : (
                <Bubble mine={item.chat.sender === me} body={item.chat.body} at={item.at} />
              )}
            </Fragment>
          );
        })}
      </div>

      <form
        className="flex items-end gap-2 border-t pt-3"
        onSubmit={(e) => {
          e.preventDefault();
          void send();
        }}
      >
        <Textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void send();
            }
          }}
          rows={1}
          maxLength={1000}
          placeholder={`Message ${other}…`}
          className="max-h-32 min-h-11 flex-1 resize-none"
          aria-label="Type a message"
        />
        <Button type="submit" size="icon" className="size-11 shrink-0" disabled={sending || !draft.trim()} aria-label="Send">
          {sending ? <Loader2 className="size-4 animate-spin" /> : <SendHorizontal className="size-4" />}
        </Button>
      </form>
    </div>
  );
}

function AlertCard({ item, viewer }: { item: Extract<ThreadItem, { type: "alert" }>; viewer: "buyer" | "shop" }) {
  const Icon = ALERT_ICON[item.alert.kind];
  return (
    <div className="bg-muted/60 mx-auto flex max-w-[85%] items-start gap-2 rounded-xl px-3 py-2 text-xs">
      <Icon className="text-muted-foreground mt-0.5 size-3.5 shrink-0" />
      <div>
        <p className="font-semibold">{item.alert.title}</p>
        {/* Alert text is written to the buyer ("your order"); the shop sees just the event. */}
        {viewer === "buyer" && <p className="text-muted-foreground">{item.alert.body}</p>}
        <p className="text-muted-foreground mt-0.5 text-[10px]">{format(new Date(item.at), "h:mm a")}</p>
      </div>
    </div>
  );
}

function Bubble({ mine, body, at }: { mine: boolean; body: string; at: number }) {
  return (
    <div className={cn("flex", mine ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[80%] rounded-2xl px-3 py-2 text-sm whitespace-pre-wrap break-words",
          mine ? "bg-primary text-primary-foreground rounded-br-sm" : "bg-card rounded-bl-sm border",
        )}
      >
        {body}
        <span className={cn("mt-0.5 block text-right text-[10px]", mine ? "opacity-75" : "text-muted-foreground")}>
          {format(new Date(at), "h:mm a")}
        </span>
      </div>
    </div>
  );
}
