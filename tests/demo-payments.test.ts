import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { decideDemoPayment, demoOrderId, demoPaymentId } = await import("../src/lib/payments/demo");

describe("demo payment gateway", () => {
  it("scanning the QR always pays", () => {
    expect(decideDemoPayment({ kind: "qr" })).toEqual({ ok: true, detail: "UPI (QR)" });
  });

  it("follows the test UPI ids", () => {
    expect(decideDemoPayment({ kind: "upi", vpa: " Success@Demo " })).toEqual({ ok: true, detail: "UPI · success@demo" });
    expect(decideDemoPayment({ kind: "upi", vpa: "failure@demo" })).toMatchObject({ ok: false });
    expect(decideDemoPayment({ kind: "upi", vpa: "someone@okaxis" })).toMatchObject({ ok: false });
    expect(decideDemoPayment({ kind: "upi", vpa: "not a upi id" })).toMatchObject({ ok: false, error: "Enter a valid UPI ID" });
  });

  it("accepts the test card with the right OTP and shows only the last 4 digits", () => {
    expect(decideDemoPayment({ kind: "card", number: "4111 1111 1111 1111", otp: "123456" })).toEqual({
      ok: true,
      detail: "Card •••• 1111",
    });
  });

  it("declines a bad card number, the decline test card, or a wrong OTP", () => {
    expect(decideDemoPayment({ kind: "card", number: "4111 1111 1111 1112", otp: "123456" })).toMatchObject({
      ok: false,
      error: "Invalid card number",
    });
    expect(decideDemoPayment({ kind: "card", number: "4000 0000 0000 0002", otp: "123456" })).toMatchObject({ ok: false });
    expect(decideDemoPayment({ kind: "card", number: "4111111111111111", otp: "000000" })).toMatchObject({
      ok: false,
      error: "Incorrect OTP",
    });
  });

  it("issues gateway-style ids that are clearly demo ones", () => {
    expect(demoOrderId()).toMatch(/^order_demo_[0-9a-f]{14}$/);
    expect(demoPaymentId()).toMatch(/^pay_demo_[0-9a-f]{14}$/);
    expect(demoOrderId()).not.toBe(demoOrderId());
  });
});
