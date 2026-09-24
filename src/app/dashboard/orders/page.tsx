"use client";

import { useCallback, useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { listShopOrders } from "@/actions/orders";
import { listShopChatUnread } from "@/actions/messages";
import { useChatSignals, useOrderSignals } from "@/lib/hooks/use-order-signals";
import { useShop } from "@/components/dashboard/shop-context";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { OrderCard } from "./order-card";
import { MESSAGES_READ_EVENT } from "@/lib/hooks/use-unread-messages";
import { OrdersSkeleton } from "./orders-skeleton";
import type { OrderDoc } from "@/types";

const ACTIVE_STATUSES = new Set(["ACCEPTED", "PREPARING", "READY"]);

/** Step 1.2: bounded even as a live list — the 200 most recent orders is far
 *  more than any working queue needs. */
const LIVE_ORDER_LIMIT = 200;

export default function DashboardOrdersPage() {
  const { shop } = useShop();
  const [orders, setOrders] = useState<OrderDoc[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const result = await listShopOrders(shop.id, undefined, LIVE_ORDER_LIMIT);
    if (result.ok && result.data) {
      setLoadError(null);
      setOrders(result.data.orders);
    } else {
      setLoadError((prev) => prev ?? result.error ?? "Could not load orders");
    }
  }, [shop.id]);

  useEffect(() => {
    void load();
  }, [load]);

  // Live instead of polling: every order insert/update sends a signal (see
  // src/lib/hooks/use-order-signals.ts), so new orders and status changes
  // made from another device show up the instant they're written. The
  // new-order sound/toast/notification live in <OrderAlerts>, mounted once
  // for the whole dashboard, not here.
  useOrderSignals(`shop-orders:${shop.id}`, () => void load());

  // Unread buyer messages per order, for the Chat badges on each card.
  const [chatUnread, setChatUnread] = useState<Record<string, number>>({});
  const loadChatUnread = useCallback(() => {
    void listShopChatUnread(shop.id)
      .then(setChatUnread)
      .catch(() => {});
  }, [shop.id]);
  useEffect(() => {
    loadChatUnread();
    window.addEventListener(MESSAGES_READ_EVENT, loadChatUnread);
    return () => window.removeEventListener(MESSAGES_READ_EVENT, loadChatUnread);
  }, [loadChatUnread]);
  useChatSignals(`shop-orders:${shop.id}`, loadChatUnread);

  if (!orders && loadError) {
    return (
      <div className="text-muted-foreground flex flex-col items-center gap-3 p-10 text-center text-sm">
        <p>{loadError}</p>
        <Button variant="outline" onClick={() => window.location.reload()}>
          Try again
        </Button>
      </div>
    );
  }
  if (!orders) return <OrdersSkeleton />;

  // Work queue is oldest-first (serve in the order they came in); history is newest-first.
  const newOrders = orders.filter((o) => o.status === "PLACED").reverse();
  const activeOrders = orders
    .filter((o) => ACTIVE_STATUSES.has(o.status))
    .reverse();
  const completedOrders = orders.filter((o) => o.status === "COMPLETED");
  const closedOrders = orders.filter(
    (o) => o.status === "REJECTED" || o.status === "CANCELLED",
  );

  return (
    <div className="mx-auto max-w-5xl p-4 sm:p-6">
      <h1 className="mb-4 text-xl font-bold">Orders</h1>

      <Tabs defaultValue="new">
        <TabsList className="w-full">
          <TabsTrigger value="new" className="relative flex-1">
            New
            {newOrders.length > 0 && (
              <span className="bg-destructive text-destructive-foreground ml-1.5 inline-flex size-4 items-center justify-center rounded-full text-[10px]">
                {newOrders.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="active" className="flex-1">
            Active
            {activeOrders.length > 0 && (
              <span className="bg-muted text-muted-foreground ml-1.5 inline-flex min-w-4 items-center justify-center rounded-full px-1 text-[10px]">
                {activeOrders.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="done" className="flex-1">
            Completed
          </TabsTrigger>
          <TabsTrigger value="closed" className="flex-1">
            Cancelled
          </TabsTrigger>
        </TabsList>

        <TabsContent value="new" className="flex flex-col gap-3 pt-3">
          {newOrders.length === 0 ? (
            <EmptyTab
              icon={<Bell className="size-6" />}
              label="No new orders right now."
            />
          ) : (
            newOrders.map((o) => (
              <OrderCard key={o.id} order={o} unreadChat={chatUnread[o.id] ?? 0} />
            ))
          )}
        </TabsContent>
        <TabsContent value="active" className="flex flex-col gap-3 pt-3">
          {activeOrders.length === 0 ? (
            <EmptyTab label="No orders in progress." />
          ) : (
            activeOrders.map((o) => (
              <OrderCard key={o.id} order={o} unreadChat={chatUnread[o.id] ?? 0} />
            ))
          )}
        </TabsContent>
        <TabsContent value="done" className="flex flex-col gap-3 pt-3">
          {completedOrders.length === 0 ? (
            <EmptyTab label="No completed orders yet." />
          ) : (
            completedOrders.map((o) => (
              <OrderCard key={o.id} order={o} unreadChat={chatUnread[o.id] ?? 0} />
            ))
          )}
        </TabsContent>
        <TabsContent value="closed" className="flex flex-col gap-3 pt-3">
          {closedOrders.length === 0 ? (
            <EmptyTab label="No rejected or cancelled orders." />
          ) : (
            closedOrders.map((o) => (
              <OrderCard key={o.id} order={o} unreadChat={chatUnread[o.id] ?? 0} />
            ))
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

function EmptyTab({ label, icon }: { label: string; icon?: React.ReactNode }) {
  return (
    <div className="text-muted-foreground flex flex-col items-center gap-2 py-14 text-center text-sm">
      {icon}
      <p>{label}</p>
    </div>
  );
}
