"use client";

import { useEffect, useRef, useState } from "react";
import { collection, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { Bell } from "lucide-react";
import { getDb } from "@/lib/firebase/client";
import { useShop } from "@/components/dashboard/shop-context";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { OrderCard } from "./order-card";
import { OrdersSkeleton } from "./orders-skeleton";
import { playNewOrderPing } from "@/lib/audio/ping";
import type { OrderDoc } from "@/types";

const ACTIVE_STATUSES = new Set(["ACCEPTED", "PREPARING", "READY"]);
const DONE_STATUSES = new Set(["COMPLETED", "REJECTED", "CANCELLED"]);

export default function DashboardOrdersPage() {
  const { shop } = useShop();
  const [orders, setOrders] = useState<OrderDoc[] | null>(null);
  const prevNewCount = useRef<number | null>(null);

  useEffect(() => {
    const q = query(collection(getDb(), "orders"), where("shopId", "==", shop.id), orderBy("createdAt", "desc"));
    const unsub = onSnapshot(q, (snap) => {
      const list = snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<OrderDoc, "id">) }));
      setOrders(list);
      const newCount = list.filter((o) => o.status === "PLACED").length;
      if (prevNewCount.current !== null && newCount > prevNewCount.current) {
        playNewOrderPing();
      }
      prevNewCount.current = newCount;
    });
    return unsub;
  }, [shop.id]);

  if (!orders) return <OrdersSkeleton />;

  const newOrders = orders.filter((o) => o.status === "PLACED");
  const activeOrders = orders.filter((o) => ACTIVE_STATUSES.has(o.status));
  const doneOrders = orders.filter((o) => DONE_STATUSES.has(o.status));

  return (
    <div className="mx-auto max-w-2xl p-4 sm:p-6">
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
          </TabsTrigger>
          <TabsTrigger value="done" className="flex-1">
            Completed
          </TabsTrigger>
        </TabsList>

        <TabsContent value="new" className="flex flex-col gap-3 pt-3">
          {newOrders.length === 0 ? (
            <EmptyTab icon={<Bell className="size-6" />} label="No new orders right now." />
          ) : (
            newOrders.map((o) => <OrderCard key={o.id} order={o} />)
          )}
        </TabsContent>
        <TabsContent value="active" className="flex flex-col gap-3 pt-3">
          {activeOrders.length === 0 ? (
            <EmptyTab label="No orders in progress." />
          ) : (
            activeOrders.map((o) => <OrderCard key={o.id} order={o} />)
          )}
        </TabsContent>
        <TabsContent value="done" className="flex flex-col gap-3 pt-3">
          {doneOrders.length === 0 ? (
            <EmptyTab label="No completed orders yet." />
          ) : (
            doneOrders.map((o) => <OrderCard key={o.id} order={o} />)
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
