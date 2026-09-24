"use client";

import { useState } from "react";
import { useUser } from "@clerk/nextjs";
import { OrderBill } from "@/components/orders/order-bill";
import { useOrderSignals } from "@/lib/hooks/use-order-signals";
import { toast } from "sonner";
import { Check, X, Loader2, Phone, CreditCard } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { getOrder, startOrderPayment, transitionOrder } from "@/actions/orders";
import { payForOrder } from "@/lib/payments/checkout";
import { isTerminal } from "@/lib/orders/transitions";
import { OrderHelpChat } from "./order-help-chat";
import type { OrderDoc, OrderStatus } from "@/types";

const STEPS: OrderStatus[] = [
  "PLACED",
  "ACCEPTED",
  "PREPARING",
  "READY",
  "COMPLETED",
];
const STEP_LABELS: Record<OrderStatus, string> = {
  PLACED: "Placed",
  ACCEPTED: "Accepted",
  PREPARING: "Preparing",
  READY: "Ready for pickup",
  COMPLETED: "Completed",
  REJECTED: "Rejected",
  CANCELLED: "Cancelled",
};

export function OrderTimeline({
  initialOrder,
  orderId,
}: {
  initialOrder: OrderDoc;
  orderId: string;
}) {
  const { user } = useUser();
  const [order, setOrder] = useState(initialOrder);
  const [cancelling, setCancelling] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [paying, setPaying] = useState(false);

  // Live status: re-read the order whenever it changes. The server-rendered
  // order stays on screen if live updates can't start.
  useOrderSignals(`order:${orderId}`, async () => {
    const fresh = await getOrder(orderId).catch(() => null);
    if (fresh) setOrder(fresh);
  });

  const isBuyer = user?.id === order.buyerId;
  const terminal = isTerminal(order.status);
  const currentIdx = STEPS.indexOf(order.status);

  const awaitingPayment = order.paymentStatus === "pending" && order.status === "PLACED";

  async function handlePayNow() {
    setPaying(true);
    const session = await startOrderPayment(orderId);
    if (!session.ok || !session.data) {
      setPaying(false);
      toast.error(session.error ?? "Could not start payment");
      return;
    }
    const outcome = await payForOrder(orderId, session.data);
    const fresh = await getOrder(orderId).catch(() => null);
    if (fresh) setOrder(fresh);
    setPaying(false);
    if (outcome.status === "paid") toast.success("Payment successful — your order is placed!");
    else if (outcome.status === "failed") toast.error(outcome.error);
  }

  async function handleCancel() {
    setCancelling(true);
    const result = await transitionOrder(orderId, "CANCELLED");
    setCancelling(false);
    setConfirmCancel(false);
    if (!result.ok) toast.error(result.error ?? "Could not cancel order");
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-xl font-bold">{order.shopName}</h1>
        <p className="text-muted-foreground text-sm">
          Order #{order.id.slice(0, 8).toUpperCase()}
        </p>
      </div>

      {!terminal ? (
        <ol className="flex flex-col gap-0">
          {STEPS.map((step, i) => {
            const done = i <= currentIdx;
            const isLast = i === STEPS.length - 1;
            return (
              <li key={step} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <div
                    className={`flex size-7 shrink-0 items-center justify-center rounded-full ${
                      done
                        ? "bg-status-progress text-white"
                        : "bg-muted text-muted-foreground"
                    } ${step === "COMPLETED" && done ? "bg-status-ready" : ""}`}
                  >
                    {done ? <Check className="size-4" /> : null}
                  </div>
                  {!isLast && (
                    <div
                      className={`w-0.5 flex-1 ${done ? "bg-status-progress" : "bg-muted"}`}
                    />
                  )}
                </div>
                <div className="pb-6">
                  <p
                    className={`font-medium ${done ? "" : "text-muted-foreground"}`}
                  >
                    {STEP_LABELS[step]}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      ) : (
        <div
          className={`flex items-center gap-3 rounded-xl p-4 ${
            order.status === "COMPLETED"
              ? "bg-status-ready/10 text-status-ready"
              : "bg-status-stopped/10 text-status-stopped"
          }`}
        >
          {order.status === "COMPLETED" ? (
            <Check className="size-5" />
          ) : (
            <X className="size-5" />
          )}
          <div>
            <p className="font-medium">{STEP_LABELS[order.status]}</p>
            {order.rejectionReason && (
              <p className="text-sm">{order.rejectionReason}</p>
            )}
          </div>
        </div>
      )}

      {isBuyer && awaitingPayment && (
        <div className="flex flex-col gap-3 rounded-xl border border-amber-300 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/40">
          <div>
            <p className="font-medium">Payment pending</p>
            <p className="text-muted-foreground text-sm">
              The shop gets your order once it&apos;s paid. Pay within 15 minutes of ordering, or it&apos;s
              cancelled automatically.
            </p>
          </div>
          <Button className="min-h-11" disabled={paying} onClick={handlePayNow}>
            {paying ? <Loader2 className="size-4 animate-spin" /> : <CreditCard className="size-4" />}
            Pay now
          </Button>
        </div>
      )}

      <OrderBill order={order} showBuyer={!isBuyer} />

      {isBuyer && <OrderHelpChat orderId={orderId} />}

      {isBuyer && order.status === "PLACED" && (
        <Button
          variant="outline"
          className="min-h-11"
          disabled={cancelling}
          onClick={() => setConfirmCancel(true)}
        >
          {cancelling ? (
            <Loader2 className="size-4 animate-spin" />
          ) : (
            "Cancel order"
          )}
        </Button>
      )}

      {!isBuyer && (
        <a href={`tel:${order.buyerPhone}`}>
          <Button variant="outline" className="min-h-11 w-full">
            <Phone className="size-4" /> Call buyer
          </Button>
        </a>
      )}

      <AlertDialog open={confirmCancel} onOpenChange={setConfirmCancel}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancel this order?</AlertDialogTitle>
            <AlertDialogDescription>
              This can&apos;t be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep order</AlertDialogCancel>
            <AlertDialogAction onClick={handleCancel}>
              Cancel order
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
