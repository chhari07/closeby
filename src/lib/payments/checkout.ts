"use client";

import { createElement } from "react";
import { createRoot } from "react-dom/client";
import { confirmOrderPayment, type OrderPaymentSession } from "@/actions/orders";
import { DemoCheckout } from "@/components/payments/demo-checkout";

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
 * Opens the payment sheet for an order — Razorpay's (UPI, cards,
 * netbanking, wallets) or the built-in demo gateway's — and, on success,
 * has the server verify and record the payment. Resolves once the buyer
 * pays, closes the sheet, or verification fails.
 */
export async function payForOrder(orderId: string, session: OrderPaymentSession): Promise<PaymentOutcome> {
  if (session.provider === "demo") return openDemoCheckout(orderId, session);

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
      order_id: session.gatewayOrderId,
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

/** Mounts the demo gateway's sheet on top of the page, like Razorpay's own overlay. */
function openDemoCheckout(orderId: string, session: OrderPaymentSession): Promise<PaymentOutcome> {
  return new Promise((resolve) => {
    const host = document.createElement("div");
    document.body.appendChild(host);
    const root = createRoot(host);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const done = (outcome: PaymentOutcome) => {
      root.unmount();
      host.remove();
      document.body.style.overflow = previousOverflow;
      resolve(outcome);
    };
    root.render(createElement(DemoCheckout, { orderId, session, onDone: done }));
  });
}
