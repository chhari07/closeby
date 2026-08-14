"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Phone, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OrderStatusBadge } from "@/components/orders/order-status-badge";
import { ReasonDialog } from "@/components/orders/reason-dialog";
import { transitionOrder } from "@/actions/orders";
import { formatPaise } from "@/lib/money";
import type { OrderDoc, OrderStatus } from "@/types";

export function OrderCard({ order }: { order: OrderDoc }) {
  const [busy, setBusy] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  async function advance(to: OrderStatus, reason?: string) {
    setBusy(true);
    const result = await transitionOrder(order.id, to, reason);
    setBusy(false);
    setRejectOpen(false);
    setCancelOpen(false);
    if (!result.ok) toast.error(result.error ?? "Could not update order");
  }

  return (
    <div className="rounded-xl border p-3">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="font-medium">{order.buyerName || "Buyer"}</p>
          <p className="text-muted-foreground text-xs">
            #{order.id.slice(0, 8).toUpperCase()} · {order.items.length} item
            {order.items.length > 1 ? "s" : ""}
          </p>
        </div>
        <OrderStatusBadge status={order.status} />
      </div>

      <div className="mt-2 flex flex-col gap-0.5 text-sm">
        {order.items.map((item) => (
          <div key={item.productId} className="text-muted-foreground flex justify-between">
            <span>
              {item.name} × {item.qty}
            </span>
            <span>{formatPaise(item.price * item.qty)}</span>
          </div>
        ))}
        <div className="flex justify-between font-medium">
          <span>Total</span>
          <span>{formatPaise(order.itemTotal)}</span>
        </div>
      </div>

      <p className="text-muted-foreground mt-2 text-xs">
        {order.deliveryAddress.line1}
        {order.deliveryAddress.landmark ? `, ${order.deliveryAddress.landmark}` : ""}
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <a href={`tel:${order.buyerPhone}`}>
          <Button size="sm" variant="outline">
            <Phone className="size-3.5" /> Call
          </Button>
        </a>

        {order.status === "PLACED" && (
          <>
            <Button size="sm" disabled={busy} onClick={() => advance("ACCEPTED")}>
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : "Accept"}
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => setRejectOpen(true)}>
              Reject
            </Button>
          </>
        )}
        {order.status === "ACCEPTED" && (
          <>
            <Button size="sm" disabled={busy} onClick={() => advance("PREPARING")}>
              Start preparing
            </Button>
            <Button size="sm" variant="outline" disabled={busy} onClick={() => setCancelOpen(true)}>
              Cancel
            </Button>
          </>
        )}
        {order.status === "PREPARING" && (
          <Button size="sm" disabled={busy} onClick={() => advance("READY")}>
            Mark ready
          </Button>
        )}
        {order.status === "READY" && (
          <Button size="sm" disabled={busy} onClick={() => advance("COMPLETED")}>
            Mark completed
          </Button>
        )}
      </div>

      <ReasonDialog
        open={rejectOpen}
        onOpenChange={setRejectOpen}
        title="Reject this order"
        submitting={busy}
        onConfirm={(reason) => advance("REJECTED", reason)}
      />
      <ReasonDialog
        open={cancelOpen}
        onOpenChange={setCancelOpen}
        title="Cancel this order"
        submitting={busy}
        onConfirm={(reason) => advance("CANCELLED", reason)}
      />
    </div>
  );
}
