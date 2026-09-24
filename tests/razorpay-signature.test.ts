import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { verifyCheckoutSignature, verifyWebhookSignature } = await import("../src/lib/payments/razorpay");

const sign = (secret: string, data: string) => createHmac("sha256", secret).update(data).digest("hex");

describe("Razorpay signature checks", () => {
  beforeEach(() => {
    process.env.RAZORPAY_KEY_SECRET = "key_secret";
    process.env.RAZORPAY_WEBHOOK_SECRET = "hook_secret";
  });
  afterEach(() => {
    delete process.env.RAZORPAY_KEY_SECRET;
    delete process.env.RAZORPAY_WEBHOOK_SECRET;
  });

  it("accepts the checkout signature Razorpay would send", () => {
    const sig = sign("key_secret", "order_ABC|pay_XYZ");
    expect(verifyCheckoutSignature("order_ABC", "pay_XYZ", sig)).toBe(true);
  });

  it("rejects a signature for a different payment, order or secret", () => {
    const sig = sign("key_secret", "order_ABC|pay_XYZ");
    expect(verifyCheckoutSignature("order_ABC", "pay_OTHER", sig)).toBe(false);
    expect(verifyCheckoutSignature("order_OTHER", "pay_XYZ", sig)).toBe(false);
    expect(verifyCheckoutSignature("order_ABC", "pay_XYZ", sign("wrong", "order_ABC|pay_XYZ"))).toBe(false);
    expect(verifyCheckoutSignature("order_ABC", "pay_XYZ", "")).toBe(false);
  });

  it("checks webhook bodies against the webhook secret, not the key secret", () => {
    const body = JSON.stringify({ event: "payment.captured" });
    expect(verifyWebhookSignature(body, sign("hook_secret", body))).toBe(true);
    expect(verifyWebhookSignature(body, sign("key_secret", body))).toBe(false);
    expect(verifyWebhookSignature(body + " ", sign("hook_secret", body))).toBe(false);
  });

  it("refuses everything when the secrets aren't configured", () => {
    delete process.env.RAZORPAY_KEY_SECRET;
    delete process.env.RAZORPAY_WEBHOOK_SECRET;
    expect(verifyCheckoutSignature("order_ABC", "pay_XYZ", sign("", "order_ABC|pay_XYZ"))).toBe(false);
    expect(verifyWebhookSignature("{}", sign("", "{}"))).toBe(false);
  });
});
