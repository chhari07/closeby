import "server-only";
import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Minimal Razorpay REST client (no SDK needed): orders, payments, capture,
 * refunds and signature checks. Keys from the Razorpay dashboard >
 * Account & Settings > API Keys (test keys start with rzp_test_).
 */

const API = "https://api.razorpay.com/v1";

export function isRazorpayConfigured(): boolean {
  return Boolean(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET);
}

export function razorpayKeyId(): string {
  return process.env.RAZORPAY_KEY_ID ?? "";
}

async function call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  const { RAZORPAY_KEY_ID: id, RAZORPAY_KEY_SECRET: secret } = process.env;
  if (!id || !secret) throw new Error("Razorpay keys are not set");
  const res = await fetch(`${API}${path}`, {
    method,
    headers: {
      Authorization: `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as { error?: { description?: string } };
  if (!res.ok) throw new Error(`Razorpay ${path}: ${json.error?.description ?? res.status}`);
  return json as T;
}

export interface RazorpayOrder {
  id: string;
  amount: number;
  currency: string;
  status: "created" | "attempted" | "paid";
}

export interface RazorpayPayment {
  id: string;
  order_id: string;
  amount: number;
  status: "created" | "authorized" | "captured" | "refunded" | "failed";
}

/** amount in paise. `receipt` is our order id (max 40 chars). */
export function createOrder(amount: number, receipt: string, notes: Record<string, string>): Promise<RazorpayOrder> {
  return call("POST", "/orders", { amount, currency: "INR", receipt: receipt.slice(0, 40), notes });
}

export async function listOrderPayments(razorpayOrderId: string): Promise<RazorpayPayment[]> {
  const res = await call<{ items: RazorpayPayment[] }>("GET", `/orders/${razorpayOrderId}/payments`);
  return res.items;
}

export function fetchPayment(paymentId: string): Promise<RazorpayPayment> {
  return call("GET", `/payments/${paymentId}`);
}

export function capturePayment(paymentId: string, amount: number): Promise<RazorpayPayment> {
  return call("POST", `/payments/${paymentId}/capture`, { amount, currency: "INR" });
}

/** Full refund, processed at normal speed. */
export function refundPayment(paymentId: string, notes: Record<string, string>): Promise<{ id: string; status: string }> {
  return call("POST", `/payments/${paymentId}/refund`, { notes });
}

function safeEqualHex(a: string, b: string): boolean {
  const x = Buffer.from(a, "utf8");
  const y = Buffer.from(b, "utf8");
  return x.length === y.length && timingSafeEqual(x, y);
}

/** The signature Razorpay Checkout hands the browser after a successful payment. */
export function verifyCheckoutSignature(razorpayOrderId: string, paymentId: string, signature: string): boolean {
  const secret = process.env.RAZORPAY_KEY_SECRET;
  if (!secret) return false;
  const expected = createHmac("sha256", secret).update(`${razorpayOrderId}|${paymentId}`).digest("hex");
  return safeEqualHex(expected, signature);
}

/** X-Razorpay-Signature on webhook calls, signed with the webhook secret. */
export function verifyWebhookSignature(rawBody: string, signature: string): boolean {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET;
  if (!secret) return false;
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  return safeEqualHex(expected, signature);
}
