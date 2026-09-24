"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useSignUp } from "@clerk/nextjs";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { OtpStep } from "@/components/auth/otp-step";
import { RoleBanner } from "@/components/auth/auth-shell";
import { signUpFormSchema, type SignUpFormInput } from "@/lib/validation/user";
import { completeOnboarding } from "@/actions/users";
import { createShopDraft } from "@/actions/shops";

/**
 * Sign-up = essential details first (role, name, email, mobile, and shop name
 * for owners), then the emailed 6-digit code. The account is only created in
 * Clerk once the details validate; the database profile (and draft shop) is
 * written after the code is verified and the session is active.
 */
export function SignUpForm({ role: fixedRole }: { role: "buyer" | "shop_owner" }) {
  const router = useRouter();
  const { signUp } = useSignUp();
  const [step, setStep] = useState<"details" | "code">("details");
  const [details, setDetails] = useState<SignUpFormInput | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    watch,
    formState: { errors },
  } = useForm<SignUpFormInput>({
    resolver: zodResolver(signUpFormSchema),
    defaultValues: { role: fixedRole, name: "", email: "", phone: "", shopName: "" },
  });
  const role = watch("role");
  const isOwner = role === "shop_owner";

  async function startSignUp(values: SignUpFormInput) {
    setBusy(true);
    setError(null);
    const created = await signUp.create({ emailAddress: values.email });
    if (created.error) {
      console.error("Clerk signUp.create failed", created.error.code, created.error.longMessage ?? created.error.message);
      setBusy(false);
      setError(
        created.error.code === "form_identifier_exists"
          ? "An account with this email already exists. Sign in instead."
          : (created.error.longMessage ?? created.error.message)
      );
      return;
    }
    const sent = await signUp.verifications.sendEmailCode();
    setBusy(false);
    if (sent.error) {
      setError(sent.error.longMessage ?? sent.error.message);
      return;
    }
    setDetails(values);
    setStep("code");
  }

  async function verify(code: string) {
    if (!details) return;
    setBusy(true);
    setError(null);
    const { error: err } = await signUp.verifications.verifyEmailCode({ code });
    if (err) {
      setBusy(false);
      setError(err.longMessage ?? err.message);
      return;
    }
    if (signUp.status !== "complete") {
      // Clerk needs more fields than we collected (name split, and a
      // password since sign-in is email-code only). One combined `update`
      // call instead of two separate round trips — this is the step that
      // used to make verification visibly slow.
      const missing = signUp.missingFields ?? [];
      const patch: { firstName?: string; lastName?: string; password?: string } = {};
      if (missing.includes("first_name") || missing.includes("last_name")) {
        const [firstName, ...rest] = details.name.trim().split(/\s+/);
        patch.firstName = firstName;
        patch.lastName = rest.join(" ") || firstName;
      }
      if (missing.includes("password")) {
        // Unguessable password the user never needs to know or enter again.
        const bytes = crypto.getRandomValues(new Uint8Array(24));
        patch.password = "Cb1!" + Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
      }
      if (Object.keys(patch).length) await signUp.update(patch);
    }
    if (signUp.status !== "complete") {
      setBusy(false);
      const still = signUp.missingFields ?? [];
      console.error("Clerk sign-up incomplete", signUp.status, still);
      setError(
        still.length
          ? `Sign-up needs more info from Clerk (${still.join(", ")}). Disable these as required in the Clerk dashboard.`
          : "Could not complete sign-up. Please try again."
      );
      return;
    }
    await signUp.finalize({ navigate: () => {} });

    // Session is active now, so server actions can identify the user.
    // completeOnboarding (writes users/{uid}) and createShopDraft (writes a
    // shops/{id} keyed by ownerId) don't depend on each other — run them
    // together instead of one after another to cut a whole round trip off
    // this last, most latency-sensitive step.
    const isOwnerSignup = details.role === "shop_owner" && !!details.shopName;
    const [onboarded] = await Promise.all([
      completeOnboarding({ role: details.role, name: details.name, phone: details.phone }),
      isOwnerSignup ? createShopDraft({ name: details.shopName!, phone: details.phone }) : Promise.resolve({ ok: true as const }),
    ]);
    if (!onboarded.ok && onboarded.error !== "Role already set") {
      setBusy(false);
      setError(onboarded.error ?? "Could not save your details");
      return;
    }
    router.push(details.role === "shop_owner" ? "/shop/onboarding" : "/shops");
    router.refresh();
  }

  if (step === "code" && details) {
    return (
      <div>
        <OtpStep
          email={details.email}
          submitting={busy}
          error={error}
          onVerify={verify}
          onResend={async () => {
            const sent = await signUp.verifications.sendEmailCode();
            if (sent.error) setError(sent.error.longMessage ?? sent.error.message);
          }}
          onChangeEmail={() => {
            setStep("details");
            setError(null);
          }}
        />
      </div>
    );
  }

  return (
    <div>
      <form onSubmit={handleSubmit(startSignUp)} className="flex flex-col gap-5">
        <div>
          <h1 className="text-3xl font-black tracking-tight">
            {isOwner ? "Register your shop on CloseBy" : "Create your CloseBy account"}
          </h1>
          <p className="text-muted-foreground mt-1 text-sm">
            Tell us a little about you — we&apos;ll verify your email with a one-time code.
          </p>
        </div>

        <RoleBanner role={role} mode="signup" />

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="su-name">Full name</Label>
          <Input id="su-name" className="h-12 rounded-xl px-3" autoComplete="name" placeholder="e.g. Aman Kumar" {...register("name")} />
          {errors.name && <p className="text-destructive text-sm">{errors.name.message}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="su-email">Email</Label>
          <Input
            id="su-email"
            className="h-12 rounded-xl px-3"
            type="email"
            autoComplete="email"
            placeholder="you@example.com"
            {...register("email")}
          />
          {errors.email && <p className="text-destructive text-sm">{errors.email.message}</p>}
        </div>

        <div className="flex flex-col gap-1.5">
          <Label htmlFor="su-phone">Mobile number</Label>
          <Input
            id="su-phone"
            className="h-12 rounded-xl px-3"
            inputMode="numeric"
            autoComplete="tel-national"
            placeholder="9876543210"
            {...register("phone")}
          />
          {errors.phone && <p className="text-destructive text-sm">{errors.phone.message}</p>}
        </div>

        {isOwner && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="su-shop">Shop name</Label>
            <Input id="su-shop" className="h-12 rounded-xl px-3" placeholder="e.g. Sharma General Store" {...register("shopName")} />
            {errors.shopName && <p className="text-destructive text-sm">{errors.shopName.message}</p>}
            <p className="text-muted-foreground text-xs">
              Shop type, hours, location and inventory come next, right after you verify.
            </p>
          </div>
        )}

        {error && <p className="text-destructive text-sm">{error}</p>}

        {/* Mount point for Clerk's Smart CAPTCHA (bot sign-up protection). */}
        <div id="clerk-captcha" />

        <Button type="submit" size="lg" disabled={busy} className="h-12 rounded-full text-base">
          {busy ? <Loader2 className="size-4 animate-spin" /> : "Send verification code"}
        </Button>
        <p className="text-muted-foreground text-center text-sm">
          Already have an account?{" "}
          <Link href={`/sign-in?role=${role}`} className="text-foreground font-medium underline underline-offset-2">
            Sign in
          </Link>
        </p>
      </form>
    </div>
  );
}
