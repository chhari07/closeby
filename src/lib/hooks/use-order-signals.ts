"use client";

import { useEffect, useRef } from "react";
import { isSupabaseConfigured, supabaseBrowser } from "@/lib/supabase/browser";
import type { OrderStatus } from "@/types";

/** What the database trigger broadcasts on every order insert/update — ids and status only. */
export interface OrderSignal {
  id: string;
  status: OrderStatus;
  op: "INSERT" | "UPDATE";
  previousStatus: OrderStatus | null;
}

/**
 * Subscribes to one live order topic (see notify_order_change in
 * supabase/migrations/0001_init.sql): "shop-orders:<shopId>",
 * "buyer-orders:<userId>" or "order:<orderId>". The signal only says
 * *that* an order changed; callers re-read it through a server action, which
 * checks the caller may see it — so a forged signal can't show anyone data.
 * Pass null to stay unsubscribed.
 */
export function useOrderSignals(topic: string | null, onSignal: (signal: OrderSignal) => void): void {
  const handler = useRef(onSignal);
  useEffect(() => {
    handler.current = onSignal;
  });

  useEffect(() => {
    if (!topic || !isSupabaseConfigured) return;
    const channel = supabaseBrowser()
      .channel(topic)
      .on("broadcast", { event: "order" }, ({ payload }) => {
        if (payload && typeof payload.id === "string") handler.current(payload as OrderSignal);
      })
      .subscribe();
    return () => {
      void supabaseBrowser().removeChannel(channel);
    };
  }, [topic]);
}
