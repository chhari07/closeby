"use client";

import { useCallback, useEffect, useState } from "react";
import { useAuth } from "@clerk/nextjs";
import { getUnreadMessageCount } from "@/actions/messages";
import { useChatSignals, useOrderSignals } from "@/lib/hooks/use-order-signals";

/** Fired by the Messages page once it has marked everything read. */
export const MESSAGES_READ_EVENT = "closeby:messages-read";

/** Live unread count for the buyer's Messages tab badge (0 when disabled). */
export function useUnreadMessages(enabled: boolean): number {
  const { userId } = useAuth();
  const [count, setCount] = useState(0);

  const refresh = useCallback(() => {
    if (!enabled) return;
    void getUnreadMessageCount()
      .then(setCount)
      .catch(() => {});
  }, [enabled]);

  useEffect(() => {
    refresh();
    window.addEventListener(MESSAGES_READ_EVENT, refresh);
    return () => window.removeEventListener(MESSAGES_READ_EVENT, refresh);
  }, [refresh]);

  useOrderSignals(enabled && userId ? `buyer-orders:${userId}` : null, refresh);
  useChatSignals(enabled && userId ? `buyer-orders:${userId}` : null, refresh);

  return enabled ? count : 0;
}
