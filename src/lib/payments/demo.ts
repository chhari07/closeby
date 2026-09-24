import "server-only";
import { randomBytes } from "node:crypto";

/**
 * The built-in demo gateway: ids shaped like a real gateway's so orders,
 * bills and refunds look authentic, but nothing leaves the app and no real
 * money moves. Test credentials, as on real gateways' test modes:
 *   UPI ID  success@demo -> paid, failure@demo -> declined
 *   Card    4111 1111 1111 1111, any future expiry, any CVV, OTP 123456
 *           (4000 0000 0000 0002 is always declined)
 */

const id = (prefix: string) => `${prefix}_demo_${randomBytes(7).toString("hex")}`;

export const demoOrderId = () => id("order");
export const demoPaymentId = () => id("pay");
export const demoRefundId = () => id("rfnd");

export type DemoMethod =
  | { kind: "qr" }
  | { kind: "upi"; vpa: string }
  | { kind: "card"; number: string; otp: string };

/** Decides a demo payment the way a real gateway's test mode would. */
export function decideDemoPayment(method: DemoMethod): { ok: true; detail: string } | { ok: false; error: string } {
  if (method.kind === "qr") return { ok: true, detail: "UPI (QR)" };
  if (method.kind === "upi") {
    const vpa = method.vpa.trim().toLowerCase();
    if (!/^[a-z0-9.\-_]{2,}@[a-z]{2,}$/.test(vpa)) return { ok: false, error: "Enter a valid UPI ID" };
    if (vpa === "failure@demo") return { ok: false, error: "Payment declined by the bank" };
    if (vpa !== "success@demo") return { ok: false, error: "In test mode use success@demo (or failure@demo)" };
    return { ok: true, detail: `UPI · ${vpa}` };
  }
  const digits = method.number.replace(/\D/g, "");
  if (!luhn(digits) || digits.length < 13) return { ok: false, error: "Invalid card number" };
  if (digits === "4000000000000002") return { ok: false, error: "Card declined by the issuing bank" };
  if (method.otp !== "123456") return { ok: false, error: "Incorrect OTP" };
  return { ok: true, detail: `Card •••• ${digits.slice(-4)}` };
}

function luhn(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return digits.length > 0 && sum % 10 === 0;
}
