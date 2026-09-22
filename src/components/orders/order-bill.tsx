"use client";

import { Printer, Receipt } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatPaise } from "@/lib/money";
import type { OrderDoc, OrderStatus } from "@/types";

const PAYMENT_LABEL = {
  cod: "Cash on delivery",
  pay_at_shop: "Pay at shop",
} as const;

function paymentStatus(order: OrderDoc): { label: string; tone: string } {
  const s: OrderStatus = order.status;
  if (s === "COMPLETED") return { label: "Paid", tone: "text-status-ready" };
  if (s === "REJECTED" || s === "CANCELLED")
    return { label: "No payment due", tone: "text-status-stopped" };
  return {
    label:
      order.paymentMethod === "cod" ? "To pay on delivery" : "To pay at shop",
    tone: "text-muted-foreground",
  };
}

function formatWhen(ms: number): string {
  return new Date(ms).toLocaleString("en-IN", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

/** Itemised bill for one order. Print-friendly: see `.print-bill` rules in globals.css. */
export function OrderBill({
  order,
  showBuyer = false,
}: {
  order: OrderDoc;
  showBuyer?: boolean;
}) {
  const pay = paymentStatus(order);
  const units = order.items.reduce((n, i) => n + i.qty, 0);
  const billTotal =
    order.status === "REJECTED" || order.status === "CANCELLED"
      ? 0
      : order.itemTotal;

  return (
    <div className="flex flex-col gap-3">
      <div
        id="order-bill"
        className="print-bill bg-card rounded-xl border p-4 text-sm"
      >
        <div className="flex items-start justify-between gap-3 border-b pb-3">
          <div className="min-w-0">
            <p className="text-base font-bold">{order.shopName}</p>
            <p className="text-muted-foreground text-xs">Bill / Invoice</p>
          </div>
          <div className="text-right text-xs">
            <p className="font-semibold">
              #{order.id.slice(0, 8).toUpperCase()}
            </p>
            <p className="text-muted-foreground">
              {formatWhen(order.createdAt)}
            </p>
          </div>
        </div>

        {showBuyer && (
          <div className="border-b py-3 text-xs">
            <p className="text-muted-foreground">Billed to</p>
            <p className="font-medium">{order.buyerName || "Buyer"}</p>
            {order.buyerPhone && (
              <p className="text-muted-foreground">{order.buyerPhone}</p>
            )}
          </div>
        )}

        <table className="w-full py-2 text-left">
          <thead>
            <tr className="text-muted-foreground border-b text-xs">
              <th className="py-2 font-medium">Item</th>
              <th className="py-2 text-right font-medium">Qty</th>
              <th className="py-2 text-right font-medium">Rate</th>
              <th className="py-2 text-right font-medium">Amount</th>
            </tr>
          </thead>
          <tbody>
            {order.items.map((item) => (
              <tr
                key={item.productId}
                className="border-b border-dashed align-top"
              >
                <td className="py-2 pr-2">
                  <span className="font-medium">{item.name}</span>
                  <span className="text-muted-foreground block text-xs">
                    {item.unit}
                  </span>
                </td>
                <td className="py-2 text-right tabular-nums">{item.qty}</td>
                <td className="py-2 text-right tabular-nums">
                  {formatPaise(item.price)}
                </td>
                <td className="py-2 text-right tabular-nums">
                  {formatPaise(item.price * item.qty)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>

        <dl className="mt-3 flex flex-col gap-1">
          <div className="flex justify-between">
            <dt className="text-muted-foreground">
              Subtotal ({units} item{units === 1 ? "" : "s"})
            </dt>
            <dd className="tabular-nums">{formatPaise(order.itemTotal)}</dd>
          </div>
          <div className="flex justify-between">
            <dt className="text-muted-foreground">Delivery fee</dt>
            <dd className="tabular-nums">₹0.00</dd>
          </div>
          <div className="mt-1 flex justify-between border-t pt-2 text-base font-bold">
            <dt>
              {billTotal === 0 && order.itemTotal > 0 ? "Amount due" : "Total"}
            </dt>
            <dd className="tabular-nums">{formatPaise(billTotal)}</dd>
          </div>
        </dl>

        <div className="mt-3 flex items-center justify-between border-t pt-3 text-xs">
          <span className="text-muted-foreground">
            {PAYMENT_LABEL[order.paymentMethod]}
          </span>
          <span className={`font-semibold ${pay.tone}`}>{pay.label}</span>
        </div>
        <p className="text-muted-foreground mt-2 text-xs">
          {order.deliveryAddress.line1}
          {order.deliveryAddress.landmark
            ? `, ${order.deliveryAddress.landmark}`
            : ""}
        </p>
        <p className="text-muted-foreground mt-3 text-center text-[11px]">
          Thank you for shopping local · CloseBy
        </p>
      </div>

      <Button
        variant="outline"
        className="min-h-11 print:hidden"
        onClick={() => window.print()}
      >
        <Printer className="size-4" /> Print / Save as PDF
      </Button>
    </div>
  );
}

/** "Bill" button that opens the bill in a dialog (used on the shop owner's order cards). */
export function BillDialog({
  order,
  open,
  onOpenChange,
}: {
  order: OrderDoc;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Receipt className="size-4" /> Order bill
          </DialogTitle>
        </DialogHeader>
        <OrderBill order={order} showBuyer />
      </DialogContent>
    </Dialog>
  );
}
