"use client";

import { useEffect, useState } from "react";
import { Bell } from "lucide-react";
import { collection, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { listShopOrders } from "@/actions/orders";
import { getDb } from "@/lib/firebase/client";
import { useFirebaseReady } from "@/lib/hooks/use-firebase-ready";
import { useShop } from "@/components/dashboard/shop-context";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Button } from "@/components/ui/button";
import { OrderCard } from "./order-card";
import { OrdersSkeleton } from "./orders-skeleton";
import type { OrderDoc } from "@/types";

const ACTIVE_STATUSES = new Set(["ACCEPTED", "PREPARING", "READY"]);

export default function DashboardOrdersPage() {
  const { shop } = useShop();
  const firebaseReady = useFirebaseReady();
  const [orders, setOrders] = useState<OrderDoc[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  // Live Firestore listener instead of polling: new orders (and status
  // changes made from another device) show up the instant they're written,
  // and it keeps working while the tab is in the background — a fixed poll
  // interval can't do either. The new-order sound/toast/notification live in
  // <OrderAlerts>, mounted once for the whole dashboard, not here.
  useEffect(() => {
    if (!firebaseReady) return;
    // Step 1.2: bounded even as a live listener — the 200 most recent orders
    // is far more than any working queue needs; older history is on the
    // buyer's own order page and doesn't need to live-update here.
    const q = query(
      collection(getDb(), "orders"),
      where("shopId", "==", shop.id),
      orderBy("createdAt", "desc"),
      limit(200),
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setLoadError(null);
        setOrders(snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<OrderDoc, "id">) })));
      },
      (err) => {
        console.error("Orders listener failed", err);
        setLoadError((prev) => prev ?? "Could not load orders");
      },
    );
    return unsub;
  }, [shop.id, firebaseReady]);

  // One-off fallback fetch: covers the (rare) case where Firebase client
  // auth never comes up, so the page isn't stuck on a skeleton forever.
  useEffect(() => {
    if (firebaseReady) return;
    const timer = setTimeout(async () => {
      if (orders !== null) return;
      const result = await listShopOrders(shop.id);
      if (result.ok && result.data) {
        setLoadError(null);
        setOrders(result.data.orders);
      } else {
        setLoadError(result.error ?? "Could not load orders");
      }
    }, 4000);
    return () => clearTimeout(timer);
  }, [firebaseReady, orders, shop.id]);

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
              <OrderCard key={o.id} order={o} />
            ))
          )}
        </TabsContent>
        <TabsContent value="active" className="flex flex-col gap-3 pt-3">
          {activeOrders.length === 0 ? (
            <EmptyTab label="No orders in progress." />
          ) : (
            activeOrders.map((o) => (
              <OrderCard key={o.id} order={o} />
            ))
          )}
        </TabsContent>
        <TabsContent value="done" className="flex flex-col gap-3 pt-3">
          {completedOrders.length === 0 ? (
            <EmptyTab label="No completed orders yet." />
          ) : (
            completedOrders.map((o) => (
              <OrderCard key={o.id} order={o} />
            ))
          )}
        </TabsContent>
        <TabsContent value="closed" className="flex flex-col gap-3 pt-3">
          {closedOrders.length === 0 ? (
            <EmptyTab label="No rejected or cancelled orders." />
          ) : (
            closedOrders.map((o) => (
              <OrderCard key={o.id} order={o} />
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
