import Link from "next/link";
import { ClipboardList } from "lucide-react";
import { listMyOrders } from "@/actions/orders";
import { BackButton } from "@/components/buyer/back-button";
import { OrdersList } from "./orders-list";

export const dynamic = "force-dynamic";

export default async function OrdersPage() {
  const { orders, nextCursor } = await listMyOrders();

  return (
    <div className="mx-auto max-w-lg p-4">
      <BackButton />
      <h1 className="mb-4 text-xl font-bold">Your orders</h1>

      {orders.length === 0 ? (
        <div className="text-muted-foreground flex flex-col items-center gap-2 py-16 text-center text-sm">
          <ClipboardList className="size-8" />
          <p>No orders yet.</p>
          <Link href="/shops" className="text-primary-ink underline">
            Browse nearby shops
          </Link>
        </div>
      ) : (
        <OrdersList initialOrders={orders} initialCursor={nextCursor} />
      )}
    </div>
  );
}
