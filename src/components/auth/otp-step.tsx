"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, MailCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { otpCodeSchema } from "@/lib/validation/user";

const RESEND_SECONDS = 30;
const LENGTH = 6;

const emptyDigits = () => Array<string>(LENGTH).fill("");

/**
 * "Enter the 6-digit code we emailed you" step shared by sign-in and sign-up.
 *
 * One box per digit, auto-advancing focus, paste support, and auto-submit the
 * instant the 6th digit lands — no separate "Verify" tap needed, which is
 * most of what made this step feel slow.
 */
export function OtpStep({
  email,
  submitting,
  error,
  onVerify,
  onResend,
  onChangeEmail,
}: {
  email: string;
  submitting: boolean;
  error: string | null;
  onVerify: (code: string) => void;
  onResend: () => Promise<void>;
  onChangeEmail: () => void;
}) {
  const [digits, setDigits] = useState<string[]>(emptyDigits);
  const [localError, setLocalError] = useState<string | null>(null);
  const [cooldown, setCooldown] = useState(RESEND_SECONDS);
  const inputsRef = useRef<(HTMLInputElement | null)[]>([]);
  const lastSubmitted = useRef<string | null>(null);

  const code = digits.join("");

  useEffect(() => {
    if (cooldown <= 0) return;
    const id = setTimeout(() => setCooldown((c) => c - 1), 1000);
    return () => clearTimeout(id);
  }, [cooldown]);

  // Auto-submit as soon as all 6 boxes are filled — this is the whole point
  // of the box UI: typing (or pasting) the last digit verifies immediately
  // instead of waiting for a manual "Verify" tap.
  useEffect(() => {
    if (code.length !== LENGTH || submitting) return;
    if (lastSubmitted.current === code) return;
    const parsed = otpCodeSchema.safeParse(code);
    if (!parsed.success) return;
    lastSubmitted.current = code;
    setLocalError(null);
    onVerify(parsed.data);
    // onVerify is re-created on every parent render; only `code`/`submitting`
    // should decide whether this effect re-fires.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code, submitting]);

  // A failed verify clears the boxes so the person can re-enter, and drops
  // the "already submitted" guard so retyping the same digits is possible.
  useEffect(() => {
    if (!error) return;
    lastSubmitted.current = null;
    setDigits(emptyDigits());
    inputsRef.current[0]?.focus();
  }, [error]);

  function setDigitAt(index: number, value: string) {
    setDigits((prev) => {
      const next = [...prev];
      next[index] = value;
      return next;
    });
  }

  function handleChange(index: number, raw: string) {
    const digit = raw.replace(/\D/g, "").slice(-1);
    setDigitAt(index, digit);
    if (digit && index < LENGTH - 1) inputsRef.current[index + 1]?.focus();
  }

  function handleKeyDown(index: number, e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Backspace") {
      if (digits[index]) {
        setDigitAt(index, "");
      } else if (index > 0) {
        e.preventDefault();
        inputsRef.current[index - 1]?.focus();
        setDigitAt(index - 1, "");
      }
    } else if (e.key === "ArrowLeft" && index > 0) {
      e.preventDefault();
      inputsRef.current[index - 1]?.focus();
    } else if (e.key === "ArrowRight" && index < LENGTH - 1) {
      e.preventDefault();
      inputsRef.current[index + 1]?.focus();
    }
  }

  function handlePaste(e: React.ClipboardEvent<HTMLInputElement>) {
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, LENGTH);
    if (!pasted) return;
    e.preventDefault();
    setDigits((prev) => {
      const next = [...prev];
      for (let i = 0; i < LENGTH; i++) next[i] = pasted[i] ?? next[i] ?? "";
      return next;
    });
    const focusIndex = Math.min(pasted.length, LENGTH - 1);
    inputsRef.current[focusIndex]?.focus();
  }

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const parsed = otpCodeSchema.safeParse(code);
    if (!parsed.success) {
      setLocalError(parsed.error.issues[0]?.message ?? "Invalid code");
      return;
    }
    lastSubmitted.current = parsed.data;
    setLocalError(null);
    onVerify(parsed.data);
  }

  async function resend() {
    setCooldown(RESEND_SECONDS);
    lastSubmitted.current = null;
    setDigits(emptyDigits());
    inputsRef.current[0]?.focus();
    await onResend();
  }

  const shownError = localError ?? error;

  return (
    <form onSubmit={submit} className="flex flex-col gap-4">
      <div className="flex flex-col items-center gap-2 text-center">
        <MailCheck className="text-primary size-9" />
        <h2 className="text-lg font-semibold">Check your email</h2>
        <p className="text-muted-foreground text-sm">
          We sent a 6-digit code to <b className="text-foreground">{email}</b>
        </p>
      </div>

      <div className="flex flex-col gap-1.5">
        <div
          role="group"
          aria-label="Verification code"
          className="flex justify-between gap-2"
        >
          {digits.map((digit, i) => (
            <input
              key={i}
              ref={(el) => {
                inputsRef.current[i] = el;
              }}
              type="text"
              inputMode="numeric"
              pattern="\d*"
              autoComplete={i === 0 ? "one-time-code" : "off"}
              maxLength={1}
              autoFocus={i === 0}
              disabled={submitting}
              aria-label={`Digit ${i + 1} of ${LENGTH}`}
              value={digit}
              onChange={(e) => handleChange(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(i, e)}
              onPaste={handlePaste}
              onFocus={(e) => e.currentTarget.select()}
              className="border-input bg-background focus:border-primary focus:ring-primary/30 h-14 w-full min-w-0 rounded-xl border text-center text-2xl font-semibold outline-none focus:ring-2 disabled:opacity-60"
            />
          ))}
        </div>
        {shownError && <p className="text-destructive text-sm">{shownError}</p>}
      </div>

      {/* Clerk can raise its Smart CAPTCHA while verifying the code too, and the
          details/email form (which also has this mount point) is unmounted by then. */}
      <div id="clerk-captcha" />

      <Button
        type="submit"
        size="lg"
        disabled={submitting || code.length !== LENGTH}
        className="h-12 rounded-full text-base"
      >
        {submitting ? <Loader2 className="size-4 animate-spin" /> : "Verify & continue"}
      </Button>

      <div className="text-muted-foreground flex items-center justify-between text-sm">
        <button type="button" onClick={onChangeEmail} className="underline underline-offset-2">
          Use a different email
        </button>
        <button
          type="button"
          disabled={cooldown > 0}
          onClick={resend}
          className="underline underline-offset-2 disabled:no-underline disabled:opacity-60"
        >
          {cooldown > 0 ? `Resend in ${cooldown}s` : "Resend code"}
        </button>
      </div>
    </form>
  );
}
