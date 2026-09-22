"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, RotateCcw } from "lucide-react";
import { listMyOrders, reorderFromOrder } from "@/actions/orders";
import { OrderStatusBadge } from "@/components/orders/order-status-badge";
import { Button } from "@/components/ui/button";
import { formatPaise } from "@/lib/money";
import { useCartStore } from "@/lib/store/cart";
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
  const [reorderingId, setReorderingId] = useState<string | null>(null);
  const router = useRouter();
  const applyDraftItems = useCartStore((s) => s.applyDraftItems);

  function loadMore() {
    startTransition(async () => {
      if (cursor === null) return;
      const page = await listMyOrders(cursor);
      setOrders((prev) => [...prev, ...page.orders]);
      setCursor(page.nextCursor);
    });
  }

  async function reorder(orderId: string) {
    setReorderingId(orderId);
    const result = await reorderFromOrder(orderId);
    setReorderingId(null);
    if (!result.ok || !result.data) {
      toast.error(result.error ?? "Could not reorder — try browsing the shop instead");
      return;
    }
    const { shopId, shopName, items, unavailable } = result.data;
    applyDraftItems(shopId, shopName, items);
    if (unavailable.length > 0) {
      toast.warning(
        `${unavailable.length} item(s) no longer available: ${unavailable.map((u) => u.name).slice(0, 3).join(", ")}`,
      );
    }
    toast.success(`Added ${items.length} item(s) to your cart`);
    router.push("/cart");
  }

  return (
    <div className="flex flex-col gap-2">
      {orders.map((order) => (
        <div key={order.id} className="flex items-center gap-2 rounded-xl border p-3 hover:bg-accent/50">
          <Link href={`/orders/${order.id}`} className="min-w-0 flex-1">
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
          </Link>
          <OrderStatusBadge status={order.status} />
          <Button
            size="sm"
            variant="outline"
            disabled={reorderingId === order.id}
            onClick={() => reorder(order.id)}
            aria-label="Reorder"
          >
            {reorderingId === order.id ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <RotateCcw className="size-3.5" />
            )}
          </Button>
        </div>
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
