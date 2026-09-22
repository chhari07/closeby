"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSignIn } from "@clerk/nextjs";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OtpStep } from "@/components/auth/otp-step";
import { RoleBanner, type AuthRole } from "@/components/auth/auth-shell";
import { signUpFormSchema } from "@/lib/validation/user";

const emailSchema = signUpFormSchema.shape.email;

/** Passwordless sign-in: enter email, then the 6-digit code emailed to it. */
export function SignInForm({ role }: { role: AuthRole }) {
  const router = useRouter();
  const { signIn } = useSignIn();
  const [email, setEmail] = useState("");
  const [step, setStep] = useState<"email" | "code">("email");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function sendCode(e?: React.FormEvent) {
    e?.preventDefault();
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Enter a valid email address");
      return;
    }
    setBusy(true);
    setError(null);
    const { error: err } = await signIn.emailCode.sendCode({ emailAddress: parsed.data });
    setBusy(false);
    if (err) {
      setError(
        err.code === "form_identifier_not_found"
          ? "No account with this email. Create one first."
          : (err.longMessage ?? err.message)
      );
      return;
    }
    setEmail(parsed.data);
    setStep("code");
  }

  async function verify(code: string) {
    setBusy(true);
    setError(null);
    const { error: err } = await signIn.emailCode.verifyCode({ code });
    if (err) {
      setBusy(false);
      setError(err.longMessage ?? err.message);
      return;
    }
    if (signIn.status !== "complete") {
      setBusy(false);
      setError("Could not complete sign-in. Please try again.");
      return;
    }
    await signIn.finalize({ navigate: () => {} });
    // "/" sends signed-in users to their own home (dashboard or shops)
    // based on the role saved on their account.
    router.push("/");
    router.refresh();
  }

  if (step === "code") {
    return (
      <OtpStep
        email={email}
        submitting={busy}
        error={error}
        onVerify={verify}
        onResend={async () => {
          await sendCode();
        }}
        onChangeEmail={() => {
          setStep("email");
          setError(null);
        }}
      />
    );
  }

  return (
    <form onSubmit={sendCode} className="flex flex-col gap-5">
      <div>
        <h1 className="text-3xl font-black tracking-tight">Welcome back</h1>
        <p className="text-muted-foreground mt-1 text-sm">
          Sign in with a one-time code sent to your email.
        </p>
      </div>

      <RoleBanner role={role} mode="signin" />

      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          type="email"
          autoComplete="email"
          placeholder="you@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="h-12 rounded-xl px-3"
        />
        {error && <p className="text-destructive text-sm">{error}</p>}
      </div>

      {/* Mount point for Clerk's Smart CAPTCHA (bot protection). */}
      <div id="clerk-captcha" />

      <Button type="submit" size="lg" disabled={busy} className="h-12 rounded-full text-base">
        {busy ? <Loader2 className="size-4 animate-spin" /> : "Send code"}
      </Button>

      <p className="text-muted-foreground text-center text-sm">
        New to CloseBy?{" "}
        <Link
          href={`/sign-up?role=${role}`}
          className="text-foreground font-medium underline underline-offset-2"
        >
          Create an account
        </Link>
      </p>
    </form>
  );
}
