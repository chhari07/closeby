"use client";

import { confirmOrderPayment, type OrderPaymentSession } from "@/actions/orders";

/** Razorpay Checkout (https://razorpay.com/docs/payments/payment-gateway/web-integration/standard/). */
interface RazorpayCheckout {
  open(): void;
  on(event: "payment.failed", cb: (res: { error?: { description?: string } }) => void): void;
}
declare global {
  interface Window {
    Razorpay?: new (options: Record<string, unknown>) => RazorpayCheckout;
  }
}

const SCRIPT_URL = "https://checkout.razorpay.com/v1/checkout.js";
let loading: Promise<boolean> | null = null;

function loadCheckoutScript(): Promise<boolean> {
  if (window.Razorpay) return Promise.resolve(true);
  loading ??= new Promise((resolve) => {
    const script = document.createElement("script");
    script.src = SCRIPT_URL;
    script.onload = () => resolve(true);
    script.onerror = () => {
      loading = null;
      resolve(false);
    };
    document.body.appendChild(script);
  });
  return loading;
}

export type PaymentOutcome =
  | { status: "paid" }
  | { status: "dismissed" }
  | { status: "failed"; error: string };

/**
 * Opens Razorpay's payment sheet (UPI, cards, netbanking, wallets) for an
 * order and, on success, has the server verify and record the payment.
 * Resolves once the buyer pays, closes the sheet, or verification fails.
 */
export async function payForOrder(orderId: string, session: OrderPaymentSession): Promise<PaymentOutcome> {
  if (!(await loadCheckoutScript()) || !window.Razorpay) {
    return { status: "failed", error: "Could not load the payment page. Check your internet and try again." };
  }
  const Razorpay = window.Razorpay;
  return new Promise<PaymentOutcome>((resolve) => {
    let settled = false;
    const finish = (outcome: PaymentOutcome) => {
      if (settled) return;
      settled = true;
      resolve(outcome);
    };
    const checkout = new Razorpay({
      key: session.keyId,
      order_id: session.razorpayOrderId,
      amount: session.amount,
      currency: "INR",
      name: "CloseBy",
      description: `Order from ${session.shopName}`,
      prefill: { name: session.buyerName, contact: session.buyerPhone },
      notes: { closebyOrderId: orderId },
      theme: { color: "#16a34a" },
      handler: async (res: { razorpay_payment_id: string; razorpay_order_id: string; razorpay_signature: string }) => {
        const result = await confirmOrderPayment(orderId, {
          razorpayPaymentId: res.razorpay_payment_id,
          razorpayOrderId: res.razorpay_order_id,
          razorpaySignature: res.razorpay_signature,
        }).catch(() => ({ ok: false as const, error: "Could not confirm the payment" }));
        finish(result.ok ? { status: "paid" } : { status: "failed", error: result.error ?? "Payment could not be confirmed" });
      },
      modal: { ondismiss: () => finish({ status: "dismissed" }) },
    });
    // A failed attempt keeps the sheet open so the buyer can retry another
    // method; only closing it (ondismiss) ends the flow.
    checkout.on("payment.failed", () => {});
    checkout.open();
  });
}
