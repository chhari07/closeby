"use client";

import { useState } from "react";
import { toast } from "sonner";
import { Phone, Loader2, Receipt, MessageSquare, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { OrderStatusBadge } from "@/components/orders/order-status-badge";
import { BillDialog } from "@/components/orders/order-bill";
import { ReasonDialog } from "@/components/orders/reason-dialog";
import { transitionOrder } from "@/actions/orders";
import { formatPaise } from "@/lib/money";
import { OrderAiSuggestion } from "./order-ai-suggestion";
import { OrderRiskFlags } from "./order-risk-flags";
import { wasAutoAccepted } from "@/lib/orders/auto-accept";
import { ChatDialog } from "@/components/chat/chat-dialog";
import type { OrderDoc, OrderStatus } from "@/types";

export function OrderCard({
  order,
  onChanged,
  unreadChat = 0,
}: {
  order: OrderDoc;
  onChanged?: () => void;
  /** Unread messages from the buyer in this order's chat. */
  unreadChat?: number;
}) {
  const [chatOpen, setChatOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);
  const [billOpen, setBillOpen] = useState(false);

  async function advance(to: OrderStatus, reason?: string) {
    setBusy(true);
    const result = await transitionOrder(order.id, to, reason);
    setBusy(false);
    setRejectOpen(false);
    setCancelOpen(false);
    if (!result.ok) toast.error(result.error ?? "Could not update order");
    onChanged?.(); // show the new status right away instead of waiting for the next refresh
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
          <div
            key={item.productId}
            className="text-muted-foreground flex justify-between"
          >
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
        {order.paymentMethod === "online" && (
          <p className="text-status-ready text-xs font-medium">
            {order.paymentStatus === "paid"
              ? "Paid online — don't collect cash"
              : order.paymentStatus === "refunded" || order.paymentStatus === "refund_pending"
                ? "Paid online · refunded to buyer"
                : order.paymentStatus === "refund_failed"
                  ? "Paid online · refund pending"
                  : "Online payment"}
          </p>
        )}
      </div>

      {wasAutoAccepted(order) && (
        <p className="text-primary-ink mt-2 flex items-center gap-1 text-xs font-medium">
          <Zap className="size-3.5" /> Auto-accepted by your rules
        </p>
      )}
      <OrderRiskFlags order={order} />

      <p className="text-muted-foreground mt-2 text-xs">
        {order.deliveryAddress.line1}
        {order.deliveryAddress.landmark
          ? `, ${order.deliveryAddress.landmark}`
          : ""}
      </p>

      <div className="mt-3 flex flex-wrap gap-2">
        <a href={`tel:${order.buyerPhone}`}>
          <Button size="sm" variant="outline">
            <Phone className="size-3.5" /> Call
          </Button>
        </a>

        <Button size="sm" variant="outline" onClick={() => setBillOpen(true)}>
          <Receipt className="size-3.5" /> Bill
        </Button>

        <Button size="sm" variant="outline" className="relative" onClick={() => setChatOpen(true)}>
          <MessageSquare className="size-3.5" /> Chat
          {unreadChat > 0 && (
            <span className="bg-primary text-primary-foreground absolute -top-1.5 -right-1.5 flex h-4 min-w-4 items-center justify-center rounded-full px-1 text-[10px]">
              {unreadChat}
            </span>
          )}
        </Button>

        {order.status === "PLACED" && (
          <>
            <Button
              size="sm"
              disabled={busy}
              onClick={() => advance("ACCEPTED")}
            >
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : "Accept"}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => setRejectOpen(true)}
            >
              Reject
            </Button>
          </>
        )}
      </div>

      {order.status === "PLACED" && (
        <div className="mt-2">
          <OrderAiSuggestion shopId={order.shopId} orderId={order.id} onApplied={onChanged} />
        </div>
      )}

      <div className="mt-3 flex flex-wrap gap-2">
        {order.status === "ACCEPTED" && (
          <>
            <Button
              size="sm"
              disabled={busy}
              onClick={() => advance("PREPARING")}
            >
              Start preparing
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => setCancelOpen(true)}
            >
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
          <Button
            size="sm"
            disabled={busy}
            onClick={() => advance("COMPLETED")}
          >
            Mark completed
          </Button>
        )}
      </div>

      <ChatDialog
        orderId={order.id}
        title={`Chat with ${order.buyerName || "buyer"}`}
        open={chatOpen}
        onOpenChange={setChatOpen}
      />
      <BillDialog order={order} open={billOpen} onOpenChange={setBillOpen} />
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
