import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { listMyOrders } from "@/actions/orders";
import { BackButton } from "@/components/buyer/back-button";
import { OrderStatusBadge } from "@/components/orders/order-status-badge";
import { formatPaise } from "@/lib/money";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const orders = await listMyOrders();

  return (
    <div className="mx-auto max-w-lg p-4">
      <BackButton />
      <h1 className="mb-4 text-xl font-bold">Your orders</h1>

      {orders.length === 0 ? (
        <div className="text-muted-foreground flex flex-col items-center gap-2 py-16 text-center text-sm">
          <ClipboardList className="size-8" />
          <p>No orders yet.</p>
          <Link href="/shops" className="text-primary underline">
            Browse nearby shops
          </Link>
        </div>
      ) : (
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
                  {order.items.length} item{order.items.length > 1 ? "s" : ""} ·{" "}
                  {formatPaise(order.itemTotal)}
                </p>
              </div>
              <OrderStatusBadge status={order.status} />
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
