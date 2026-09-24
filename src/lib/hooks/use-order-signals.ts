"use client";

import { useEffect, useRef } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabaseBrowser } from "@/lib/supabase/browser";
import type { OrderStatus, PaymentStatus } from "@/types";

/** What the database trigger broadcasts on every order insert/update — ids and status only. */
export interface OrderSignal {
  id: string;
  status: OrderStatus;
  op: "INSERT" | "UPDATE";
  previousStatus: OrderStatus | null;
  paymentStatus?: PaymentStatus;
  previousPaymentStatus?: PaymentStatus | null;
}

/** Broadcast when a chat message is sent on an order (notify_order_message). */
export interface ChatSignal {
  orderId: string;
  messageId: string;
  sender: "buyer" | "shop";
}

type Listener = { event: "order" | "message"; handle: (payload: Record<string, unknown>) => void };

/**
 * One Supabase channel per topic, shared by every component listening to
 * it. The Supabase client hands back the SAME channel for a repeated topic,
 * so if each component removed "its" channel on unmount it would cut off
 * everyone else on that topic (e.g. leaving the orders page silencing the
 * dashboard's new-order alert). Reference-counted instead.
 */
const shared = new Map<
  string,
  { channel: RealtimeChannel; listeners: Set<Listener>; closeTimer?: ReturnType<typeof setTimeout> }
>();

/** Kept open briefly after the last listener leaves, so a page change doesn't drop and rejoin it. */
const CLOSE_GRACE_MS = 3000;

function subscribe(topic: string, listener: Listener): () => void {
  let entry = shared.get(topic);
  if (entry?.closeTimer) {
    clearTimeout(entry.closeTimer);
    entry.closeTimer = undefined;
  }
  if (!entry) {
    const listeners = new Set<Listener>();
    const dispatch = (event: Listener["event"]) => ({ payload }: { payload: Record<string, unknown> }) => {
      if (!payload) return;
      for (const l of listeners) if (l.event === event) l.handle(payload);
    };
    const channel = supabaseBrowser()
      .channel(topic)
      .on("broadcast", { event: "order" }, dispatch("order"))
      .on("broadcast", { event: "message" }, dispatch("message"))
      .subscribe();
    entry = { channel, listeners };
    shared.set(topic, entry);
  }
  entry.listeners.add(listener);
  return () => {
    const current = shared.get(topic);
    if (!current) return;
    current.listeners.delete(listener);
    if (current.listeners.size === 0 && !current.closeTimer) {
      current.closeTimer = setTimeout(() => {
        if (current.listeners.size > 0) return;
        shared.delete(topic);
        void supabaseBrowser().removeChannel(current.channel);
      }, CLOSE_GRACE_MS);
    }
  };
}

function useBroadcast<T>(
  topic: string | null,
  event: Listener["event"],
  isValid: (payload: Record<string, unknown>) => boolean,
  onSignal: (signal: T) => void,
): void {
  const handler = useRef(onSignal);
  useEffect(() => {
    handler.current = onSignal;
  });

  useEffect(() => {
    if (!topic || !isSupabaseConfigured) return;
    return subscribe(topic, {
      event,
      handle: (payload) => {
        if (isValid(payload)) handler.current(payload as T);
      },
    });
    // isValid is a module-level constant at every call site.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [topic, event]);
}

const isOrderSignal = (p: Record<string, unknown>) => typeof p.id === "string";
const isChatSignal = (p: Record<string, unknown>) => typeof p.orderId === "string";

/**
 * Subscribes to one live order topic (see notify_order_change in
 * supabase/migrations): "shop-orders:<shopId>", "buyer-orders:<userId>" or
 * "order:<orderId>". The signal only says *that* an order changed; callers
 * re-read it through a server action, which checks the caller may see it —
 * so a forged signal can't show anyone data. Pass null to stay unsubscribed.
 */
export function useOrderSignals(topic: string | null, onSignal: (signal: OrderSignal) => void): void {
  useBroadcast(topic, "order", isOrderSignal, onSignal);
}

/** Same topics, for new chat messages (re-read via src/actions/messages.ts). */
export function useChatSignals(topic: string | null, onSignal: (signal: ChatSignal) => void): void {
  useBroadcast(topic, "message", isChatSignal, onSignal);
}
