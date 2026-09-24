import "server-only";
import { isRazorpayConfigured } from "./razorpay";
import type { PaymentProvider } from "@/types";

/**
 * Which gateway "Pay online" uses: Razorpay when its keys are set, otherwise
 * the built-in demo gateway (src/lib/payments/demo.ts) — a realistic
 * checkout that moves no real money, for portfolio/demo deployments.
 * PAYMENTS_DEMO=off hides "Pay online" entirely when there are no keys.
 */
export function activePaymentProvider(): PaymentProvider | null {
  if (isRazorpayConfigured()) return "razorpay";
  if (process.env.PAYMENTS_DEMO === "off") return null;
  return "demo";
}
