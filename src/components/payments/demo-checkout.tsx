"use client";

import { useEffect, useMemo, useState } from "react";
import QRCode from "qrcode";
import { Check, CreditCard, Loader2, Lock, QrCode, ShieldCheck, Smartphone, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { payDemoOrder, type OrderPaymentSession } from "@/actions/orders";
import { formatPaise } from "@/lib/money";
import type { PaymentOutcome } from "@/lib/payments/checkout";

/**
 * The built-in demo gateway's payment sheet (see src/lib/payments/demo.ts):
 * UPI QR, UPI ID and card, with the same test credentials real gateways use
 * in test mode. The QR deliberately encodes a demo code, not a UPI address,
 * so scanning it with a real UPI app can never send money anywhere.
 */

type Tab = "qr" | "upi" | "card";
type Stage =
  | { kind: "form" }
  | { kind: "processing"; message: string }
  | { kind: "otp" }
  | { kind: "success"; paymentId: string }
  | { kind: "failed"; error: string };

function useCountdown(until: number): string {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const left = Math.max(0, Math.floor((until - now) / 1000));
  return `${String(Math.floor(left / 60)).padStart(2, "0")}:${String(left % 60).padStart(2, "0")}`;
}

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

function formatCard(v: string): string {
  return v.replace(/\D/g, "").slice(0, 16).replace(/(.{4})/g, "$1 ").trim();
}

function formatExpiry(v: string): string {
  const d = v.replace(/\D/g, "").slice(0, 4);
  return d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d;
}

function expiryValid(v: string): boolean {
  const m = v.match(/^(\d{2})\/(\d{2})$/);
  if (!m) return false;
  const month = Number(m[1]);
  const year = 2000 + Number(m[2]);
  if (month < 1 || month > 12) return false;
  const now = new Date();
  return year > now.getFullYear() || (year === now.getFullYear() && month >= now.getMonth() + 1);
}

export function DemoCheckout({
  orderId,
  session,
  onDone,
}: {
  orderId: string;
  session: OrderPaymentSession;
  onDone: (outcome: PaymentOutcome) => void;
}) {
  const [tab, setTab] = useState<Tab>("qr");
  const [stage, setStage] = useState<Stage>({ kind: "form" });
  const [qr, setQr] = useState<string | null>(null);
  const [vpa, setVpa] = useState("");
  const [card, setCard] = useState({ number: "", expiry: "", cvv: "", name: "" });
  const [otp, setOtp] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const countdown = useCountdown(session.expiresAt);

  // Not a UPI link on purpose — see the file comment.
  const qrPayload = useMemo(
    () => `CLOSEBY-DEMO-PAYMENT|${session.gatewayOrderId}|INR ${(session.amount / 100).toFixed(2)}|NOT A REAL UPI CODE`,
    [session.gatewayOrderId, session.amount],
  );
  useEffect(() => {
    QRCode.toDataURL(qrPayload, { width: 440, margin: 1, errorCorrectionLevel: "M" })
      .then(setQr)
      .catch(() => setQr(null));
  }, [qrPayload]);

  // Esc closes like a real payment sheet (counts as "dismissed").
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && (stage.kind === "form" || stage.kind === "failed")) onDone({ status: "dismissed" });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [stage.kind, onDone]);

  async function settle(method: Parameters<typeof payDemoOrder>[1], message: string, delayMs: number) {
    setFormError(null);
    setStage({ kind: "processing", message });
    await wait(delayMs);
    const result = await payDemoOrder(orderId, method).catch(() => ({ ok: false as const, error: "Network error, try again" }));
    if (result.ok && result.data) {
      setStage({ kind: "success", paymentId: result.data.paymentId });
      await wait(1600);
      onDone({ status: "paid" });
    } else {
      setStage({ kind: "failed", error: result.error ?? "Payment failed" });
    }
  }

  function payByUpiId() {
    if (!/^[\w.\-]{2,}@[a-z]{2,}$/i.test(vpa.trim())) {
      setFormError("Enter a valid UPI ID, e.g. name@bank");
      return;
    }
    void settle({ kind: "upi", vpa }, "Payment request sent. Approve it in your UPI app…", 2500);
  }

  function continueCard() {
    const digits = card.number.replace(/\D/g, "");
    if (digits.length < 13) return setFormError("Enter the full card number");
    if (!expiryValid(card.expiry)) return setFormError("Enter a valid expiry (MM/YY)");
    if (!/^\d{3,4}$/.test(card.cvv)) return setFormError("Enter the 3-digit CVV");
    setFormError(null);
    setStage({ kind: "processing", message: "Contacting your bank…" });
    void wait(1200).then(() => setStage({ kind: "otp" }));
  }

  const busy = stage.kind === "processing" || stage.kind === "success";

  return (
    <div className="fixed inset-0 z-[2000] flex items-end justify-center bg-black/60 sm:items-center sm:p-4">
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Payment"
        className="bg-background flex max-h-[95svh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl shadow-2xl sm:rounded-2xl"
      >
        {/* Header */}
        <div className="bg-primary text-primary-foreground relative px-5 pt-4 pb-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <ShieldCheck className="size-4" /> CloseBy Pay
              <span className="rounded bg-amber-400 px-1.5 py-0.5 text-[10px] font-bold tracking-wide text-amber-950 uppercase">
                Test mode
              </span>
            </div>
            {!busy && (
              <button
                type="button"
                aria-label="Close"
                className="rounded-full p-1 hover:bg-white/15"
                onClick={() => onDone({ status: "dismissed" })}
              >
                <X className="size-5" />
              </button>
            )}
          </div>
          <p className="mt-3 text-xs opacity-80">Paying {session.shopName}</p>
          <p className="text-3xl font-bold tabular-nums">{formatPaise(session.amount)}</p>
          <p className="mt-1 text-xs opacity-80">
            Order {session.gatewayOrderId} · expires in <span className="tabular-nums">{countdown}</span>
          </p>
        </div>

        <div className="flex-1 overflow-y-auto">
          {stage.kind === "success" ? (
            <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
              <div className="bg-status-ready flex size-16 items-center justify-center rounded-full text-white">
                <Check className="size-9" strokeWidth={3} />
              </div>
              <p className="text-lg font-semibold">Payment successful</p>
              <p className="text-muted-foreground text-xs">Payment ID {stage.paymentId}</p>
            </div>
          ) : stage.kind === "processing" ? (
            <div className="flex flex-col items-center gap-3 px-6 py-12 text-center">
              <Loader2 className="text-primary size-10 animate-spin" />
              <p className="text-sm">{stage.message}</p>
              <p className="text-muted-foreground text-xs">Don&apos;t close this window</p>
            </div>
          ) : stage.kind === "failed" ? (
            <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
              <div className="bg-destructive/10 text-destructive flex size-16 items-center justify-center rounded-full">
                <X className="size-9" strokeWidth={3} />
              </div>
              <p className="text-lg font-semibold">Payment failed</p>
              <p className="text-muted-foreground text-sm">{stage.error}</p>
              <p className="text-muted-foreground text-xs">No money was deducted.</p>
              <Button className="mt-2 min-h-11 w-full" onClick={() => setStage({ kind: "form" })}>
                Try again
              </Button>
            </div>
          ) : stage.kind === "otp" ? (
            <div className="flex flex-col gap-4 px-6 py-6">
              <div>
                <p className="font-semibold">Enter OTP</p>
                <p className="text-muted-foreground text-sm">
                  Sent to the mobile number linked to card •••• {card.number.replace(/\D/g, "").slice(-4)}
                </p>
              </div>
              <Input
                autoFocus
                inputMode="numeric"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                placeholder="6-digit OTP"
                className="h-12 text-center text-lg tracking-[0.4em]"
              />
              <p className="text-muted-foreground rounded-md bg-amber-50 p-2 text-xs dark:bg-amber-950/40">
                Test mode: use OTP <b>123456</b>
              </p>
              <Button
                className="min-h-11"
                disabled={otp.length !== 6}
                onClick={() => settle({ kind: "card", number: card.number, otp }, "Verifying with your bank…", 1500)}
              >
                <Lock className="size-4" /> Verify &amp; pay {formatPaise(session.amount)}
              </Button>
            </div>
          ) : (
            <>
              {/* Method tabs */}
              <div className="grid grid-cols-3 border-b text-sm">
                {(
                  [
                    ["qr", "UPI QR", QrCode],
                    ["upi", "UPI ID", Smartphone],
                    ["card", "Card", CreditCard],
                  ] as const
                ).map(([value, label, Icon]) => (
                  <button
                    key={value}
                    type="button"
                    onClick={() => {
                      setTab(value);
                      setFormError(null);
                    }}
                    className={`flex items-center justify-center gap-1.5 py-3 font-medium ${
                      tab === value ? "border-primary text-primary border-b-2" : "text-muted-foreground"
                    }`}
                  >
                    <Icon className="size-4" /> {label}
                  </button>
                ))}
              </div>

              <div className="flex flex-col gap-4 px-6 py-5">
                {tab === "qr" && (
                  <>
                    <div className="flex flex-col items-center gap-3">
                      <div className="rounded-xl border bg-white p-3">
                        {qr ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={qr} alt="Payment QR code" className="size-52" />
                        ) : (
                          <div className="flex size-52 items-center justify-center">
                            <Loader2 className="size-6 animate-spin text-neutral-400" />
                          </div>
                        )}
                      </div>
                      <p className="text-sm font-medium">Scan with any UPI app to pay</p>
                      <p className="text-muted-foreground flex items-center gap-2 text-xs">
                        <Loader2 className="size-3 animate-spin" /> Waiting for payment…
                      </p>
                    </div>
                    <div className="rounded-md bg-amber-50 p-3 text-xs dark:bg-amber-950/40">
                      <p>
                        Test mode: this QR can&apos;t take real money. Simulate the customer completing the scan:
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-2 w-full"
                        onClick={() => settle({ kind: "qr" }, "Payment received, confirming…", 1200)}
                      >
                        Simulate successful scan &amp; pay
                      </Button>
                    </div>
                  </>
                )}

                {tab === "upi" && (
                  <>
                    <div className="flex flex-col gap-1.5">
                      <label htmlFor="demo-vpa" className="text-sm font-medium">
                        UPI ID
                      </label>
                      <Input
                        id="demo-vpa"
                        autoFocus
                        value={vpa}
                        onChange={(e) => setVpa(e.target.value)}
                        placeholder="yourname@bank"
                        className="h-11"
                        autoCapitalize="none"
                        autoCorrect="off"
                      />
                    </div>
                    <p className="text-muted-foreground rounded-md bg-amber-50 p-2 text-xs dark:bg-amber-950/40">
                      Test mode: <b>success@demo</b> pays, <b>failure@demo</b> is declined.
                    </p>
                    <Button className="min-h-11" onClick={payByUpiId}>
                      Pay {formatPaise(session.amount)}
                    </Button>
                  </>
                )}

                {tab === "card" && (
                  <>
                    <div className="flex flex-col gap-3">
                      <Input
                        autoFocus
                        inputMode="numeric"
                        autoComplete="off"
                        value={card.number}
                        onChange={(e) => setCard((c) => ({ ...c, number: formatCard(e.target.value) }))}
                        placeholder="Card number"
                        className="h-11 tracking-wider"
                      />
                      <div className="flex gap-3">
                        <Input
                          inputMode="numeric"
                          autoComplete="off"
                          value={card.expiry}
                          onChange={(e) => setCard((c) => ({ ...c, expiry: formatExpiry(e.target.value) }))}
                          placeholder="MM/YY"
                          className="h-11"
                        />
                        <Input
                          inputMode="numeric"
                          autoComplete="off"
                          type="password"
                          maxLength={4}
                          value={card.cvv}
                          onChange={(e) => setCard((c) => ({ ...c, cvv: e.target.value.replace(/\D/g, "") }))}
                          placeholder="CVV"
                          className="h-11"
                        />
                      </div>
                      <Input
                        autoComplete="off"
                        value={card.name}
                        onChange={(e) => setCard((c) => ({ ...c, name: e.target.value }))}
                        placeholder="Name on card (optional)"
                        className="h-11"
                      />
                    </div>
                    <p className="text-muted-foreground rounded-md bg-amber-50 p-2 text-xs dark:bg-amber-950/40">
                      Test mode: card <b>4111 1111 1111 1111</b>, any future expiry, any CVV. (4000 0000 0000
                      0002 is declined.)
                    </p>
                    <Button className="min-h-11" onClick={continueCard}>
                      <Lock className="size-4" /> Pay {formatPaise(session.amount)}
                    </Button>
                  </>
                )}

                {formError && <p className="text-destructive text-sm">{formError}</p>}
              </div>
            </>
          )}
        </div>

        <div className="text-muted-foreground flex items-center justify-center gap-1.5 border-t py-2.5 text-[11px]">
          <Lock className="size-3" /> Secured by CloseBy Pay · Demo gateway, no real money is charged
        </div>
      </div>
    </div>
  );
}
