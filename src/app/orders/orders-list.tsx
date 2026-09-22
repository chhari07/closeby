"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Loader2 } from "lucide-react";
import { listMyOrders } from "@/actions/orders";
import { OrderStatusBadge } from "@/components/orders/order-status-badge";
import { Button } from "@/components/ui/button";
import { formatPaise } from "@/lib/money";
import type { OrderDoc } from "@/types";

/** Renders the first page (from the server) and loads more on demand —
 * Step 1.2's cursor pagination, with a "Load more" button. */
export function OrdersList({
  initialOrders,
  initialCursor,
}: {
  initialOrders: OrderDoc[];
  initialCursor: number | null;
}) {
  const [orders, setOrders] = useState(initialOrders);
  const [cursor, setCursor] = useState(initialCursor);
  const [pending, startTransition] = useTransition();

  function loadMore() {
    startTransition(async () => {
      if (cursor === null) return;
      const page = await listMyOrders(cursor);
      setOrders((prev) => [...prev, ...page.orders]);
      setCursor(page.nextCursor);
    });
  }

  return (
    <div className="flex flex-col gap-2">
      {orders.map((order) => (
        <Link
          key={order.id}
          href={`/orders/${order.id}`}
          className="flex items-center justify-between gap-3 rounded-xl border p-3 hover:bg-accent/50"
        >
          <div className="min-w-0">
            <p className="truncate font-medium">{order.shopName}</p>
            <p className="text-muted-foreground text-xs">
              #{order.id.slice(0, 8).toUpperCase()} ·{" "}
              {new Date(order.createdAt).toLocaleDateString("en-IN", {
                day: "numeric",
                month: "short",
              })}{" "}
              · {order.items.length} item{order.items.length > 1 ? "s" : ""}{" "}
              · {formatPaise(order.itemTotal)}
            </p>
          </div>
          <OrderStatusBadge status={order.status} />
        </Link>
      ))}
      {cursor !== null && (
        <Button
          variant="outline"
          className="mt-2 min-h-11"
          disabled={pending}
          onClick={loadMore}
        >
          {pending ? <Loader2 className="size-4 animate-spin" /> : "Load more"}
        </Button>
      )}
    </div>
  );
}
